from fastapi import APIRouter, HTTPException

from app import db
from app.db import uid
from app.schemas import GoalIn, GoalUpdate

router = APIRouter()


@router.post("/api/goals", status_code=201)
async def create_goal(body: GoalIn):
    goal_id = uid()
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO goals (id, name, target, current, target_date) VALUES ($1,$2,$3,$4,$5)",
            goal_id, body.name, body.target, body.current, body.targetDate,
        )
    return {"id": goal_id}


@router.put("/api/goals/{goal_id}")
async def update_goal(goal_id: str, body: GoalUpdate):
    async with db.pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM goals WHERE id = $1", goal_id)
        if not existing:
            raise HTTPException(404, "No existe")
        data = body.model_dump(exclude_unset=True)
        await conn.execute(
            "UPDATE goals SET name=$1, target=$2, current=$3, target_date=$4 WHERE id=$5",
            data.get("name", existing["name"]),
            data.get("target", existing["target"]),
            data.get("current", existing["current"]),
            data.get("targetDate", existing["target_date"]),
            goal_id,
        )
    return {"ok": True}


@router.delete("/api/goals/{goal_id}")
async def delete_goal(goal_id: str):
    async with db.pool.acquire() as conn:
        await conn.execute("DELETE FROM goals WHERE id = $1", goal_id)
    return {"ok": True}
