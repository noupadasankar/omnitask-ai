"""Shopping domain, ported from apps/backend/src/shopping/ (product-scorer +
shopping-tracker + shopping-agent + shopping-preference + dto). Same 7 endpoints
and the frontend contract from services/shopping.service.ts, reverse-proxied at
/api/shopping.

Preferences are RECONCILED (like job): the Node get/save wrote nonexistent
columns and 500'd. The API shape follows the frontend ShoppingPreference; it maps
onto the real columns (preferredBrands->brands, maxPrice->maxBudget) with the rest
packed into the real `metadata` jsonb. The TrackedProduct half (evaluate/watch/
observe-price/products/stats) ports faithfully — those columns all exist.
"""

import math
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from db.session_db import (
    get_shopping_preference,
    list_tracked_products,
    observe_price,
    record_tracked_product,
    set_product_target_price,
    shopping_already_seen,
    shopping_stats,
    upsert_shopping_preference,
)
from http_api.auth import AuthedUser, require_user

router = APIRouter(prefix="/shopping", dependencies=[Depends(require_user)])

_WEIGHTS = {"price": 30, "rating": 25, "features": 25, "brand": 10, "category": 10, "avoid_penalty": -50}


def _js_round(x: float) -> int:
    return math.floor(x + 0.5)


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _haystack(p: dict) -> str:
    parts = [p.get("title"), p.get("brand"), p.get("description")]
    parts += p.get("features") or []
    return " ".join(x for x in parts if x).lower()


def _contains(haystack: str, keyword: str) -> bool:
    k = keyword.strip().lower()
    return len(k) > 0 and k in haystack


def _first_match(text: Optional[str], keywords: list) -> Optional[str]:
    t = (text or "").lower()
    for raw in keywords:
        k = raw.strip().lower()
        if k and k in t:
            return raw
    return None


def _score_product(product: dict, prefs: dict) -> dict:
    haystack = _haystack(product)
    reasons: list[str] = []
    breakdown: dict = {}
    score = 0

    avoid_hit = _first_match(haystack, prefs["avoidKeywords"])
    if avoid_hit:
        breakdown["avoid"] = _WEIGHTS["avoid_penalty"]
        score += _WEIGHTS["avoid_penalty"]
        reasons.append(f'Avoid keyword present: "{avoid_hit}" ({_WEIGHTS["avoid_penalty"]})')

    price = product.get("price")
    max_price = prefs["maxPrice"]
    if max_price and _is_number(price):
        if price > max_price:
            breakdown["price"] = -999
            reasons.append(f"Price {price} over budget {max_price} — disqualified")
            return {"score": score, "qualifies": False, "reasons": reasons, "breakdown": breakdown}
        headroom = (max_price - price) / max_price
        pts = _js_round((0.4 + 0.6 * headroom) * _WEIGHTS["price"])
        breakdown["price"] = pts
        score += pts
        reasons.append(f"Within budget ({price} ≤ {max_price}) (+{pts})")
    elif _is_number(price):
        breakdown["price"] = _js_round(_WEIGHTS["price"] * 0.4)
        score += breakdown["price"]
        reasons.append(f'Price known, no budget set (+{breakdown["price"]})')

    rating = product.get("rating")
    if _is_number(rating):
        if rating < prefs["minRating"]:
            breakdown["rating"] = -999
            reasons.append(f'Rating {rating} below floor {prefs["minRating"]} — disqualified')
            return {"score": score, "qualifies": False, "reasons": reasons, "breakdown": breakdown}
        span = max(0.0001, 5 - prefs["minRating"])
        pts = _js_round((rating - prefs["minRating"]) / span * _WEIGHTS["rating"])
        breakdown["rating"] = pts
        score += pts
        reasons.append(f'Rating {rating} ≥ {prefs["minRating"]} (+{pts})')

    features = prefs["mustHaveFeatures"]
    if features:
        matched = [f for f in features if _contains(haystack, f)]
        pts = _js_round(len(matched) / len(features) * _WEIGHTS["features"])
        if pts > 0:
            breakdown["features"] = pts
            score += pts
            reasons.append(f"Features {len(matched)}/{len(features)} (+{pts})")

    brand_hit = _first_match(f'{product.get("brand") or ""} {product.get("title") or ""}', prefs["preferredBrands"])
    if brand_hit:
        breakdown["brand"] = _WEIGHTS["brand"]
        score += _WEIGHTS["brand"]
        reasons.append(f'Preferred brand: "{brand_hit}" (+{_WEIGHTS["brand"]})')

    cat_hit = _first_match(haystack, prefs["categories"])
    if cat_hit:
        breakdown["category"] = _WEIGHTS["category"]
        score += _WEIGHTS["category"]
        reasons.append(f'Category match: "{cat_hit}" (+{_WEIGHTS["category"]})')

    qualifies = score >= prefs["minScore"] and not avoid_hit and (not _is_number(rating) or rating >= prefs["minRating"])
    return {"score": score, "qualifies": qualifies, "reasons": reasons, "breakdown": breakdown}


# ── Request models (frontend contract, not the stale backend DTO) ─────────────

class ShoppingPreferenceBody(BaseModel):
    categories: list[str] = []
    mustHaveFeatures: list[str] = []
    avoidKeywords: list[str] = []
    preferredBrands: list[str] = []
    maxPrice: Optional[float] = Field(default=None, gt=0)
    minRating: float = Field(default=4.0, ge=0, le=5)
    minScore: int = Field(default=60, ge=0, le=100)
    autoBuyLimit: float = Field(default=0, ge=0)


class ProductListingBody(BaseModel):
    model_config = {"extra": "allow"}  # mirrors the Zod .passthrough()
    site: str = Field(min_length=1)
    externalProductId: str = Field(min_length=1)
    title: str = Field(min_length=1)
    brand: Optional[str] = None
    url: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    rating: Optional[float] = None
    reviewCount: Optional[int] = None
    features: Optional[list[str]] = None
    description: Optional[str] = None


class EvaluateProductsBody(BaseModel):
    products: list[ProductListingBody] = Field(min_length=1)


class WatchProductBody(BaseModel):
    product: ProductListingBody
    targetPrice: Optional[float] = Field(default=None, gt=0)


class ObservePriceBody(BaseModel):
    trackedId: str = Field(min_length=1)
    price: float = Field(gt=0)
    dropPct: Optional[float] = Field(default=None, ge=0, le=100)


# ── evaluateBatch (ported from ShoppingAgentService.evaluateBatch) ────────────

async def _evaluate_batch(user_id: str, products: list[dict]) -> dict:
    pref = await get_shopping_preference(user_id)
    auto_buy_limit = pref["autoBuyLimit"] or 0

    qualified: list[dict] = []
    skipped: list[dict] = []
    duplicates = 0
    evaluated = 0
    best: Optional[dict] = None

    for product in products:
        if await shopping_already_seen(user_id, product["site"], product["externalProductId"]):
            duplicates += 1
            continue
        evaluated += 1
        match = _score_product(product, pref)
        if match["qualifies"]:
            price = product.get("price")
            under_auto_buy = auto_buy_limit > 0 and _is_number(price) and price <= auto_buy_limit
            status = "PENDING_APPROVAL" if under_auto_buy else "WATCHING"
        else:
            status = "SKIPPED"
        row = await record_tracked_product(
            user_id,
            site=product["site"],
            external_product_id=product["externalProductId"],
            title=product["title"],
            brand=product.get("brand"),
            url=product.get("url"),
            currency=product.get("currency"),
            price=product.get("price"),
            rating=product.get("rating"),
            score=match["score"],
            match_reasons=match["reasons"],
            status=status,
        )
        evaluation = {
            "product": product,
            "score": match["score"],
            "qualifies": match["qualifies"],
            "reasons": match["reasons"],
            "status": status,
            "trackedId": row["id"],
        }
        (qualified if match["qualifies"] else skipped).append(evaluation)
        if match["qualifies"] and (best is None or evaluation["score"] > best["score"]):
            best = evaluation

    return {"evaluated": evaluated, "duplicates": duplicates, "qualified": qualified, "skipped": skipped, "best": best}


async def _watch(user_id: str, product: dict, target_price: Optional[float]) -> dict:
    row = await record_tracked_product(
        user_id,
        site=product["site"],
        external_product_id=product["externalProductId"],
        title=product["title"],
        brand=product.get("brand"),
        url=product.get("url"),
        currency=product.get("currency"),
        price=product.get("price"),
        rating=product.get("rating"),
        score=0,
        match_reasons=[],
        status="WATCHING",
    )
    if target_price is not None:
        return await set_product_target_price(row["id"], target_price)
    return row


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/preferences")
async def get_preferences(user: AuthedUser = Depends(require_user)):
    return await get_shopping_preference(user.id)


@router.put("/preferences")
async def save_preferences(body: ShoppingPreferenceBody, user: AuthedUser = Depends(require_user)):
    metadata = {
        "mustHaveFeatures": body.mustHaveFeatures,
        "avoidKeywords": body.avoidKeywords,
        "minRating": body.minRating,
        "minScore": body.minScore,
        "autoBuyLimit": body.autoBuyLimit,
    }
    return await upsert_shopping_preference(
        user.id,
        categories=body.categories,
        preferred_brands=body.preferredBrands,
        max_price=body.maxPrice,
        metadata=metadata,
    )


@router.post("/evaluate")
async def evaluate(body: EvaluateProductsBody, user: AuthedUser = Depends(require_user)):
    return await _evaluate_batch(user.id, [p.model_dump() for p in body.products])


@router.post("/watch")
async def watch(body: WatchProductBody, user: AuthedUser = Depends(require_user)):
    return await _watch(user.id, body.product.model_dump(), body.targetPrice)


@router.post("/observe-price")
async def observe(body: ObservePriceBody, user: AuthedUser = Depends(require_user)):
    return await observe_price(body.trackedId, body.price, body.dropPct if body.dropPct is not None else 10)


@router.get("/products")
async def products(status: Optional[str] = None, user: AuthedUser = Depends(require_user)):
    return await list_tracked_products(user.id, status)


@router.get("/stats")
async def stats(user: AuthedUser = Depends(require_user)):
    return await shopping_stats(user.id)
