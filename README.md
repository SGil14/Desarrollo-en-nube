# Cuentas Claras

Sistema local de gestión financiera personal: ingresos, gastos, cuentas,
presupuestos, metas de ahorro, deudas y análisis.

Corre enteramente en esta PC. No usa ningún servicio en la nube: el backend es
una API en **FastAPI** (Python) y los datos se guardan en un PostgreSQL que
corre en esta misma máquina. Sin internet funciona igual (salvo la
tipografía, que se descarga de Google Fonts si hay conexión; si no, usa una
tipografía del sistema).

## Requisitos

- Python 3.10 o superior. Ya lo tenés instalado.
- PostgreSQL corriendo localmente (ya lo tenés instalado y como servicio,
  `postgresql-x64-18`).

## Configuración inicial (una sola vez)

1. Editá el archivo `.env` de esta carpeta y completá `PGPASSWORD` con la
   contraseña de tu usuario `postgres` (la que definiste al instalar
   PostgreSQL). El resto de los valores (`PGUSER=postgres`,
   `PGDATABASE=cuentas_claras`) ya están puestos.

2. Creá el entorno virtual e instalá las dependencias (una sola vez):

   ```
   python -m venv .venv
   .venv\Scripts\pip install -r requirements.txt
   ```

No hace falta crear ningún usuario ni base a mano: el servidor crea la base
`cuentas_claras` sola la primera vez que arranca, usando tu usuario
`postgres`.

El archivo `.env` no se comparte ni se sube a ningún lado — queda solo en tu
disco (está en `.gitignore`). Hay un `.env.example` de referencia por si
necesitás recrearlo.

## Cómo usarlo (cada vez)

1. Verificá que el servicio de PostgreSQL esté corriendo (normalmente arranca
   solo con Windows; si no, iniciá el servicio `postgresql-x64-18` desde
   "Servicios").
2. Abrí una terminal en esta carpeta (`Escritorio\Finanzas`) y ejecutá:

   ```
   .venv\Scripts\python run.py
   ```

3. Se abre solo el navegador en `http://localhost:4500`. Si no se abre solo,
   entrá manualmente a esa dirección.
4. Para detener el servidor, volvé a la terminal y presioná `Ctrl+C`.

La documentación interactiva de la API (generada automáticamente por
FastAPI) queda disponible en `http://localhost:4500/docs`.

## Dónde están tus datos

En la base `cuentas_claras` de tu PostgreSQL local (no en un archivo suelto).

- **Backup**: `"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -U postgres -h localhost cuentas_claras > backup.sql`
- **Restaurar**: `"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost cuentas_claras < backup.sql`
- **Mudarte de PC**: instalá PostgreSQL y Python en la otra máquina, restaurá
  el backup ahí, copiá la carpeta `Finanzas` (con su `.env` actualizado) y
  seguí los pasos de configuración inicial.
- **Empezar de cero**: usá el botón "Borrar todos los datos" dentro de
  Ajustes (deja las tablas vacías, no hace falta tocar la base a mano).

## Estructura del proyecto

```
Finanzas/
  run.py                punto de entrada: levanta uvicorn y abre el navegador
  requirements.txt
  .env                   credenciales de tu PostgreSQL local (no se comparte)
  .env.example           plantilla de referencia
  app/
    main.py               crea la app FastAPI, monta rutas y estaticos
    config.py             carga de .env y constantes
    db.py                 pool de conexion, esquema, migraciones, seed
    schemas.py             modelos Pydantic (validacion de requests)
    nu_parser.py           parser del extracto de tarjeta Nu Colombia (PDF)
    routers/
      state.py              GET /api/state (todo el estado de la app)
      transactions.py        movimientos (alta/edicion/borrado/bulk)
      accounts.py             cuentas
      budgets.py               presupuestos
      goals.py                  metas de ahorro
      debts.py                   deudas
      category_rules.py           reglas de categorizacion automatica
      settings.py                  moneda, categorias, borrado de datos
      imports.py                    importar extracto PDF de Nu
      exports.py                     exportar CSV
  public/                 frontend estatico (sin cambios)
    index.html
    style.css
    app.js
```

## Primer uso

La primera vez vas a ver datos de ejemplo (marcados con un aviso en la
pantalla) para que veas cómo funciona cada sección. Apenas cargues tu primer
movimiento real se borran solos; también podés borrarlos a mano con el botón
"Empezar de cero" del aviso.
