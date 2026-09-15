from fastapi import APIRouter, HTTPException

from app import db
from app.db import uid
from app.schemas import DebtIn, DebtUpdate

router = APIRouter()


@router.post("/api/debts", status_code=201)
async def create_debt(body: DebtIn):
    debt_id = uid()
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO debts (id, name, kind, balance, due_day, min_payment, rate) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            debt_id, body.name, body.kind, body.balance, body.dueDay, body.minPayment or 0, body.rate or 0,
        )
    return {"id": debt_id}


@router.put("/api/debts/{debt_id}")
async def update_debt(debt_id: str, body: DebtUpdate):
    async with db.pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM debts WHERE id = $1", debt_id)
        if not existing:
            raise HTTPException(404, "No existe")
        data = body.model_dump(exclude_unset=True)
        await conn.execute(
            "UPDATE debts SET name=$1, kind=$2, balance=$3, due_day=$4, min_payment=$5, rate=$6, last_payment_date=$7 WHERE id=$8",
            data.get("name", existing["name"]),
            data.get("kind", existing["kind"]),
            data.get("balance", existing["balance"]),
            data.get("dueDay", existing["due_day"]),
            data.get("minPayment", existing["min_payment"]),
            data.get("rate", existing["rate"]),
            data.get("lastPaymentDate", existing["last_payment_date"]),
            debt_id,
        )
    return {"ok": True}


@router.delete("/api/debts/{debt_id}")
async def delete_debt(debt_id: str):
    async with db.pool.acquire() as conn:
        await conn.execute("DELETE FROM debts WHERE id = $1", debt_id)
    return {"ok": True}
