'use strict';
/**
 * Cuentas Claras - servidor local.
 * Guarda todo en un PostgreSQL que corre en esta misma PC. No se envia nada
 * a ningun servidor externo. Las credenciales se leen de ".env" (nunca se
 * hardcodean aca).
 */
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { exec } = require('node:child_process');
const { Pool } = require('pg');
const { PDFParse } = require('pdf-parse');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

/* ------------------------------- .env ------------------------------- */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  content.split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  });
}
loadEnvFile(path.join(ROOT, '.env'));

const PORT = process.env.PORT || 4500;

if (!process.env.PGPASSWORD) {
  console.error('');
  console.error('  Falta configurar la base de datos.');
  console.error('  Copia .env.example a .env (si todavia no existe) y completa PGPASSWORD');
  console.error('  con la contraseña del usuario de PostgreSQL que creaste para esta app.');
  console.error('');
  process.exit(1);
}

const PG_HOST = process.env.PGHOST || 'localhost';
const PG_PORT = Number(process.env.PGPORT) || 5432;
const PG_DATABASE = process.env.PGDATABASE || 'cuentas_claras';
const PG_USER = process.env.PGUSER || 'postgres';
const PG_PASSWORD = process.env.PGPASSWORD;

async function ensureDatabaseExists() {
  const maintenance = new Pool({
    host: PG_HOST, port: PG_PORT, user: PG_USER, password: PG_PASSWORD, database: 'postgres'
  });
  try {
    const r = await maintenance.query('SELECT 1 FROM pg_database WHERE datname = $1', [PG_DATABASE]);
    if (r.rows.length === 0) {
      // No se puede parametrizar el nombre en CREATE DATABASE; se valida antes que sea un identificador simple.
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(PG_DATABASE)) throw new Error('Nombre de base inválido: ' + PG_DATABASE);
      await maintenance.query('CREATE DATABASE "' + PG_DATABASE + '"');
      console.log('  Base de datos "' + PG_DATABASE + '" creada.');
    }
  } finally {
    await maintenance.end();
  }
}

const pool = new Pool({
  host: PG_HOST,
  port: PG_PORT,
  database: PG_DATABASE,
  user: PG_USER,
  password: PG_PASSWORD
});

const DEFAULT_EXPENSE_CATS = ['Vivienda', 'Alimentación', 'Transporte', 'Salud', 'Entretenimiento', 'Servicios', 'Educación', 'Otros'];
const DEFAULT_INCOME_CATS = ['Salario', 'Independiente', 'Inversiones', 'Otros'];

function uid() { return crypto.randomUUID(); }

/* ---------------------------- esquema ---------------------------- */
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'banco',
      starting_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('income','expense')),
      amount NUMERIC(12,2) NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      date DATE NOT NULL
    );
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
    ALTER TABLE transactions ADD CONSTRAINT transactions_type_check CHECK (type IN ('income','expense','transfer'));
    CREATE TABLE IF NOT EXISTS budgets (
      category TEXT PRIMARY KEY,
      limit_amount NUMERIC(12,2) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target NUMERIC(12,2) NOT NULL,
      current NUMERIC(12,2) NOT NULL DEFAULT 0,
      target_date DATE
    );
    CREATE TABLE IF NOT EXISTS debts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('debt','account')),
      balance NUMERIC(12,2) NOT NULL,
      due_day INTEGER,
      min_payment NUMERIC(12,2) DEFAULT 0,
      rate NUMERIC(6,2) DEFAULT 0
    );
    ALTER TABLE debts ADD COLUMN IF NOT EXISTS last_payment_date DATE;
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS category_rules (
      id TEXT PRIMARY KEY,
      keyword TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  `);
}

async function getSettings() {
  const r = await pool.query('SELECT value FROM settings WHERE key = $1', ['app']);
  return r.rows.length ? r.rows[0].value : null;
}
async function saveSettings(obj) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('app', $1)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(obj)]
  );
}

async function seedExamples() {
  const now = new Date();
  function d(monthsAgo, day) {
    const dt = new Date(now.getFullYear(), now.getMonth() - monthsAgo, day);
    return dt.toISOString().slice(0, 10);
  }
  const checkingId = uid();
  const cashId = uid();
  await pool.query('INSERT INTO accounts (id, name, kind, starting_balance) VALUES ($1,$2,$3,$4)', [checkingId, 'Cuenta corriente', 'banco', 500]);
  await pool.query('INSERT INTO accounts (id, name, kind, starting_balance) VALUES ($1,$2,$3,$4)', [cashId, 'Efectivo', 'efectivo', 50]);

  const txs = [
    ['income', 1850, 'Salario', 'Sueldo mensual', d(0, 1)],
    ['income', 220, 'Independiente', 'Proyecto freelance', d(0, 6)],
    ['expense', 620, 'Vivienda', 'Alquiler', d(0, 2)],
    ['expense', 245, 'Alimentación', 'Supermercado', d(0, 8)],
    ['expense', 95, 'Transporte', 'Nafta + peajes', d(0, 10)],
    ['expense', 60, 'Entretenimiento', 'Salidas', d(0, 14)],
    ['expense', 110, 'Servicios', 'Luz, agua, internet', d(0, 5)],
    ['income', 1850, 'Salario', 'Sueldo mensual', d(1, 1)],
    ['expense', 620, 'Vivienda', 'Alquiler', d(1, 2)],
    ['expense', 210, 'Alimentación', 'Supermercado', d(1, 9)],
    ['expense', 150, 'Salud', 'Consulta médica', d(1, 17)],
    ['income', 1800, 'Salario', 'Sueldo mensual', d(2, 1)],
    ['expense', 600, 'Vivienda', 'Alquiler', d(2, 2)],
    ['expense', 260, 'Alimentación', 'Supermercado', d(2, 7)],
    ['expense', 80, 'Educación', 'Curso online', d(2, 20)]
  ];
  for (const t of txs) {
    await pool.query(
      'INSERT INTO transactions (id, type, amount, category, description, date, account_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [uid(), t[0], t[1], t[2], t[3], t[4], checkingId]
    );
  }
  const budgets = [['Vivienda', 650], ['Alimentación', 260], ['Transporte', 120], ['Entretenimiento', 80]];
  for (const b of budgets) {
    await pool.query('INSERT INTO budgets (category, limit_amount) VALUES ($1,$2)', b);
  }
  await pool.query(
    'INSERT INTO goals (id, name, target, current, target_date) VALUES ($1,$2,$3,$4,$5)',
    [uid(), 'Fondo de emergencia', 3000, 950, d(-6, 1)]
  );
  await pool.query(
    'INSERT INTO debts (id, name, kind, balance, due_day, min_payment, rate) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [uid(), 'Tarjeta de crédito', 'debt', 480, 10, 60, 65]
  );
}

async function ensureSeeded() {
  const settings = await getSettings();
  if (!settings) {
    await seedExamples();
    await saveSettings({
      currency: '$',
      expenseCategories: DEFAULT_EXPENSE_CATS,
      incomeCategories: DEFAULT_INCOME_CATS,
      isExample: true
    });
  }
}

async function ensureAccountsMigrated() {
  const accCount = (await pool.query('SELECT COUNT(*)::int AS c FROM accounts')).rows[0].c;
  if (accCount > 0) return; // ya hay cuentas, nada que hacer
  const txCount = (await pool.query('SELECT COUNT(*)::int AS c FROM transactions')).rows[0].c;
  if (txCount === 0) return; // base nueva: seedExamples crea sus propias cuentas
  const id = uid();
  await pool.query('INSERT INTO accounts (id, name, kind, starting_balance) VALUES ($1,$2,$3,$4)', [id, 'Cuenta principal', 'banco', 0]);
  await pool.query('UPDATE transactions SET account_id = $1 WHERE account_id IS NULL', [id]);
  console.log('  Se creó "Cuenta principal" y se le asignaron los movimientos existentes.');
}

async function wipeAllRows() {
  await pool.query('DELETE FROM transactions');
  await pool.query('DELETE FROM budgets');
  await pool.query('DELETE FROM goals');
  await pool.query('DELETE FROM debts');
  // las cuentas no se borran: son estructurales, como las categorías (se administran desde la vista Cuentas)
}

/* ------------------------------- lecturas ------------------------------- */
function num(v) { return v == null ? v : Number(v); }

async function getState() {
  const settings = await getSettings();
  const txRes = await pool.query('SELECT id, type, amount, category, description, account_id, to_char(date, \'YYYY-MM-DD\') AS date FROM transactions ORDER BY date DESC, id DESC');
  const transactions = txRes.rows.map(t => ({ id: t.id, type: t.type, amount: num(t.amount), category: t.category, description: t.description, date: t.date, accountId: t.account_id }));

  const accountRes = await pool.query(`
    SELECT a.id, a.name, a.kind, a.starting_balance,
      a.starting_balance + COALESCE(SUM(CASE WHEN t.type='income' THEN t.amount WHEN t.type IN ('expense','transfer') THEN -t.amount ELSE 0 END), 0) AS balance
    FROM accounts a
    LEFT JOIN transactions t ON t.account_id = a.id
    GROUP BY a.id
    ORDER BY a.created_at ASC
  `);
  const accounts = accountRes.rows.map(a => ({ id: a.id, name: a.name, kind: a.kind, startingBalance: num(a.starting_balance), balance: num(a.balance) }));

  const budgetRes = await pool.query('SELECT * FROM budgets');
  const budgets = {};
  for (const b of budgetRes.rows) budgets[b.category] = num(b.limit_amount);

  const goalRes = await pool.query('SELECT id, name, target, current, to_char(target_date, \'YYYY-MM-DD\') AS target_date FROM goals');
  const goals = goalRes.rows.map(g => ({ id: g.id, name: g.name, target: num(g.target), current: num(g.current), targetDate: g.target_date }));

  const debtRes = await pool.query('SELECT id, name, kind, balance, due_day, min_payment, rate, to_char(last_payment_date, \'YYYY-MM-DD\') AS last_payment_date FROM debts');
  const debts = debtRes.rows.map(dd => ({
    id: dd.id, name: dd.name, kind: dd.kind, balance: num(dd.balance),
    dueDay: dd.due_day, minPayment: num(dd.min_payment), rate: num(dd.rate), lastPaymentDate: dd.last_payment_date
  }));

  const ruleRes = await pool.query('SELECT id, keyword, category FROM category_rules ORDER BY created_at ASC');
  const categoryRules = ruleRes.rows;

  return {
    currency: settings.currency,
    expenseCategories: settings.expenseCategories,
    incomeCategories: settings.incomeCategories,
    isExample: !!settings.isExample,
    transactions, budgets, goals, debts, categoryRules, accounts
  };
}

function resolveCategoryForDescription(description, rules) {
  const desc = (description || '').toLowerCase();
  for (const r of rules) {
    if (r.keyword && desc.indexOf(r.keyword.toLowerCase()) > -1) return r.category;
  }
  return null;
}

/* -------------------------------- csv ----------------------------------- */
function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return '"' + s.replace(/"/g, '""') + '"';
}
async function transactionsCsv() {
  const r = await pool.query('SELECT type, amount, category, description, to_char(date, \'YYYY-MM-DD\') AS date FROM transactions ORDER BY date ASC');
  const lines = ['Fecha,Tipo,Categoría,Descripción,Monto'];
  for (const t of r.rows) {
    const typeLabel = t.type === 'income' ? 'Ingreso' : t.type === 'transfer' ? 'Transferencia' : 'Gasto';
    lines.push([t.date, typeLabel, csvEscape(t.category), csvEscape(t.description), num(t.amount)].join(','));
  }
  return lines.join('\r\n');
}
async function summaryCsv() {
  const r = await pool.query('SELECT type, amount, to_char(date, \'YYYY-MM\') AS month FROM transactions');
  const byMonth = {};
  for (const t of r.rows) {
    if (!byMonth[t.month]) byMonth[t.month] = { income: 0, expense: 0 };
    byMonth[t.month][t.type] += num(t.amount);
  }
  const months = Object.keys(byMonth).sort();
  const lines = ['Mes,Ingresos,Gastos,Ahorro'];
  for (const k of months) {
    const m = byMonth[k];
    lines.push([k, m.income.toFixed(2), m.expense.toFixed(2), (m.income - m.expense).toFixed(2)].join(','));
  }
  return lines.join('\r\n');
}

/* ---------------------- import: extracto tarjeta Nu ---------------------- */
const MESES_ABR = { ENE:'01', FEB:'02', MAR:'03', ABR:'04', MAY:'05', JUN:'06', JUL:'07', AGO:'08', SEP:'09', OCT:'10', NOV:'11', DIC:'12' };
const NU_DATE_RE = /(\d{1,2})\s+(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s+(\d{4})/g;

function parseColombianAmount(raw) {
  const s = String(raw).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseNuStatementText(fullText) {
  const flat = fullText.replace(/\s+/g, ' ').trim();
  const matches = [];
  let m;
  NU_DATE_RE.lastIndex = 0;
  while ((m = NU_DATE_RE.exec(flat)) !== null) {
    matches.push({ index: m.index, end: NU_DATE_RE.lastIndex, day: m[1], month: m[2], year: m[3] });
  }
  const rows = [];
  let skipped = 0;
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const chunkEnd = i + 1 < matches.length ? matches[i + 1].index : flat.length;
    const chunk = flat.slice(cur.end, chunkEnd);
    const dollarRe = /\$([\d.,]+)/g;
    const amounts = [];
    let dm;
    while ((dm = dollarRe.exec(chunk)) !== null) amounts.push({ raw: dm[1], index: dm.index });
    if (amounts.length < 2) continue; // no es una fila de transacción real
    const description = chunk.slice(0, amounts[0].index).replace(/\s+/g, ' ').trim();
    if (!description) continue;
    if (/^pago\b/i.test(description)) { skipped++; continue; } // abono a la tarjeta, no es un gasto
    const amount = parseColombianAmount(amounts[1].raw); // "Valor del mes": lo que realmente se factura este período
    if (!(amount > 0)) { skipped++; continue; }
    const date = cur.year + '-' + MESES_ABR[cur.month] + '-' + String(cur.day).padStart(2, '0');
    rows.push({ date, description, amount });
  }
  return { rows, skipped };
}

function readBinaryBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > maxBytes) { reject(new Error('Archivo demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* ------------------------------ utilidades ------------------------------- */
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function sendText(res, status, text, contentType, filename) {
  const body = Buffer.from(text, 'utf8');
  const headers = { 'Content-Type': (contentType || 'text/plain') + '; charset=utf-8', 'Content-Length': body.length };
  if (filename) headers['Content-Disposition'] = 'attachment; filename="' + filename + '"';
  res.writeHead(status, headers);
  res.end(body);
}
function sendError(res, status, message) { sendJson(res, status, { error: message }); }
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 5 * 1024 * 1024) { reject(new Error('Cuerpo demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png'
};
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { sendError(res, 403, 'Prohibido'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { sendError(res, 404, 'No encontrado'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': data.length });
    res.end(data);
  });
}

/* --------------------------------- rutas --------------------------------- */
async function handleApi(req, res, pathname) {
  const method = req.method;
  let m;

  if (method === 'GET' && pathname === '/api/state') {
    return sendJson(res, 200, await getState());
  }

  if (method === 'GET' && pathname === '/api/export/transactions.csv') {
    return sendText(res, 200, await transactionsCsv(), 'text/csv', 'movimientos.csv');
  }
  if (method === 'GET' && pathname === '/api/export/summary.csv') {
    return sendText(res, 200, await summaryCsv(), 'text/csv', 'resumen-mensual.csv');
  }

  if (method === 'POST' && pathname === '/api/accounts') {
    const b = await readJsonBody(req);
    if (!b.name || !b.kind) return sendError(res, 400, 'Datos incompletos');
    const id = uid();
    await pool.query('INSERT INTO accounts (id, name, kind, starting_balance) VALUES ($1,$2,$3,$4)', [id, b.name, b.kind, Number(b.startingBalance) || 0]);
    return sendJson(res, 201, { id });
  }
  m = pathname.match(/^\/api\/accounts\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (method === 'PUT') {
      const b = await readJsonBody(req);
      const existing = (await pool.query('SELECT * FROM accounts WHERE id = $1', [id])).rows[0];
      if (!existing) return sendError(res, 404, 'No existe');
      await pool.query(
        'UPDATE accounts SET name=$1, kind=$2, starting_balance=$3 WHERE id=$4',
        [b.name || existing.name, b.kind || existing.kind, b.startingBalance != null ? Number(b.startingBalance) : existing.starting_balance, id]
      );
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      const countRes = await pool.query('SELECT COUNT(*)::int AS c FROM accounts');
      if (countRes.rows[0].c <= 1) return sendError(res, 400, 'No podés borrar tu única cuenta. Creá otra antes de borrar esta.');
      await pool.query('DELETE FROM accounts WHERE id = $1', [id]);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (method === 'POST' && pathname === '/api/transactions') {
    const b = await readJsonBody(req);
    if (!b.type || !(b.amount > 0) || !b.category || !b.date) return sendError(res, 400, 'Datos incompletos');
    const id = uid();
    await pool.query(
      'INSERT INTO transactions (id, type, amount, category, description, date, account_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, b.type, Number(b.amount), b.category, b.description || '', b.date, b.accountId || null]
    );
    return sendJson(res, 201, { id });
  }

  if (method === 'POST' && pathname === '/api/import/nu-statement') {
    let buf;
    try {
      buf = await readBinaryBody(req, 20 * 1024 * 1024);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    if (!buf.length) return sendError(res, 400, 'Archivo vacío');
    let parser;
    try {
      parser = new PDFParse({ data: buf });
      const info = await parser.getInfo();
      if (info.total < 2) return sendError(res, 400, 'El PDF no tiene páginas de movimientos reconocibles');
      const textResult = await parser.getText();
      const pagesText = textResult.pages.slice(1).map(p => p.text).join('\n'); // se salta la portada/resumen
      if (!pagesText.replace(/\s/g, '').length) {
        return sendError(res, 400, 'Este PDF no tiene texto real (parece ser una imagen escaneada) — no se puede leer automáticamente');
      }
      const { rows, skipped } = parseNuStatementText(pagesText);
      const rulesRes = await pool.query('SELECT id, keyword, category FROM category_rules ORDER BY created_at ASC');
      const rules = rulesRes.rows;
      const rowsWithCategory = rows.map(r => ({ ...r, category: resolveCategoryForDescription(r.description, rules) }));
      return sendJson(res, 200, { rows: rowsWithCategory, skipped });
    } catch (err) {
      if (err.name === 'PasswordException' || /password/i.test(err.message || '')) {
        return sendError(res, 400, 'El PDF tiene contraseña. Quitásela primero (ábrilo y guardalo/imprimilo como PDF sin contraseña) y volvé a intentar.');
      }
      throw err;
    } finally {
      if (parser) await parser.destroy();
    }
  }

  if (method === 'POST' && pathname === '/api/transactions/bulk') {
    const b = await readJsonBody(req);
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return sendError(res, 400, 'Nada para importar');
    if (items.length > 5000) return sendError(res, 400, 'Demasiadas filas en un solo lote (máximo 5000)');
    for (const it of items) {
      if (!it || (it.type !== 'income' && it.type !== 'expense' && it.type !== 'transfer') || !(Number(it.amount) > 0) || !it.category || !it.date) {
        return sendError(res, 400, 'Hay filas con datos inválidos (tipo, monto, categoría o fecha)');
      }
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const it of items) {
        await client.query(
          'INSERT INTO transactions (id, type, amount, category, description, date, account_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [uid(), it.type, Number(it.amount), it.category, it.description || '', it.date, it.accountId || b.accountId || null]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return sendJson(res, 201, { inserted: items.length });
  }
  m = pathname.match(/^\/api\/transactions\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (method === 'PUT') {
      const b = await readJsonBody(req);
      const existing = (await pool.query('SELECT * FROM transactions WHERE id = $1', [id])).rows[0];
      if (!existing) return sendError(res, 404, 'No existe');
      await pool.query(
        'UPDATE transactions SET type=$1, amount=$2, category=$3, description=$4, date=$5, account_id=$6 WHERE id=$7',
        [b.type || existing.type, b.amount != null ? Number(b.amount) : existing.amount, b.category || existing.category,
         b.description != null ? b.description : existing.description, b.date || existing.date,
         b.accountId !== undefined ? (b.accountId || null) : existing.account_id, id]
      );
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      await pool.query('DELETE FROM transactions WHERE id = $1', [id]);
      return sendJson(res, 200, { ok: true });
    }
  }

  m = pathname.match(/^\/api\/budgets\/([^/]+)$/);
  if (m) {
    const category = decodeURIComponent(m[1]);
    if (method === 'PUT') {
      const b = await readJsonBody(req);
      if (!(b.limit > 0)) return sendError(res, 400, 'Límite inválido');
      await pool.query(
        `INSERT INTO budgets (category, limit_amount) VALUES ($1,$2)
         ON CONFLICT (category) DO UPDATE SET limit_amount = excluded.limit_amount`,
        [category, Number(b.limit)]
      );
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      await pool.query('DELETE FROM budgets WHERE category = $1', [category]);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (method === 'POST' && pathname === '/api/goals') {
    const b = await readJsonBody(req);
    if (!b.name || !(b.target > 0)) return sendError(res, 400, 'Datos incompletos');
    const id = uid();
    await pool.query(
      'INSERT INTO goals (id, name, target, current, target_date) VALUES ($1,$2,$3,$4,$5)',
      [id, b.name, Number(b.target), Number(b.current) || 0, b.targetDate || null]
    );
    return sendJson(res, 201, { id });
  }
  m = pathname.match(/^\/api\/goals\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (method === 'PUT') {
      const b = await readJsonBody(req);
      const existing = (await pool.query('SELECT * FROM goals WHERE id = $1', [id])).rows[0];
      if (!existing) return sendError(res, 404, 'No existe');
      await pool.query(
        'UPDATE goals SET name=$1, target=$2, current=$3, target_date=$4 WHERE id=$5',
        [b.name || existing.name, b.target != null ? Number(b.target) : existing.target,
         b.current != null ? Number(b.current) : existing.current,
         b.targetDate !== undefined ? b.targetDate : existing.target_date, id]
      );
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      await pool.query('DELETE FROM goals WHERE id = $1', [id]);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (method === 'POST' && pathname === '/api/debts') {
    const b = await readJsonBody(req);
    if (!b.name || b.balance == null || !b.kind) return sendError(res, 400, 'Datos incompletos');
    const id = uid();
    await pool.query(
      'INSERT INTO debts (id, name, kind, balance, due_day, min_payment, rate) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, b.name, b.kind, Number(b.balance), b.dueDay || null, Number(b.minPayment) || 0, Number(b.rate) || 0]
    );
    return sendJson(res, 201, { id });
  }
  m = pathname.match(/^\/api\/debts\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (method === 'PUT') {
      const b = await readJsonBody(req);
      const existing = (await pool.query('SELECT * FROM debts WHERE id = $1', [id])).rows[0];
      if (!existing) return sendError(res, 404, 'No existe');
      await pool.query(
        'UPDATE debts SET name=$1, kind=$2, balance=$3, due_day=$4, min_payment=$5, rate=$6, last_payment_date=$7 WHERE id=$8',
        [b.name || existing.name, b.kind || existing.kind, b.balance != null ? Number(b.balance) : existing.balance,
         b.dueDay !== undefined ? b.dueDay : existing.due_day, b.minPayment != null ? Number(b.minPayment) : existing.min_payment,
         b.rate != null ? Number(b.rate) : existing.rate,
         b.lastPaymentDate !== undefined ? b.lastPaymentDate : existing.last_payment_date, id]
      );
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      await pool.query('DELETE FROM debts WHERE id = $1', [id]);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (method === 'PUT' && pathname === '/api/settings') {
    const b = await readJsonBody(req);
    const current = await getSettings();
    const next = Object.assign({}, current, b);
    await saveSettings(next);
    return sendJson(res, 200, { ok: true });
  }

  if (method === 'POST' && pathname === '/api/category-rules') {
    const b = await readJsonBody(req);
    if (!b.keyword || !b.category) return sendError(res, 400, 'Datos incompletos');
    const id = uid();
    await pool.query('INSERT INTO category_rules (id, keyword, category) VALUES ($1,$2,$3)', [id, b.keyword.trim(), b.category]);
    return sendJson(res, 201, { id });
  }
  m = pathname.match(/^\/api\/category-rules\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (method === 'DELETE') {
      await pool.query('DELETE FROM category_rules WHERE id = $1', [id]);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (method === 'POST' && pathname === '/api/transactions/apply-rules') {
    const rulesRes = await pool.query('SELECT id, keyword, category FROM category_rules ORDER BY created_at ASC');
    const rules = rulesRes.rows;
    if (!rules.length) return sendJson(res, 200, { updated: 0 });
    const txRes = await pool.query('SELECT id, category, description FROM transactions');
    const updates = [];
    for (const t of txRes.rows) {
      const match = resolveCategoryForDescription(t.description, rules);
      if (match && match !== t.category) updates.push({ id: t.id, category: match });
    }
    if (updates.length) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const u of updates) {
          await client.query('UPDATE transactions SET category=$1 WHERE id=$2', [u.category, u.id]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
    return sendJson(res, 200, { updated: updates.length });
  }

  if (method === 'POST' && pathname === '/api/clear-examples') {
    const current = await getSettings();
    if (current.isExample) {
      await wipeAllRows();
      await saveSettings(Object.assign({}, current, { isExample: false }));
    }
    return sendJson(res, 200, { ok: true });
  }

  if (method === 'POST' && pathname === '/api/wipe') {
    await wipeAllRows();
    const current = await getSettings();
    await saveSettings(Object.assign({}, current, { isExample: false }));
    return sendJson(res, 200, { ok: true });
  }

  return sendError(res, 404, 'Ruta no encontrada');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURI(url.pathname);

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch(err => {
      console.error(err);
      sendError(res, err.status || 400, err.message || 'Error');
    });
    return;
  }
  serveStatic(req, res, pathname);
});

async function start() {
  try {
    await ensureDatabaseExists();
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('');
    console.error('  No se pudo conectar a PostgreSQL.');
    console.error('  Revisá que el servicio "postgresql-x64-18" esté corriendo y que');
    console.error('  los datos en .env (usuario, contraseña) sean correctos.');
    console.error('  Detalle: ' + err.message);
    console.error('');
    process.exit(1);
  }
  await initSchema();
  await ensureAccountsMigrated();
  await ensureSeeded();

  server.listen(PORT, () => {
    const url = 'http://localhost:' + PORT;
    console.log('');
    console.log('  Cuentas Claras corriendo en tu PC');
    console.log('  ' + url);
    console.log('  Base de datos: PostgreSQL · ' + (process.env.PGDATABASE || 'cuentas_claras') + '@' + (process.env.PGHOST || 'localhost'));
    console.log('  Para detener el servidor: Ctrl+C');
    console.log('');
    const openCmd = process.platform === 'win32' ? 'start "" "' + url + '"'
      : process.platform === 'darwin' ? 'open "' + url + '"'
      : 'xdg-open "' + url + '"';
    exec(openCmd, () => {});
  });
}

start();
