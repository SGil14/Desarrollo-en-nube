import io

import pdfplumber
from fastapi import APIRouter, HTTPException, Request

from app import db
from app.db import resolve_category_for_description
from app.nu_parser import parse_nu_statement_text

router = APIRouter()

MAX_PDF_BYTES = 20 * 1024 * 1024


@router.post("/api/import/nu-statement")
async def import_nu_statement(request: Request):
    body = await request.body()
    if not body:
        raise HTTPException(400, "Archivo vacío")
    if len(body) > MAX_PDF_BYTES:
        raise HTTPException(400, "Archivo demasiado grande")

    try:
        with pdfplumber.open(io.BytesIO(body)) as pdf:
            if len(pdf.pages) < 2:
                raise HTTPException(400, "El PDF no tiene páginas de movimientos reconocibles")
            # se salta la portada/resumen (pagina 1)
            pages_text = "\n".join((p.extract_text() or "") for p in pdf.pages[1:])
    except HTTPException:
        raise
    except Exception as err:
        message = str(err)
        if "password" in message.lower() or "encrypt" in message.lower():
            raise HTTPException(
                400,
                "El PDF tiene contraseña. Quitásela primero (ábrilo y guardalo/imprimilo como PDF sin contraseña) y volvé a intentar.",
            )
        raise HTTPException(400, f"No se pudo leer el PDF: {message}")

    if not pages_text.strip():
        raise HTTPException(400, "Este PDF no tiene texto real (parece ser una imagen escaneada) — no se puede leer automáticamente")

    rows, skipped = parse_nu_statement_text(pages_text)

    async with db.pool.acquire() as conn:
        rules = await conn.fetch("SELECT id, keyword, category FROM category_rules ORDER BY created_at ASC")
    rows_with_category = [{**r, "category": resolve_category_for_description(r["description"], rules)} for r in rows]

    return {"rows": rows_with_category, "skipped": skipped}
