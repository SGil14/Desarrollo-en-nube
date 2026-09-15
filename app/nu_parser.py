"""Parser especifico para extractos de tarjeta Nu Colombia (PDF con texto real, sin contrasena).

La tabla de movimientos no tiene lineas de grilla (solo sombreado alterno), asi
que se lee como texto plano. pdfplumber separa el "dia + mes" y el "anio" de
cada fila en dos lineas distintas (a veces con el resto de la descripcion
pegado al anio, cuando el nombre del comercio no entra en una sola linea) -
por eso el parseo es linea por linea con una fila "en construccion", en vez de
una sola expresion regular sobre todo el texto aplanado.
"""
import re

MESES_ABR = {
    "ENE": "01", "FEB": "02", "MAR": "03", "ABR": "04", "MAY": "05", "JUN": "06",
    "JUL": "07", "AGO": "08", "SEP": "09", "OCT": "10", "NOV": "11", "DIC": "12",
}
MES_ALT = "|".join(MESES_ABR)

ROW_START_RE = re.compile(rf"^(\d{{1,2}})\s+({MES_ALT})(?:\s+(\d{{4}}))?\s*(.*)$")
YEAR_LINE_RE = re.compile(r"^(\d{4})\s*(.*)$")
STOP_RE = re.compile(
    r"^(Nu Financiera|Pago m[ií]nimo|¿Tienes preguntas|Fecha Descripci[oó]n"
    r"|La tasa de inter[eé]s|Nuestra tasa de inter[eé]s)",
    re.IGNORECASE,
)
DOLLAR_RE = re.compile(r"\$([\d.,]+)")
CUOTAS_RE = re.compile(r"\d+\s+de\s+\d+")
PERCENT_RE = re.compile(r"\d+[.,]\d+\s*%")


def parse_colombian_amount(raw: str) -> float | None:
    s = raw.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def parse_nu_statement_text(full_text: str) -> tuple[list[dict], int]:
    lines = [ln.strip() for ln in full_text.split("\n")]
    rows: list[dict] = []
    skipped = 0
    current: dict | None = None

    def finalize(cur: dict | None) -> None:
        nonlocal skipped
        if not cur or cur["year"] is None:
            return
        raw = " ".join(p for p in cur["parts"] if p)
        amounts = list(DOLLAR_RE.finditer(raw))
        if len(amounts) < 2:
            return
        desc = DOLLAR_RE.sub(" ", raw)
        desc = CUOTAS_RE.sub(" ", desc)
        desc = PERCENT_RE.sub(" ", desc)
        desc = re.sub(r"\s+", " ", desc).strip(" -")
        if not desc:
            return
        if re.match(r"^pago\b", desc, re.IGNORECASE):
            skipped += 1
            return
        amount = parse_colombian_amount(amounts[1].group(1))  # "Valor del mes"
        if not amount or amount <= 0:
            skipped += 1
            return
        date = f"{cur['year']}-{MESES_ABR[cur['month']]}-{int(cur['day']):02d}"
        rows.append({"date": date, "description": desc, "amount": amount})

    for line in lines:
        if not line or line.startswith("↪"):
            continue  # linea vacia o detalle de un abono (no es una compra)
        if STOP_RE.match(line):
            finalize(current)
            current = None
            continue  # fin de la tabla en ESTA pagina; puede haber mas paginas despues
        m = ROW_START_RE.match(line)
        if m:
            finalize(current)
            day, month, year, rest = m.group(1), m.group(2), m.group(3), m.group(4)
            current = {"day": day, "month": month, "year": year, "parts": [rest] if rest else []}
            continue
        ym = YEAR_LINE_RE.match(line)
        if ym and current is not None and current["year"] is None:
            current["year"] = ym.group(1)
            if ym.group(2):
                current["parts"].append(ym.group(2))
            continue
        if current is not None:
            current["parts"].append(line)
        # si no hay fila en construccion (encabezados, texto suelto), se ignora

    finalize(current)
    return rows, skipped
