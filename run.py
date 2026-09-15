"""Punto de entrada: levanta la API (FastAPI) + el frontend estatico, y abre el navegador."""
import threading
import time
import webbrowser

import uvicorn

from app.config import PG_DATABASE, PG_HOST, PORT


def _open_browser_later(url: str) -> None:
    time.sleep(1.2)
    webbrowser.open(url)


def main() -> None:
    url = f"http://localhost:{PORT}"
    print()
    print("  Cuentas Claras corriendo en tu PC")
    print(f"  {url}")
    print(f"  Base de datos: PostgreSQL · {PG_DATABASE}@{PG_HOST}")
    print("  Documentacion interactiva de la API: " + url + "/docs")
    print("  Para detener el servidor: Ctrl+C")
    print()

    threading.Thread(target=_open_browser_later, args=(url,), daemon=True).start()
    uvicorn.run("app.main:app", host="0.0.0.0", port=PORT, log_level="info")


if __name__ == "__main__":
    main()
