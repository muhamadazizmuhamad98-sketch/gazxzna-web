const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbPath = path.join(__dirname, "..", "data", "gazxana.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS debtors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debtor_id INTEGER NOT NULL REFERENCES debtors(id) ON DELETE CASCADE,
    txn_date TEXT NOT NULL,
    currency_kind TEXT NOT NULL DEFAULT '',
    txn_type TEXT NOT NULL DEFAULT '',
    debt_usd REAL NOT NULL DEFAULT 0,
    payment_usd REAL NOT NULL DEFAULT 0,
    debt_iqd REAL NOT NULL DEFAULT 0,
    payment_iqd REAL NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_txn_debtor ON transactions(debtor_id);
  CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(txn_date);

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'گشتی',
    amount_usd REAL NOT NULL DEFAULT 0,
    amount_iqd REAL NOT NULL DEFAULT 0,
    expense_date TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_exp_date ON expenses(expense_date);

  /* ─── تایە فرۆشتن و مخزن ─── */
  CREATE TABLE IF NOT EXISTS tires_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    size TEXT DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 0,
    purchase_price_usd REAL NOT NULL DEFAULT 0,
    sale_price_usd REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tire_customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tire_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER REFERENCES tire_customers(id) ON DELETE SET NULL,
    sale_date TEXT NOT NULL,
    payment_type TEXT NOT NULL DEFAULT 'نەقد', -- نەقد یان قەرز
    total_usd REAL NOT NULL DEFAULT 0,
    total_iqd REAL NOT NULL DEFAULT 0,
    paid_usd REAL NOT NULL DEFAULT 0,
    paid_iqd REAL NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tire_sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES tire_sales(id) ON DELETE CASCADE,
    tire_id INTEGER NOT NULL REFERENCES tires_inventory(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    price_usd REAL NOT NULL DEFAULT 0,
    price_iqd REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tire_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES tire_customers(id) ON DELETE CASCADE,
    payment_date TEXT NOT NULL,
    amount_usd REAL NOT NULL DEFAULT 0,
    amount_iqd REAL NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tire_sale_date ON tire_sales(sale_date);
  CREATE INDEX IF NOT EXISTS idx_tire_payment_date ON tire_payments(payment_date);
`);

/* ─── migration: زیادکردنی ستوونی note بۆ خشتەی transactions ─── */
try {
  db.exec(`ALTER TABLE transactions ADD COLUMN note TEXT DEFAULT ''`);
} catch (_) {
  /* ستوون پێشتر هەیە — هیچ ناکرێت */
}

module.exports = { db };
