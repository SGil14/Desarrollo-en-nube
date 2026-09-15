"""Configuracion y carga de variables de entorno (.env) para Cuentas Claras."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DIR = ROOT / "public"

load_dotenv(ROOT / ".env")

PORT = int(os.environ.get("PORT", "4500"))

PG_HOST = os.environ.get("PGHOST", "localhost")
PG_PORT = int(os.environ.get("PGPORT", "5432"))
PG_DATABASE = os.environ.get("PGDATABASE", "cuentas_claras")
PG_USER = os.environ.get("PGUSER", "postgres")
PG_PASSWORD = os.environ.get("PGPASSWORD")

if not PG_PASSWORD:
    raise SystemExit(
        "\n  Falta configurar la base de datos.\n"
        "  Copia .env.example a .env (si todavia no existe) y completa PGPASSWORD\n"
        "  con la contrasena del usuario de PostgreSQL que creaste para esta app.\n"
    )

DEFAULT_EXPENSE_CATS = ["Vivienda", "Alimentación", "Transporte", "Salud", "Entretenimiento", "Servicios", "Educación", "Otros"]
DEFAULT_INCOME_CATS = ["Salario", "Independiente", "Inversiones", "Otros"]
