# Cuentas Claras

Sistema local de gestión financiera personal: ingresos, gastos, presupuestos,
metas de ahorro, deudas/cuentas y análisis.

Corre enteramente en esta PC. No usa ningún servicio en la nube: el servidor
es un proceso de Node.js y los datos se guardan en un PostgreSQL que corre en
esta misma máquina. Sin internet funciona igual (salvo la tipografía, que se
descarga de Google Fonts si hay conexión; si no, usa una tipografía del
sistema).

## Requisitos

- Node.js 22 o superior. Ya lo tenés instalado.
- PostgreSQL corriendo localmente (ya lo tenés instalado y como servicio,
  `postgresql-x64-18`).

## Configuración inicial (una sola vez)

1. Editá el archivo `.env` de esta carpeta y completá `PGPASSWORD` con la
   contraseña de tu usuario `postgres` (la que definiste al instalar
   PostgreSQL). El resto de los valores (`PGUSER=postgres`,
   `PGDATABASE=cuentas_claras`) ya están puestos.

2. Instalá la única dependencia (el driver de PostgreSQL), una sola vez:

   ```
   npm install
   ```

No hace falta crear ningún usuario ni base a mano: el servidor crea la base
`cuentas_claras` sola la primera vez que arranca, usando tu usuario
`postgres`.

El archivo `.env` no se comparte ni se sube a ningún lado — queda solo en tu
disco. Hay un `.env.example` de referencia por si necesitás recrearlo.

## Cómo usarlo (cada vez)

1. Verificá que el servicio de PostgreSQL esté corriendo (normalmente arranca
   solo con Windows; si no, iniciá el servicio `postgresql-x64-18` desde
   "Servicios").
2. Abrí una terminal en esta carpeta (`Escritorio\Finanzas`) y ejecutá:

   ```
   npm start
   ```

   (equivale a `node server.js`; usá esa segunda forma si `npm start` te da
   un error de "scripts deshabilitados" de PowerShell)

3. Se abre solo el navegador en `http://localhost:4500`. Si no se abre solo,
   entrá manualmente a esa dirección.
4. Para detener el servidor, volvé a la terminal y presioná `Ctrl+C`.

## Dónde están tus datos

En la base `cuentas_claras` de tu PostgreSQL local (no en un archivo suelto).

- **Backup**: `"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -U postgres -h localhost cuentas_claras > backup.sql`
- **Restaurar**: `"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost cuentas_claras < backup.sql`
- **Mudarte de PC**: instalá PostgreSQL en la otra máquina, restaurá el backup
  ahí, copiá la carpeta `Finanzas` (con su `.env` actualizado) y corré
  `npm start`.
- **Empezar de cero**: usá el botón "Borrar todos los datos" dentro de
  Ajustes (deja las tablas vacías, no hace falta tocar la base a mano).

## Estructura del proyecto

```
Finanzas/
  server.js          servidor Node (API + estáticos) + conexión a PostgreSQL
  package.json
  .env                credenciales de tu PostgreSQL local (no se comparte)
  .env.example        plantilla de referencia
  public/
    index.html
    style.css
    app.js
```

## Primer uso

La primera vez vas a ver datos de ejemplo (marcados con un aviso en la
pantalla) para que veas cómo funciona cada sección. Apenas cargues tu primer
movimiento real se borran solos; también podés borrarlos a mano con el botón
"Empezar de cero" del aviso.
