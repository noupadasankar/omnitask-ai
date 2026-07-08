"""Food domain — the Places-INDEPENDENT half, ported from apps/backend/src/food/
(recipe-engine + nutrition-analyzer + FoodOrder CRUD). The Places-dependent routes
(restaurants / availability / book) stay in the Node food controller because
PlacesService (Google Places/Yelp + PlaceBooking) is food-exclusive Node infra
with API keys — not reimplemented here. The Node reverse-proxy sends only
/food/recipe and /food/orders here (pathFilter); the rest stays in Node.

Recipe generation uses the shared LLM client (ai.py) with the identical
deterministic fallback; the nutrition analyzer's 800ms artificial delay is dropped.
"""

import base64
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ai import AIClient
from db.session_db import create_food_order, list_food_orders
from http_api.auth import AuthedUser, require_user

router = APIRouter(prefix="/food", dependencies=[Depends(require_user)])


class GenerateRecipeBody(BaseModel):
    ingredients: list[str] = Field(min_length=1)
    dietPreference: Optional[str] = Field(default=None, max_length=100)


class CreateOrderBody(BaseModel):
    platform: str = Field(min_length=1, max_length=100)
    restaurantName: str = Field(min_length=1, max_length=200)
    items: Any = None
    totalAmount: float = Field(gt=0)


# ── Recipe (LLM + fallback) + nutrition stub ─────────────────────────────────

def _fallback_recipe(ingredients: list[str]) -> dict:
    return {
        "title": "Healthy Ingredient Bowl",
        "prepTime": "10 mins",
        "cookTime": "15 mins",
        "ingredients": ingredients,
        "instructions": [
            "Wash and chop all ingredients thoroughly.",
            "Heat a pan with a small amount of oil.",
            "Add the ingredients and sauté for 10-12 minutes.",
            "Season with salt, pepper, and herbs to taste.",
            "Serve warm!",
        ],
    }


async def _generate_recipe(ingredients: list[str], diet: Optional[str]) -> dict:
    system = "You are a recipe generator. Respond ONLY with a JSON object."
    user = (
        f"Create a recipe using these ingredients: {', '.join(ingredients)}.\n"
        f"Dietary Preference: {diet or 'none'}\n"
        'Format: JSON object with "title" (string), "prepTime" (string), "cookTime" (string), '
        '"ingredients" (string array), and "instructions" (string array).'
    )
    result = await AIClient().extract_json(system, user)
    if isinstance(result, dict) and result:
        return result
    return _fallback_recipe(ingredients)


def _analyze_nutrition(recipe_title: str, ingredients: list[str]) -> dict:
    n = len(ingredients)
    return {
        "recipe": recipe_title,
        "calories": n * 120,
        "macronutrients": {
            "protein": f"{n * 4.5:.1f}g",
            "carbohydrates": f"{n * 15:.1f}g",
            "fat": f"{n * 3.2:.1f}g",
        },
        "source": "USDA FoodData Central API Stub",
    }


# ── Cursor helpers (base64url, no padding) ───────────────────────────────────

def _encode_cursor(row_id: str) -> str:
    return base64.urlsafe_b64encode(row_id.encode()).decode().rstrip("=")


def _decode_cursor(cursor: str) -> Optional[str]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        return base64.urlsafe_b64decode(padded.encode()).decode()
    except Exception:
        return None


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/recipe")
async def generate_recipe(body: GenerateRecipeBody, user: AuthedUser = Depends(require_user)):
    recipe = await _generate_recipe(body.ingredients, body.dietPreference)
    nutrition = _analyze_nutrition(recipe.get("title", ""), recipe.get("ingredients") or body.ingredients)
    return {"recipe": recipe, "nutrition": nutrition}


@router.get("/orders")
async def list_orders(
    cursor: Optional[str] = None,
    take: int = 20,
    user: AuthedUser = Depends(require_user),
):
    page_size = min(take, 100)
    decoded = _decode_cursor(cursor) if cursor else None
    items = await list_food_orders(user.id, page_size + 1, decoded)
    has_more = len(items) > page_size
    data = items[:page_size] if has_more else items
    last = data[-1] if data else None
    return {
        "data": data,
        "nextCursor": _encode_cursor(last["id"]) if (last and has_more) else None,
        "hasMore": has_more,
    }


@router.post("/orders")
async def create_order(body: CreateOrderBody, user: AuthedUser = Depends(require_user)):
    return await create_food_order(
        user.id,
        platform=body.platform,
        restaurant_name=body.restaurantName,
        items=body.items,
        total_amount=body.totalAmount,
    )
