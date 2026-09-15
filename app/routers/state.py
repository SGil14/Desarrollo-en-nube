from fastapi import APIRouter

from app import db

router = APIRouter()


def num(v):
    return None if v is None else float(v)


@router.get("/api/state")
async def get_state():
    async with db.pool.acquire() as conn:
        settings = await conn.fetchrow("SELECT value FROM settings WHERE key = 'app'")
        settings = settings["value"]

        tx_rows = await conn.fetch(
            "SELECT id, type, amount, category, description, account_id, to_char(date, 'YYYY-MM-DD') AS date "
            "FROM transactions ORDER BY date DESC, id DESC"
        )
        transactions = [
            {
                "id": r["id"], "type": r["type"], "amount": num(r["amount"]), "category": r["category"],
                "description": r["description"], "date": r["date"], "accountId": r["account_id"],
            }
            for r in tx_rows
        ]

        account_rows = await conn.fetch(
            """
            SELECT a.id, a.name, a.kind, a.starting_balance,
                a.starting_balance + COALESCE(SUM(CASE WHEN t.type='income' THEN t.amount
                                                        WHEN t.type IN ('expense','transfer') THEN -t.amount
                                                        ELSE 0 END), 0) AS balance
            FROM accounts a
            LEFT JOIN transactions t ON t.account_id = a.id
            GROUP BY a.id
            ORDER BY a.created_at ASC
            """
        )
        accounts = [
            {"id": r["id"], "name": r["name"], "kind": r["kind"], "startingBalance": num(r["starting_balance"]), "balance": num(r["balance"])}
            for r in account_rows
        ]

        budget_rows = await conn.fetch("SELECT category, limit_amount FROM budgets")
        budgets = {r["category"]: num(r["limit_amount"]) for r in budget_rows}

        goal_rows = await conn.fetch(
            "SELECT id, name, target, current, to_char(target_date, 'YYYY-MM-DD') AS target_date FROM goals"
        )
        goals = [
            {"id": r["id"], "name": r["name"], "target": num(r["target"]), "current": num(r["current"]), "targetDate": r["target_date"]}
            for r in goal_rows
        ]

        debt_rows = await conn.fetch(
            "SELECT id, name, kind, balance, due_day, min_payment, rate, to_char(last_payment_date, 'YYYY-MM-DD') AS last_payment_date "
            "FROM debts"
        )
        debts = [
            {
                "id": r["id"], "name": r["name"], "kind": r["kind"], "balance": num(r["balance"]),
                "dueDay": r["due_day"], "minPayment": num(r["min_payment"]), "rate": num(r["rate"]),
                "lastPaymentDate": r["last_payment_date"],
            }
            for r in debt_rows
        ]

        rule_rows = await conn.fetch("SELECT id, keyword, category FROM category_rules ORDER BY created_at ASC")
        category_rules = [{"id": r["id"], "keyword": r["keyword"], "category": r["category"]} for r in rule_rows]

    return {
        "currency": settings["currency"],
        "expenseCategories": settings["expenseCategories"],
        "incomeCategories": settings["incomeCategories"],
        "isExample": bool(settings.get("isExample")),
        "transactions": transactions,
        "budgets": budgets,
        "goals": goals,
        "debts": debts,
        "categoryRules": category_rules,
        "accounts": accounts,
    }
