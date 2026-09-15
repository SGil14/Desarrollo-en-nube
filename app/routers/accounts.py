from fastapi import APIRouter, HTTPException

from app import db
from app.db import uid
from app.schemas import AccountIn, AccountUpdate

router = APIRouter()


@router.post("/api/accounts", status_code=201)
async def create_account(body: AccountIn):
    account_id = uid()
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO accounts (id, name, kind, starting_balance) VALUES ($1,$2,$3,$4)",
            account_id, body.name, body.kind, body.startingBalance,
        )
    return {"id": account_id}


@router.put("/api/accounts/{account_id}")
async def update_account(account_id: str, body: AccountUpdate):
    async with db.pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM accounts WHERE id = $1", account_id)
        if not existing:
            raise HTTPException(404, "No existe")
        await conn.execute(
            "UPDATE accounts SET name=$1, kind=$2, starting_balance=$3 WHERE id=$4",
            body.name if body.name is not None else existing["name"],
            body.kind if body.kind is not None else existing["kind"],
            body.startingBalance if body.startingBalance is not None else existing["starting_balance"],
            account_id,
        )
    return {"ok": True}


@router.delete("/api/accounts/{account_id}")
async def delete_account(account_id: str):
    async with db.pool.acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM accounts")
        if count <= 1:
            raise HTTPException(400, "No podés borrar tu única cuenta. Creá otra antes de borrar esta.")
        await conn.execute("DELETE FROM accounts WHERE id = $1", account_id)
    return {"ok": True}
