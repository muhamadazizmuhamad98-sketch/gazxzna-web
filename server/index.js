const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { db } = require("./db");

function loadRootEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf8").split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const i = t.indexOf("=");
    if (i <= 0) return;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  });
}

loadRootEnv();

const app = express();
const PORT = Number(process.env.PORT || process.env.API_PORT || 3001);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function rowDebtor(r) {
  const bal = balancesForDebtor(r.id);
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? "",
    note: r.note ?? "",
    created_at: r.created_at,
    balance_usd: bal.balance_usd,
    balance_iqd: bal.balance_iqd,
  };
}

function balancesForDebtor(debtorId) {
  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(debt_usd),0) - COALESCE(SUM(payment_usd),0) AS bal_usd,
        COALESCE(SUM(debt_iqd),0) - COALESCE(SUM(payment_iqd),0) AS bal_iqd
       FROM transactions WHERE debtor_id = ?`
    )
    .get(debtorId);
  return { balance_usd: row.bal_usd, balance_iqd: row.bal_iqd };
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/debtors", (_req, res) => {
  const rows = db.prepare("SELECT * FROM debtors ORDER BY name COLLATE NOCASE").all();
  res.json(rows.map(rowDebtor));
});

app.post("/api/debtors", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "ناو پێویستە" });
  const phone = String(req.body?.phone ?? "").trim();
  const note = String(req.body?.note ?? "").trim();
  try {
    const info = db
      .prepare("INSERT INTO debtors (name, phone, note) VALUES (?,?,?)")
      .run(name, phone, note);
    const r = db.prepare("SELECT * FROM debtors WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json(rowDebtor(r));
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "ئەم ناوە پێشتر هەیە" });
    }
    throw e;
  }
});

app.patch("/api/debtors/:id", (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare("SELECT * FROM debtors WHERE id = ?").get(id);
  if (!cur) return res.status(404).json({ error: "نەدۆزرایەوە" });
  const name = req.body?.name != null ? String(req.body.name).trim() : cur.name;
  const phone = req.body?.phone != null ? String(req.body.phone).trim() : cur.phone;
  const note = req.body?.note != null ? String(req.body.note).trim() : cur.note;
  if (!name) return res.status(400).json({ error: "ناو پێویستە" });
  try {
    db.prepare("UPDATE debtors SET name = ?, phone = ?, note = ? WHERE id = ?").run(
      name,
      phone,
      note,
      id
    );
    const r = db.prepare("SELECT * FROM debtors WHERE id = ?").get(id);
    res.json(rowDebtor(r));
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "ئەم ناوە پێشتر هەیە" });
    }
    throw e;
  }
});

app.delete("/api/debtors/:id", (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM debtors WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "نەدۆزرایەوە" });
  res.json({ ok: true });
});

app.get("/api/debtors/:id/summary", (req, res) => {
  const id = Number(req.params.id);
  const d = db.prepare("SELECT * FROM debtors WHERE id = ?").get(id);
  if (!d) return res.status(404).json({ error: "نەدۆزرایەوە" });
  const b = balancesForDebtor(id);
  res.json({ ...rowDebtor(d), ...b });
});

app.get("/api/transactions", (req, res) => {
  const debtorId = req.query.debtor_id ? Number(req.query.debtor_id) : null;
  const q = req.query.q ? String(req.query.q).trim() : "";
  let sql = `
    SELECT t.*, d.name AS debtor_name
    FROM transactions t
    JOIN debtors d ON d.id = t.debtor_id
    WHERE 1=1
  `;
  const params = [];
  if (debtorId && !Number.isNaN(debtorId)) {
    sql += " AND t.debtor_id = ?";
    params.push(debtorId);
  }
  if (q) {
    sql += " AND d.name LIKE ?";
    params.push("%" + q.replace(/%/g, "\\%") + "%");
  }
  sql += " ORDER BY t.txn_date DESC, t.id DESC LIMIT 500";
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

app.post("/api/transactions", (req, res) => {
  const debtor_id = Number(req.body?.debtor_id);
  const txn_date = String(req.body?.txn_date ?? "").trim();
  const currency_kind = String(req.body?.currency_kind ?? "").trim();
  const txn_type = String(req.body?.txn_type ?? "").trim();
  const debt_usd = Number(req.body?.debt_usd) || 0;
  const payment_usd = Number(req.body?.payment_usd) || 0;
  const debt_iqd = Number(req.body?.debt_iqd) || 0;
  const payment_iqd = Number(req.body?.payment_iqd) || 0;
  const note = String(req.body?.note ?? "").trim();
  if (!debtor_id || Number.isNaN(debtor_id)) {
    return res.status(400).json({ error: "قەرزدار هەڵبژێرە" });
  }
  if (!txn_date) return res.status(400).json({ error: "ڕێکەوت پێویستە" });
  const d = db.prepare("SELECT id FROM debtors WHERE id = ?").get(debtor_id);
  if (!d) return res.status(404).json({ error: "قەرزدار نەدۆزرایەوە" });
  const info = db
    .prepare(
      `INSERT INTO transactions
      (debtor_id, txn_date, currency_kind, txn_type, debt_usd, payment_usd, debt_iqd, payment_iqd, note)
      VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(debtor_id, txn_date, currency_kind, txn_type, debt_usd, payment_usd, debt_iqd, payment_iqd, note);
  const row = db
    .prepare(
      `SELECT t.*, d.name AS debtor_name FROM transactions t
       JOIN debtors d ON d.id = t.debtor_id WHERE t.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.delete("/api/transactions/:id", (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "نەدۆزرایەوە" });
  res.json({ ok: true });
});

/* ─── مسروفات (Expenses) ─── */

const EXPENSE_CATEGORIES = [
  "گشتی",
  "گواستنەوە",
  "مووچە",
  "کرێ",
  "کارەبا و ئاو",
  "چاککردنەوە",
  "هیتر",
];

app.get("/api/expense-categories", (_req, res) => {
  res.json(EXPENSE_CATEGORIES);
});

app.get("/api/expenses", (req, res) => {
  const from = req.query.from || "";
  const to = req.query.to || "";
  let sql = "SELECT * FROM expenses WHERE 1=1";
  const params = [];
  if (from) {
    sql += " AND expense_date >= ?";
    params.push(from);
  }
  if (to) {
    sql += " AND expense_date <= ?";
    params.push(to);
  }
  sql += " ORDER BY expense_date DESC, id DESC LIMIT 500";
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

app.post("/api/expenses", (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  if (!title) return res.status(400).json({ error: "ناونیشان پێویستە" });
  const category = String(req.body?.category ?? "گشتی").trim();
  const amount_usd = Number(req.body?.amount_usd) || 0;
  const amount_iqd = Number(req.body?.amount_iqd) || 0;
  const expense_date = String(req.body?.expense_date ?? "").trim();
  if (!expense_date) return res.status(400).json({ error: "ڕێکەوت پێویستە" });
  const note = String(req.body?.note ?? "").trim();
  if (amount_usd === 0 && amount_iqd === 0) {
    return res.status(400).json({ error: "لانیکەم یەک بڕ بنووسە" });
  }
  const info = db
    .prepare(
      `INSERT INTO expenses (title, category, amount_usd, amount_iqd, expense_date, note)
       VALUES (?,?,?,?,?,?)`
    )
    .run(title, category, amount_usd, amount_iqd, expense_date, note);
  const row = db.prepare("SELECT * FROM expenses WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.delete("/api/expenses/:id", (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "نەدۆزرایەوە" });
  res.json({ ok: true });
});

/* ─── ڕاپۆرت (Reports) ─── */

app.get("/api/reports/summary", (req, res) => {
  const from = req.query.from || "";
  const to = req.query.to || "";

  /* کۆی مامەڵەکان */
  let txnSql = `SELECT
    COALESCE(SUM(debt_usd),0)    AS total_debt_usd,
    COALESCE(SUM(debt_iqd),0)    AS total_debt_iqd,
    COALESCE(SUM(payment_usd),0) AS total_payment_usd,
    COALESCE(SUM(payment_iqd),0) AS total_payment_iqd
   FROM transactions WHERE 1=1`;
  const txnParams = [];
  if (from) { txnSql += " AND txn_date >= ?"; txnParams.push(from); }
  if (to)   { txnSql += " AND txn_date <= ?"; txnParams.push(to); }
  const txn = db.prepare(txnSql).get(...txnParams);

  /* کۆی مسروفات */
  let expSql = `SELECT
    COALESCE(SUM(amount_usd),0) AS total_expense_usd,
    COALESCE(SUM(amount_iqd),0) AS total_expense_iqd
   FROM expenses WHERE 1=1`;
  const expParams = [];
  if (from) { expSql += " AND expense_date >= ?"; expParams.push(from); }
  if (to)   { expSql += " AND expense_date <= ?"; expParams.push(to); }
  const exp = db.prepare(expSql).get(...expParams);

  /* مسروفات بە کاتیگۆری */
  let catSql = `SELECT category,
    COALESCE(SUM(amount_usd),0) AS sum_usd,
    COALESCE(SUM(amount_iqd),0) AS sum_iqd
   FROM expenses WHERE 1=1`;
  const catParams = [];
  if (from) { catSql += " AND expense_date >= ?"; catParams.push(from); }
  if (to)   { catSql += " AND expense_date <= ?"; catParams.push(to); }
  catSql += " GROUP BY category ORDER BY sum_usd DESC, sum_iqd DESC";
  const cats = db.prepare(catSql).all(...catParams);

  /* سەرەکیترین قەرزداران */
  let topSql = `SELECT d.name,
    COALESCE(SUM(t.debt_usd),0) - COALESCE(SUM(t.payment_usd),0) AS balance_usd,
    COALESCE(SUM(t.debt_iqd),0) - COALESCE(SUM(t.payment_iqd),0) AS balance_iqd
   FROM transactions t
   JOIN debtors d ON d.id = t.debtor_id
   WHERE 1=1`;
  const topParams = [];
  if (from) { topSql += " AND t.txn_date >= ?"; topParams.push(from); }
  if (to)   { topSql += " AND t.txn_date <= ?"; topParams.push(to); }
  topSql += " GROUP BY t.debtor_id ORDER BY balance_usd DESC, balance_iqd DESC LIMIT 10";
  const topDebtors = db.prepare(topSql).all(...topParams);

  res.json({
    total_debt_usd: txn.total_debt_usd,
    total_debt_iqd: txn.total_debt_iqd,
    total_payment_usd: txn.total_payment_usd,
    total_payment_iqd: txn.total_payment_iqd,
    remaining_usd: txn.total_debt_usd - txn.total_payment_usd,
    remaining_iqd: txn.total_debt_iqd - txn.total_payment_iqd,
    total_expense_usd: exp.total_expense_usd,
    total_expense_iqd: exp.total_expense_iqd,
    expense_by_category: cats,
    top_debtors: topDebtors,
  });
});

const clientDist = path.join(__dirname, "..", "client", "dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "هەڵەی ناوخۆ" });
});

const server = app.listen(PORT, () => {
  console.log(`API http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("\n[!] پۆرت " + PORT + " بەکارهاتووە — سێرڤەر دەست پێ ناکات.");
    console.error("    چارەسەر (یەکێک هەڵبژێرە):");
    console.error("    ١) تێرمیناڵی کۆن دابخە کە `npm run dev` تێدایە.");
    console.error("    ٢) لە PowerShell بزانە کێ پۆرتەکەی گرتووە:");
    console.error("       Get-NetTCPConnection -LocalPort " + PORT + " | Select-Object LocalPort,OwningProcess");
    console.error("    ٣) یان لە فۆڵدەری پڕۆژەکە فایلێکی `.env` دروست بکە بەم نوسینە:");
    console.error("       API_PORT=3002");
    console.error("       (Vite خۆکارانە هەمان پۆرت بۆ proxy بەکاردەهێنێت)\n");
    process.exit(1);
  }
  throw err;
});
