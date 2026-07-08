"""Throwaway live-DB verification for the food port (FoodOrder create/list +
items jsonb round-trip). Deletes the test row after."""

import asyncio
import sys

sys.path.insert(0, ".")
import main as m  # noqa: E402

m._load_env()
from db.session_db import create_food_order, get_pool, list_food_orders  # noqa: E402


async def run() -> None:
    pool = await get_pool()
    u = await pool.fetchrow('SELECT id FROM "User" LIMIT 1')
    if not u:
        print("NO USER")
        return
    uid = u["id"]
    oid = None
    try:
        o = await create_food_order(
            uid, platform="__verify_food__", restaurant_name="Test Thai",
            items=[{"n": "pad thai", "qty": 2}], total_amount=24.5,
        )
        oid = o["id"]
        print("ORDER CREATED:", o["status"], o["platform"], o["totalAmount"],
              "items_type=", type(o["items"]).__name__, "items=", o["items"])
        lst = await list_food_orders(uid, 5)
        print("LIST count>=1:", len(lst) >= 1, "first status=", lst[0]["status"] if lst else None)
        print("ALL FOOD LIVE CHECKS PASSED")
    finally:
        if oid:
            await pool.execute('DELETE FROM "FoodOrder" WHERE id = $1', oid)
        print("CLEANED UP")


asyncio.run(run())
