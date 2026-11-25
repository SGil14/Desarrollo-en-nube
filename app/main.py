"""Cuentas Claras - API en FastAPI.

Los datos se guardan en PostgreSQL. En local es el contenedor "db" o tu
instalacion de Windows; en Azure es un Flexible Server administrado. Las
credenciales se leen del entorno (nunca se hardcodean aca).
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app import db
from app.config import PUBLIC_DIR
from app.routers import accounts, budgets, category_rules, debts, exports, goals, imports, settings, state, transactions


@asynccontextmanager
async def lifespan(app: FastAPI):
    # En Azure la base ya existe y el usuario de la app no puede crearla:
    # PG_AUTO_CREATE_DB=false desactiva ese intento.
    if os.getenv("PG_AUTO_CREATE_DB", "true").lower() != "false":
        await db.ensure_database_exists()

    # Sin try/except: si PostgreSQL no responde, la excepcion sube y queda en
    # los logs del contenedor. Un SystemExit aca hacia que Azure reiniciara la
    # revision en bucle sin dejar rastro del error real.
    await db.create_pool()
    async with db.pool.acquire() as conn:
        await conn.fetchval("SELECT 1")

    await db.init_schema()
    await db.ensure_accounts_migrated()
    await db.ensure_seeded()

    yield

    await db.close_pool()


app = FastAPI(title="Cuentas Claras API", lifespan=lifespan)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    # El frontend espera {"error": "..."} (contrato heredado del backend en Node), no el {"detail": "..."} por defecto de FastAPI.
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Idem para los 422 que genera Pydantic solo (datos con forma invalida en el body).
    first = exc.errors()[0]
    field = ".".join(str(p) for p in first["loc"] if p != "body")
    return JSONResponse(status_code=422, content={"error": f"{field}: {first['msg']}" if field else first["msg"]})


for router in (state.router, accounts.router, transactions.router, budgets.router, goals.router,
               debts.router, category_rules.router, settings.router, imports.router, exports.router):
    app.include_router(router)


# Sondas de salud. Deben declararse ANTES del mount de estaticos: el mount en
# "/" es un catch-all y se comeria estas rutas.
@app.get("/health/live", include_in_schema=False)
async def health_live():
    """El proceso responde. No toca la base."""
    return {"status": "ok"}


@app.get("/health/ready", include_in_schema=False)
async def health_ready():
    """El proceso responde Y la base contesta."""
    try:
        async with db.pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
    except Exception as err:
        return JSONResponse(status_code=503, content={"status": "not ready", "detail": str(err)})
    return {"status": "ok"}


# Se monta al final: las rutas /api/* y /health/* de arriba tienen prioridad
# sobre el catch-all de estaticos.
app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="public")
