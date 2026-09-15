from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from app import db

router = APIRouter()


def csv_escape(v) -> str:
    s = "" if v is None else str(v)
    return '"' + s.replace('"', '""') + '"'


def num(v):
    return None if v is None else float(v)


async def _transactions_csv() -> str:
    async with db.pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT type, amount, category, description, to_char(date, 'YYYY-MM-DD') AS date "
            "FROM transactions ORDER BY date ASC"
        )
    lines = ["Fecha,Tipo,Categoría,Descripción,Monto"]
    for r in rows:
        type_label = "Ingreso" if r["type"] == "income" else "Transferencia" if r["type"] == "transfer" else "Gasto"
        lines.append(",".join([r["date"], type_label, csv_escape(r["category"]), csv_escape(r["description"]), str(num(r["amount"]))]))
    return "\r\n".join(lines)


async def _summary_csv() -> str:
    async with db.pool.acquire() as conn:
        rows = await conn.fetch("SELECT type, amount, to_char(date, 'YYYY-MM') AS month FROM transactions")
    by_month: dict[str, dict[str, float]] = {}
    for r in rows:
        m = by_month.setdefault(r["month"], {"income": 0.0, "expense": 0.0})
        if r["type"] in m:
            m[r["type"]] += float(r["amount"])
    lines = ["Mes,Ingresos,Gastos,Ahorro"]
    for month in sorted(by_month):
        m = by_month[month]
        lines.append(",".join([month, f"{m['income']:.2f}", f"{m['expense']:.2f}", f"{m['income'] - m['expense']:.2f}"]))
    return "\r\n".join(lines)


def _csv_response(text: str, filename: str) -> PlainTextResponse:
    return PlainTextResponse(
        text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/api/export/transactions.csv")
async def export_transactions_csv():
    return _csv_response(await _transactions_csv(), "movimientos.csv")


@router.get("/api/export/summary.csv")
async def export_summary_csv():
    return _csv_response(await _summary_csv(), "resumen-mensual.csv")
