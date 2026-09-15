"""Cuentas Claras - API en FastAPI.

Guarda todo en un PostgreSQL que corre en esta misma PC. No se envia nada a
ningun servidor externo. Las credenciales se leen de ".env" (nunca se
hardcodean aca).
"""
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
    try:
        await db.ensure_database_exists()
        await db.create_pool()
        async with db.pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
    except Exception as err:
        print("\n  No se pudo conectar a PostgreSQL.")
        print('  Revisá que el servicio "postgresql-x64-18" esté corriendo y que')
        print("  los datos en .env (usuario, contraseña) sean correctos.")
        print(f"  Detalle: {err}\n")
        raise SystemExit(1)

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

# Se monta al final: las rutas /api/* de arriba tienen prioridad sobre el catch-all de estaticos.
app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="public")
