from fastapi import APIRouter

from app import db
from app.schemas import BudgetIn

router = APIRouter()


@router.put("/api/budgets/{category}")
async def set_budget(category: str, body: BudgetIn):
    async with db.pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO budgets (category, limit_amount) VALUES ($1,$2)
               ON CONFLICT (category) DO UPDATE SET limit_amount = excluded.limit_amount""",
            category, body.limit,
        )
    return {"ok": True}


@router.delete("/api/budgets/{category}")
async def delete_budget(category: str):
    async with db.pool.acquire() as conn:
        await conn.execute("DELETE FROM budgets WHERE category = $1", category)
    return {"ok": True}
