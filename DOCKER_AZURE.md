# Ejecutar Cuentas Claras con Docker y Azure

## Arquitectura elegida

El frontend es HTML, CSS y JavaScript en `public/`: no necesita Node ni un
proceso de compilacion. `app/main.py` ya lo sirve con FastAPI y el navegador
llama a rutas relativas `/api/...`. Por eso backend y frontend van en una
misma imagen. Separarlos agregaria un servidor web y configuracion de
proxy/CORS sin aportar una ventaja necesaria para esta entrega.

| Componente | Docker local | Azure |
| --- | --- | --- |
| FastAPI + frontend | Servicio `app`, puerto 4500 | Azure Container Apps, puerto destino 4500 |
| PostgreSQL | Servicio `db`, volumen `postgres_data` | Azure Database for PostgreSQL Flexible Server |
| Acceso del navegador | http://localhost:4500 | HTTPS asignado por Azure |

Si la clase exige que tambien la base sea un contenedor en Azure, se puede
usar una VM Linux con Docker Compose y disco persistente. La opcion de
Container Apps descrita aqui usa PostgreSQL administrado.

## 1. Probar en Windows con Docker Desktop

Abre Docker Desktop con contenedores Linux. En PowerShell, entra a la raiz
del proyecto (donde estan Dockerfile y compose.yaml).

Si no tienes `.env`, crealo:

```powershell
Copy-Item .env.example .env
notepad .env
```

Si ya existe, editalo sin reemplazarlo. Completa `PGPASSWORD` con una
contraseña propia. Para valores con `$` o `#`, usa comillas simples en `.env`.
Compose usa `PGHOST=db` dentro del contenedor aunque tu `.env` diga localhost.

```powershell
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
```

Abre http://localhost:4500 y http://localhost:4500/docs.

```powershell
Invoke-RestMethod http://localhost:4500/health/ready
Invoke-RestMethod http://localhost:4500/api/state
```

La primera consulta debe devolver `status: ok`. La segunda devuelve el estado
de la aplicacion. Crea un movimiento de prueba, ejecuta `docker compose down`,
inicia de nuevo con `docker compose up -d` y confirma que sigue apareciendo.
`down` conserva los datos; **`down -v` elimina el volumen y sus datos**.

Para reconstruir despues de modificar el codigo:

```powershell
docker compose up -d --build
```

No necesitas instalar Python o PostgreSQL en Windows. El puerto de PostgreSQL
no se publica. Esta base es nueva: no copia los datos de tu PostgreSQL local.
La imagen utiliza un usuario sin privilegios y no contiene `.env`.

## 2. Preparar Azure

Necesitas una suscripcion con permisos para crear recursos, Azure CLI y una
region habilitada para tu cuenta. Los recursos pueden generar cargos:
revisa los precios y el credito de tu suscripcion antes de crearlos.

En el portal crea un grupo dedicado, por ejemplo `rg-cuentas-claras-clase`.
Usa la misma region para todos los recursos cuando sea posible.

### PostgreSQL

1. Crea **Azure Database for PostgreSQL Flexible Server** en ese grupo.
2. Escoge un tamaño de desarrollo disponible para tu suscripcion y configura
   usuario y contraseña. Guarda el hostname completo `....postgres.database.azure.com`.
3. En Bases de datos, crea `cuentas_claras`. La app creara tablas y datos de
   ejemplo, pero en Azure no intentara crear la base ni conectarse a `postgres`.
4. Configura conectividad entre Container Apps y PostgreSQL. Para una demo con
   acceso publico, limita las reglas de firewall a las IP de salida del entorno
   de Container Apps; revisalas despues de cambios de infraestructura. Para
   una red privada, ambos servicios deben tener conectividad VNet y DNS.
   Evita abrir PostgreSQL a todo Internet. Si aun no tienes el entorno de
   Container Apps, crealo primero para configurar esta conectividad.
5. Conserva TLS habilitado. El usuario de la app debe poder crear tablas y
   leer/escribir dentro de `cuentas_claras`.

### Construir y subir la imagen

Crea un **Azure Container Registry** con un nombre globalmente unico,
SKU Basic y permisos RBAC convencionales para simplificar la demo. Desde
PowerShell, en la raiz del proyecto:

```powershell
az login
$ResourceGroup = "rg-cuentas-claras-clase"
$Registry = "REEMPLAZAR_POR_NOMBRE_DE_TU_ACR"
az acr build --registry $Registry --image cuentas-claras:v1 .
```

Este comando construye en Azure usando el Dockerfile. No sube `.env` al
contexto gracias a `.dockerignore`. Copia el servidor de inicio de sesion
del registro que muestra el portal; no presupongas su hostname.

### Crear Container App

1. Crea una **Container App** en el grupo y entorno elegidos.
2. Selecciona tu registro y la imagen `cuentas-claras:v1`. Configura una
   identidad administrada con permiso `AcrPull` sobre el registro para descargar
   la imagen. Si usas un registro con ABAC, configura su rol de lectura de
   repositorios equivalente. Usa la misma identidad en la configuracion del registro.
3. Antes de arrancar la revision, crea un secreto llamado `pg-password` con
   la contraseña y configura estas variables de entorno:

| Variable | Valor |
| --- | --- |
| `PGHOST` | Hostname completo del servidor PostgreSQL |
| `PGPORT` | `5432` |
| `PGDATABASE` | `cuentas_claras` |
| `PGUSER` | Usuario PostgreSQL configurado |
| `PGPASSWORD` | Referencia al secreto `pg-password` |
| `PGSSLMODE` | `verify-full` |
| `PG_AUTO_CREATE_DB` | `false` |

4. Habilita ingress HTTP externo, puerto destino **4500**, solo HTTPS.
5. Para la clase, usa 0.5 CPU / 1 GiB, minimo 1 y maximo 1 replica y modo de
   revision unica. El arranque actual crea esquema y datos de ejemplo; no
   escales ni ejecutes varios workers sin antes hacer ese proceso seguro ante
   concurrencia. La aplicacion no necesita volumen: los datos estan en PostgreSQL.
6. Configura probes HTTP en el puerto 4500: startup y liveness en
   `/health/live`, readiness en `/health/ready`. Para startup permite hasta
   120 segundos (por ejemplo, periodo 5 segundos y umbral de fallos 24).
   Azure requiere configurar sus probes; no presupongas que importa el
   HEALTHCHECK del Dockerfile.
7. Verifica el firewall de PostgreSQL, guarda la revision y abre la URL HTTPS.
   Comprueba `/health/ready`, `/docs` y crea un movimiento desde el frontend.

**La aplicacion original no tiene autenticacion y permite modificar/borrar
datos. Usa datos ficticios para la demo. Para restringir el acceso, configura
Authentication de Container Apps con Microsoft Entra ID antes de cargar datos
reales.** Dockerizar no agrega aislamiento entre usuarios de la aplicacion.

El puerto interno es fijo (4500); `PORT` en Compose solo cambia el puerto
publicado de tu PC. `run.py` se conserva para uso local, pero Docker ejecuta
Uvicorn directamente y no intenta abrir un navegador.

## 3. Diagnostico

| Sintoma | Revisar |
| --- | --- |
| Falta PGPASSWORD | Crear/editar `.env` local o referencia al secreto en Azure |
| Connection refused / timeout | Host, puerto, firewall, VNet/DNS y estado de PostgreSQL |
| Database does not exist | Crear `cuentas_claras` en Azure |
| Password authentication failed | Usuario/contraseña; en Compose las variables inicializan solo un volumen nuevo |
| Certificado TLS invalido | Hostname completo y certificados CA vigentes; no desactivar la validacion |
| Revision no inicia | Logs del contenedor y permiso para descargar desde ACR |
| Puerto local ocupado | Cambiar `PORT=4501` en `.env` y abrir localhost:4501 |

Cambiar la contraseña en `.env` no cambia la contraseña de un PostgreSQL ya
inicializado. Actualizala en la base o usa sus credenciales originales.

Al terminar la clase, elimina los recursos de prueba que ya no necesites
desde el grupo dedicado, previa copia de los datos que quieras conservar.

## Validacion y fuentes

En el entorno de preparacion no hay Docker ni acceso a tu suscripcion Azure.
La construccion real, conexion a PostgreSQL y pruebas de persistencia quedan
pendientes de ejecutar con los pasos anteriores.

Se verificaron cuatro pruebas de configuracion (TLS, omitir creacion de base,
parametros del pool y readiness sin base), la lectura del YAML y las respuestas
HTTP del frontend, `/docs` y liveness sin iniciar la conexion real a PostgreSQL.
Para repetir las pruebas de configuracion con las dependencias instaladas:

```powershell
python -m unittest discover -s tests -v
```

- [Construir y desplegar contenedores desde codigo en Azure](https://learn.microsoft.com/en-us/azure/container-apps/quickstart-code-to-cloud)
- [TLS para Azure Database for PostgreSQL](https://learn.microsoft.com/en-us/azure/postgresql/security/security-tls)
