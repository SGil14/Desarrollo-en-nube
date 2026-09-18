"""Acceso a datos: pool de conexion, esquema, migraciones y datos de ejemplo."""
import json
import re
import uuid
from datetime import date

import asyncpg

from app.config import DEFAULT_EXPENSE_CATS, DEFAULT_INCOME_CATS, PG_DATABASE, PG_HOST, PG_PASSWORD, PG_PORT, PG_USER

pool: asyncpg.Pool | None = None


def uid() -> str:
    return str(uuid.uuid4())


async def _init_connection(conn: asyncpg.Connection) -> None:
    # asyncpg no decodifica json/jsonb a dict por defecto: le agregamos el codec.
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    await conn.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def ensure_database_exists() -> None:
    conn = await asyncpg.connect(host=PG_HOST, port=PG_PORT, user=PG_USER, password=PG_PASSWORD, database="postgres")
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", PG_DATABASE)
        if not exists:
            if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", PG_DATABASE):
                raise ValueError(f"Nombre de base invalido: {PG_DATABASE}")
            await conn.execute(f'CREATE DATABASE "{PG_DATABASE}"')
            print(f'  Base de datos "{PG_DATABASE}" creada.')
    finally:
        await conn.close()


async def create_pool() -> asyncpg.Pool:
    global pool
    pool = await asyncpg.create_pool(
        host=PG_HOST, port=PG_PORT, user=PG_USER, password=PG_PASSWORD, database=PG_DATABASE,
        init=_init_connection,
    )
    return pool


async def close_pool() -> None:
    if pool is not None:
        await pool.close()


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'banco',
    starting_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
    amount NUMERIC(12,2) NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS budgets (
    category TEXT PRIMARY KEY,
    limit_amount NUMERIC(12,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    target NUMERIC(12,2) NOT NULL,
    current NUMERIC(12,2) NOT NULL DEFAULT 0,
    target_date DATE
);
CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('debt','account')),
    balance NUMERIC(12,2) NOT NULL,
    due_day INTEGER,
    min_payment NUMERIC(12,2) DEFAULT 0,
    rate NUMERIC(6,2) DEFAULT 0,
    last_payment_date DATE
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS category_rules (
    id TEXT PRIMARY KEY,
    keyword TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
"""


async def init_schema() -> None:
    async with pool.acquire() as conn:
        await conn.execute(SCHEMA_SQL)


async def get_settings() -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT value FROM settings WHERE key = 'app'")
        return None if row is None else row["value"]


async def save_settings(obj: dict) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO settings (key, value) VALUES ('app', $1)
               ON CONFLICT (key) DO UPDATE SET value = excluded.value""",
            obj,
        )


async def seed_examples() -> None:
    today = date.today()

    def d(months_ago: int, day: int) -> date:
        year = today.year
        month = today.month - months_ago
        while month <= 0:
            month += 12
            year -= 1
        return date(year, month, day)

    async with pool.acquire() as conn:
        checking_id, cash_id = uid(), uid()
        await conn.execute(
            "INSERT INTO accounts (id, name, kind, starting_balance) VALUES ($1,$2,$3,$4)",
            checking_id, "Cuenta corriente", "banco", 500,
        )
        await conn.execute(
            "INSERT INTO accounts (id, name, kind, starting_balance) VALUES ($1,$2,$3,$4)",
            cash_id, "Efectivo", "efectivo", 50,
        )

        txs = [
            ("income", 1850, "Salario", "Sueldo mensual", d(0, 1)),
            ("income", 220, "Independiente", "Proyecto freelance", d(0, 6)),
            ("expense", 620, "Vivienda", "Alquiler", d(0, 2)),
            ("expense", 245, "Alimentación", "Supermercado", d(0, 8)),
            ("expense", 95, "Transporte", "Nafta + peajes", d(0, 10)),
            ("expense", 60, "Entretenimiento", "Salidas", d(0, 14)),
            ("expense", 110, "Servicios", "Luz, agua, internet", d(0, 5)),
            ("income", 1850, "Salario", "Sueldo mensual", d(1, 1)),
            ("expense", 620, "Vivienda", "Alquiler", d(1, 2)),
            ("expense", 210, "Alimentación", "Supermercado", d(1, 9)),
            ("expense", 150, "Salud", "Consulta médica", d(1, 17)),
            ("income", 1800, "Salario", "Sueldo mensual", d(2, 1)),
            ("expense", 600, "Vivienda", "Alquiler", d(2, 2)),
            ("expense", 260, "Alimentación", "Supermercado", d(2, 7)),
            ("expense", 80, "Educación", "Curso online", d(2, 20)),
        ]
        for t_type, amount, category, description, tx_date in txs:
            await conn.execute(
                "INSERT INTO transactions (id, type, amount, category, description, date, account_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                uid(), t_type, amount, category, description, tx_date, checking_id,
            )

        budgets = [("Vivienda", 650), ("Alimentación", 260), ("Transporte", 120), ("Entretenimiento", 80)]
        for category, limit in budgets:
            await conn.execute(
                "INSERT INTO budgets (category, limit_amount) VALUES ($1,$2) ON CONFLICT (category) DO NOTHING",
                category, limit,
            )

        await conn.execute(
            "INSERT INTO goals (id, name, target, current, target_date) VALUES ($1,$2,$3,$4,$5)",
            uid(), "Fondo de emergencia", 3000, 950, d(-6, 1),
        )
        await conn.execute(
            "INSERT INTO debts (id, name, kind, balance, due_day, min_payment, rate) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            uid(), "Tarjeta de crédito", "debt", 480, 10, 60, 65,
        )


async def ensure_seeded() -> None:
    settings = await get_settings()
    if settings:
        return

    async with pool.acquire() as conn:
        already = await conn.fetchval("SELECT COUNT(*) FROM budgets")

    if already == 0:
        await seed_examples()

    await save_settings({
        "currency": "$",
        "expenseCategories": DEFAULT_EXPENSE_CATS,
        "incomeCategories": DEFAULT_INCOME_CATS,
        "isExample": True,
    })


async def ensure_accounts_migrated() -> None:
    async with pool.acquire() as conn:
        acc_count = await conn.fetchval("SELECT COUNT(*) FROM accounts")
        if acc_count > 0:
            return
        tx_count = await conn.fetchval("SELECT COUNT(*) FROM transactions")
        if tx_count == 0:
            return
        account_id = uid()
        await conn.execute(
            "INSERT INTO accounts (id, name, kind, starting_balance) VALUES ($1,$2,$3,$4)",
            account_id, "Cuenta principal", "banco", 0,
        )
        await conn.execute("UPDATE transactions SET account_id = $1 WHERE account_id IS NULL", account_id)
        print('  Se creó "Cuenta principal" y se le asignaron los movimientos existentes.')


async def wipe_all_rows() -> None:
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM transactions")
        await conn.execute("DELETE FROM budgets")
        await conn.execute("DELETE FROM goals")
        await conn.execute("DELETE FROM debts")
        # las cuentas no se borran: son estructurales (se administran desde la vista Cuentas)


def resolve_category_for_description(description: str | None, rules: list) -> str | None:
    desc = (description or "").lower()
    for r in rules:
        keyword = r["keyword"]
        if keyword and keyword.lower() in desc:
            return r["category"]
    return None
