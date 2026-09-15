from fastapi import APIRouter

from app import db
from app.db import resolve_category_for_description, uid
from app.schemas import CategoryRuleIn

router = APIRouter()


@router.post("/api/category-rules", status_code=201)
async def create_category_rule(body: CategoryRuleIn):
    rule_id = uid()
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO category_rules (id, keyword, category) VALUES ($1,$2,$3)",
            rule_id, body.keyword.strip(), body.category,
        )
    return {"id": rule_id}


@router.delete("/api/category-rules/{rule_id}")
async def delete_category_rule(rule_id: str):
    async with db.pool.acquire() as conn:
        await conn.execute("DELETE FROM category_rules WHERE id = $1", rule_id)
    return {"ok": True}


@router.post("/api/transactions/apply-rules")
async def apply_rules_to_existing():
    async with db.pool.acquire() as conn:
        rules = await conn.fetch("SELECT id, keyword, category FROM category_rules ORDER BY created_at ASC")
        if not rules:
            return {"updated": 0}
        txs = await conn.fetch("SELECT id, category, description FROM transactions")
        updates = []
        for t in txs:
            match = resolve_category_for_description(t["description"], rules)
            if match and match != t["category"]:
                updates.append((t["id"], match))
        if updates:
            async with conn.transaction():
                for tx_id, category in updates:
                    await conn.execute("UPDATE transactions SET category=$1 WHERE id=$2", category, tx_id)
    return {"updated": len(updates)}
