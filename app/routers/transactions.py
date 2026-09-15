from fastapi import APIRouter, HTTPException

from app import db
from app.db import uid
from app.schemas import TransactionIn, TransactionsBulkIn, TransactionUpdate

router = APIRouter()


@router.post("/api/transactions", status_code=201)
async def create_transaction(body: TransactionIn):
    tx_id = uid()
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO transactions (id, type, amount, category, description, date, account_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            tx_id, body.type, body.amount, body.category, body.description or "", body.date, body.accountId,
        )
    return {"id": tx_id}


@router.post("/api/transactions/bulk", status_code=201)
async def bulk_create_transactions(body: TransactionsBulkIn):
    items = body.items
    if not items:
        raise HTTPException(400, "Nada para importar")
    if len(items) > 5000:
        raise HTTPException(400, "Demasiadas filas en un solo lote (máximo 5000)")

    async with db.pool.acquire() as conn:
        async with conn.transaction():
            for it in items:
                await conn.execute(
                    "INSERT INTO transactions (id, type, amount, category, description, date, account_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                    uid(), it.type, it.amount, it.category, it.description or "", it.date, it.accountId or body.accountId,
                )
    return {"inserted": len(items)}


@router.put("/api/transactions/{tx_id}")
async def update_transaction(tx_id: str, body: TransactionUpdate):
    async with db.pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM transactions WHERE id = $1", tx_id)
        if not existing:
            raise HTTPException(404, "No existe")
        data = body.model_dump(exclude_unset=True)
        await conn.execute(
            "UPDATE transactions SET type=$1, amount=$2, category=$3, description=$4, date=$5, account_id=$6 WHERE id=$7",
            data.get("type", existing["type"]),
            data.get("amount", existing["amount"]),
            data.get("category", existing["category"]),
            data.get("description", existing["description"]),
            data.get("date", existing["date"]),
            data.get("accountId", existing["account_id"]),
            tx_id,
        )
    return {"ok": True}


@router.delete("/api/transactions/{tx_id}")
async def delete_transaction(tx_id: str):
    async with db.pool.acquire() as conn:
        await conn.execute("DELETE FROM transactions WHERE id = $1", tx_id)
    return {"ok": True}
