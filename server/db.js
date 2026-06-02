const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

const dbPath = path.join(__dirname, "..", "data", "gazxana.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

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
`);

module.exports = { db };
