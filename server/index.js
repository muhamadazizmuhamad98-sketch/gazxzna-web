const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
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
const JWT_SECRET = process.env.JWT_SECRET || "gazxana-secret-key-fallback";

/* ─── بەکارهێنەرانی سیستەم (مێرجکردنی .env لەگەڵ داتابەیس) ─── */
function getAllUsers() {
  const systemUsers = [
    {
      username: (process.env.ADMIN_USER || "admin").trim().toLowerCase(),
      password: process.env.ADMIN_PASS || "admin123",
      role: "admin",
      displayName: "ئادمین (سەرەکی)",
      isSystem: true
    },
    {
      username: (process.env.USER_USER || "user").trim().toLowerCase(),
      password: process.env.USER_PASS || "user123",
      role: "user",
      displayName: "بەکارهێنەر (مامەڵەکان - سەرەکی)",
      isSystem: true
    },
    {
      username: (process.env.TIRE_USER || "tire").trim().toLowerCase(),
      password: process.env.TIRE_PASS || "tire123",
      role: "tire",
      displayName: "بەکارهێنەر (تایە - سەرەکی)",
      isSystem: true
    }
  ];

  try {
    const dbUsers = db.prepare("SELECT * FROM users").all();
    const mappedDb = dbUsers.map(u => ({
      username: u.username.trim().toLowerCase(),
      password: u.password,
      role: u.role,
      displayName: u.display_name,
      isSystem: false
    }));

    const merged = [...mappedDb];
    for (const sys of systemUsers) {
      if (!merged.some(u => u.username === sys.username)) {
        merged.push(sys);
      }
    }
    return merged;
  } catch (err) {
    console.error("Error loading users from database:", err);
    return systemUsers;
  }
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ─── پاراستنی هێدەرەکانی سێرڤەر (Helmet Security) ───
app.use(helmet({
  contentSecurityPolicy: false,
}));

// ─── سنووردارکردنی ژمارەی داواکارییەکان (Rate Limiting) ───
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // ١٥ خولەک
  max: 400, // هەر ئایپییەک زۆرترین ٤٠٠ داواکاری بنێرێت لە ماوەی ١٥ خولەکدا
  message: { error: "داواکارییەکانت زۆر بوون، تکایە کەمێکی تر تاقی بکەرەوە (١٥ خولەک چاوەڕێ بکە)" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", limiter);

/* ═══════ Auth Endpoints ═══════ */

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "ناوی بەکارهێنەر و وشەی نهێنی پێویستە" });
  }
  const cleanUsername = username.trim().toLowerCase();
  const allUsers = getAllUsers();
  const user = allUsers.find(
    (u) => u.username === cleanUsername && u.password === password
  );
  if (!user) {
    return res.status(401).json({ error: "ناوی بەکارهێنەر یان وشەی نهێنی هەڵەیە" });
  }
  const token = jwt.sign(
    { username: user.username, role: user.role, displayName: user.displayName },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.json({
    token,
    user: {
      username: user.username,
      role: user.role,
      displayName: user.displayName,
    },
  });
});

app.get("/api/auth/me", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "چوونەژوورەوە پێویستە" });
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
    res.json({
      username: decoded.username,
      role: decoded.role,
      displayName: decoded.displayName,
    });
  } catch {
    return res.status(401).json({ error: "token بەسەرچووە، دووبارە بچۆرەژوورەوە" });
  }
});

/* ═══════ Auth Middleware ═══════ */

function authMiddleware(req, res, next) {
  // بێ auth بۆ health و login
  if (req.path === "/api/health" || req.path === "/api/auth/login") {
    return next();
  }
  // ڕێگەدان بە باکئەپی داتابەیس ئەگەر تێپەڕەوشەی باکئەپی ڕاست لەگەڵ بێت
  if (req.path === "/api/admin/backup-db") {
    const secretKey = req.query.secret || "";
    const expectedSecret = process.env.BACKUP_SECRET || "gazxana1234";
    if (secretKey && secretKey === expectedSecret) {
      req.user = { role: "admin", username: "backup_agent" };
      return next();
    }
  }
  // هەموو API-یەکانی تر auth پێویستە
  if (!req.path.startsWith("/api/")) return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "چوونەژوورەوە پێویستە" });
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "token بەسەرچووە، دووبارە بچۆرەژوورەوە" });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "تەنها ئادمین دەستگەیشتن بەم بەشە هەیە" });
  }
  next();
}

function adminOrTire(req, res, next) {
  if (!req.user || (req.user.role !== "admin" && req.user.role !== "tire")) {
    return res.status(403).json({ error: "تەنها ئادمین یان بەکارهێنەری تایە دەستگەیشتن بەم بەشە هەیە" });
  }
  next();
}

function adminOrUser(req, res, next) {
  if (!req.user || (req.user.role !== "admin" && req.user.role !== "user")) {
    return res.status(403).json({ error: "" });
  }
  next();
}

app.use(authMiddleware);

// ─── باکئەپی داتابەیس (Secure SQLite Backup) ───
app.get("/api/admin/backup-db", adminOnly, (req, res) => {
  const secretKey = req.query.secret || "";
  const expectedSecret = process.env.BACKUP_SECRET || "gazxana1234";
  
  if (!secretKey || secretKey !== expectedSecret) {
    return res.status(403).json({ error: "تێپەڕەوشەی باکئەپ هەڵەیە" });
  }
  
  const dbPath = path.join(__dirname, "..", "data", "gazxana.sqlite");
  if (!fs.existsSync(dbPath)) {
    return res.status(404).json({ error: "داتابەیس نەدۆزرایەوە" });
  }
  
  res.download(dbPath, "gazxana_backup.sqlite", (err) => {
    if (err && !res.headersSent) {
      console.error("Backup download error:", err);
    }
  });
});

// ─── سفرکردنەوەی تەواوی داتابەیس (Secure SQLite Database Reset) ───
app.post("/api/admin/reset-db", adminOnly, (req, res) => {
  const secretKey = req.body?.secret || "";
  const expectedSecret = process.env.BACKUP_SECRET || "gazxana1234";
  
  if (!secretKey || secretKey !== expectedSecret) {
    return res.status(403).json({ error: "تێپەڕەوشەی باکئەپ هەڵەیە" });
  }
  
  try {
    db.transaction(() => {
      // Temporarily disable foreign keys to allow cascading/ordered cleanup
      db.pragma("foreign_keys = OFF");
      db.prepare("DELETE FROM tire_sale_items").run();
      db.prepare("DELETE FROM tire_sales").run();
      db.prepare("DELETE FROM tire_payments").run();
      db.prepare("DELETE FROM tire_customers").run();
      db.prepare("DELETE FROM tires_inventory").run();
      db.prepare("DELETE FROM transactions").run();
      db.prepare("DELETE FROM debtors").run();
      db.prepare("DELETE FROM expenses").run();
      db.prepare("DELETE FROM tire_expenses").run();
      db.pragma("foreign_keys = ON");
    })();
    res.json({ ok: true });
  } catch (err) {
    console.error("Database reset error:", err);
    res.status(500).json({ error: "سفرکردنەوەی داتابەیس سەرنەکەوت" });
  }
});

// ─── گەڕاندنەوەی داتابەیس لە باکئەپەوە (Restore SQLite Database from Backup) ───
app.post("/api/admin/restore-db", adminOnly, express.raw({ type: '*/*', limit: '100mb' }), (req, res) => {
  const secretKey = req.query.secret || "";
  const expectedSecret = process.env.BACKUP_SECRET || "gazxana1234";
  
  if (!secretKey || secretKey !== expectedSecret) {
    return res.status(403).json({ error: "تێپەڕەوشەی باکئەپ هەڵەیە" });
  }

  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "پێویستە فایلی داتابەیس بنێریت" });
  }

  // Verify SQLite file signature (starts with "SQLite format 3\0")
  const header = req.body.toString("ascii", 0, 15);
  if (!header.startsWith("SQLite format 3")) {
    return res.status(400).json({ error: "فایلەکە داتابەیسی دروستی SQLite نییە" });
  }

  try {
    // 1. Close current connection
    db.close();
    
    // 2. Overwrite file
    const dbPath = path.join(__dirname, "..", "data", "gazxana.sqlite");
    fs.writeFileSync(dbPath, req.body);
    
    // 3. Response and exit (auto-restart by PM2/Railway)
    res.json({ ok: true, message: "داتابەیس بە سەرکەوتوویی گەڕێندرایەوە. سێرڤەر ڕیستارت دەبێتەوە..." });
    
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  } catch (err) {
    console.error("Database restore error:", err);
    res.status(500).json({ error: "گەڕاندنەوەی داتابەیس سەرنەکەوت" });
  }
});

// ─── بەڕێوەبردنی بەکارهێنەران (تەنها ئادمین) ───
app.get("/api/admin/users", adminOnly, (req, res) => {
  const users = getAllUsers().map(u => ({
    username: u.username,
    role: u.role,
    displayName: u.displayName,
    isSystem: u.isSystem || false
  }));
  res.json(users);
});

app.post("/api/admin/users", adminOnly, (req, res) => {
  const username = String(req.body?.username ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const role = String(req.body?.role ?? "user");
  const displayName = String(req.body?.displayName ?? "").trim();

  if (!username || !password || !displayName) {
    return res.status(400).json({ error: "تکایە هەموو خانەکان پڕ بکەرەوە" });
  }

  if (!["admin", "user", "tire"].includes(role)) {
    return res.status(400).json({ error: "ڕۆڵی نادروست" });
  }

  const allUsers = getAllUsers();
  const exists = allUsers.some(u => u.username === username);
  if (exists) {
    return res.status(409).json({ error: "ئەم ناوی بەکارهێنەرە پێشتر هەیە" });
  }

  try {
    db.prepare(`
      INSERT INTO users (username, password, role, display_name)
      VALUES (?, ?, ?, ?)
    `).run(username, password, role, displayName);

    res.status(201).json({
      username,
      role,
      displayName,
      isSystem: false
    });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ error: "دروستکردنی بەکارهێنەر سەرنەکەوت" });
  }
});

app.delete("/api/admin/users/:username", adminOnly, (req, res) => {
  const username = String(req.params.username).trim().toLowerCase();

  const allUsers = getAllUsers();
  const target = allUsers.find(u => u.username === username);
  if (!target) {
    return res.status(404).json({ error: "بەکارهێنەر نەدۆزرایەوە" });
  }

  if (target.isSystem) {
    return res.status(400).json({ error: "ناتوانیت بەکارهێنەرانی سەرەکی سیستم بسڕیتەوە" });
  }

  if (req.user && req.user.username.toLowerCase() === username) {
    return res.status(400).json({ error: "ناتوانیت بەکارهێنەری خۆت بسڕیتەوە کاتێک داخڵی" });
  }

  try {
    const info = db.prepare("DELETE FROM users WHERE username = ?").run(username);
    if (info.changes === 0) {
      return res.status(404).json({ error: "بەکارهێنەر نەدۆزرایەوە" });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: "سڕینەوەی بەکارهێنەر سەرنەکەوت" });
  }
});

function rowDebtor(r) {
  const bal = balancesForDebtor(r.id);
  
  // Find latest USD and IQD debt transactions
  const latestUsdRow = db.prepare(`
    SELECT debt_usd FROM transactions 
    WHERE debtor_id = ? AND (txn_type = 'قەرز' OR debt_usd > 0)
    ORDER BY txn_date DESC, id DESC LIMIT 1
  `).get(r.id);

  const latestIqdRow = db.prepare(`
    SELECT debt_iqd FROM transactions 
    WHERE debtor_id = ? AND (txn_type = 'قەرز' OR debt_iqd > 0)
    ORDER BY txn_date DESC, id DESC LIMIT 1
  `).get(r.id);

  const latest_debt_usd = latestUsdRow ? latestUsdRow.debt_usd : 0;
  const latest_debt_iqd = latestIqdRow ? latestIqdRow.debt_iqd : 0;

  const previous_debt_usd = bal.balance_usd - latest_debt_usd;
  const previous_debt_iqd = bal.balance_iqd - latest_debt_iqd;

  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? "",
    note: r.note ?? "",
    created_at: r.created_at,
    balance_usd: bal.balance_usd,
    balance_iqd: bal.balance_iqd,
    latest_debt_usd,
    previous_debt_usd,
    latest_debt_iqd,
    previous_debt_iqd,
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

app.get("/api/debtors", adminOrUser, (_req, res) => {
  const rows = db.prepare("SELECT * FROM debtors ORDER BY name COLLATE NOCASE").all();
  res.json(rows.map(rowDebtor));
});

app.post("/api/debtors", adminOrUser, (req, res) => {
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

app.patch("/api/debtors/:id", adminOrUser, (req, res) => {
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

app.delete("/api/debtors/:id", adminOrUser, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM debtors WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "نەدۆزرایەوە" });
  res.json({ ok: true });
});

app.get("/api/debtors/:id/summary", adminOrUser, (req, res) => {
  const id = Number(req.params.id);
  const d = db.prepare("SELECT * FROM debtors WHERE id = ?").get(id);
  if (!d) return res.status(404).json({ error: "نەدۆزرایەوە" });
  const b = balancesForDebtor(id);
  res.json({ ...rowDebtor(d), ...b });
});

app.get("/api/transactions", adminOrUser, (req, res) => {
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

app.post("/api/transactions", adminOrUser, (req, res) => {
  const debtor_id = Number(req.body?.debtor_id);
  const txn_date = String(req.body?.txn_date ?? "").trim();
  const currency_kind = String(req.body?.currency_kind ?? "").trim();
  const txn_type = String(req.body?.txn_type ?? "").trim();
  const debt_usd = Number(req.body?.debt_usd) || 0;
  const payment_usd = Number(req.body?.payment_usd) || 0;
  const debt_iqd = Number(req.body?.debt_iqd) || 0;
  const payment_iqd = Number(req.body?.payment_iqd) || 0;
  const note = String(req.body?.note ?? "").trim();
  const profit_usd = Number(req.body?.profit_usd) || 0;
  const profit_iqd = Number(req.body?.profit_iqd) || 0;
  if (!debtor_id || Number.isNaN(debtor_id)) {
    return res.status(400).json({ error: "قەرزدار هەڵبژێرە" });
  }
  if (!txn_date) return res.status(400).json({ error: "ڕێکەوت پێویستە" });
  const d = db.prepare("SELECT id FROM debtors WHERE id = ?").get(debtor_id);
  if (!d) return res.status(404).json({ error: "قەرزدار نەدۆزرایەوە" });
  const info = db
    .prepare(
      `INSERT INTO transactions
      (debtor_id, txn_date, currency_kind, txn_type, debt_usd, payment_usd, debt_iqd, payment_iqd, note, profit_usd, profit_iqd)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(debtor_id, txn_date, currency_kind, txn_type, debt_usd, payment_usd, debt_iqd, payment_iqd, note, profit_usd, profit_iqd);
  const row = db
    .prepare(
      `SELECT t.*, d.name AS debtor_name FROM transactions t
       JOIN debtors d ON d.id = t.debtor_id WHERE t.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.delete("/api/transactions/:id", adminOrUser, (req, res) => {
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

app.get("/api/expense-categories", adminOrUser, (_req, res) => {
  res.json(EXPENSE_CATEGORIES);
});

app.get("/api/expenses", adminOrUser, (req, res) => {
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

app.post("/api/expenses", adminOrUser, (req, res) => {
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

app.delete("/api/expenses/:id", adminOrUser, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "نەدۆزرایەوە" });
  res.json({ ok: true });
});

/* ─── ڕاپۆرت (Reports) ─── */

app.get("/api/reports/summary", adminOrUser, (req, res) => {
  const from = req.query.from || "";
  const to = req.query.to || "";

  /* کۆی مامەڵەکان */
  let txnSql = `SELECT
    COALESCE(SUM(debt_usd),0)    AS total_debt_usd,
    COALESCE(SUM(debt_iqd),0)    AS total_debt_iqd,
    COALESCE(SUM(payment_usd),0) AS total_payment_usd,
    COALESCE(SUM(payment_iqd),0) AS total_payment_iqd,
    COALESCE(SUM(profit_usd),0)  AS total_profit_usd,
    COALESCE(SUM(profit_iqd),0)  AS total_profit_iqd
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
    total_profit_usd: txn.total_profit_usd,
    total_profit_iqd: txn.total_profit_iqd,
    remaining_usd: txn.total_debt_usd - txn.total_payment_usd,
    remaining_iqd: txn.total_debt_iqd - txn.total_payment_iqd,
    total_expense_usd: exp.total_expense_usd,
    total_expense_iqd: exp.total_expense_iqd,
    expense_by_category: cats,
    top_debtors: topDebtors,
  });
});

/* ─── تایە فرۆشتن و مخزن (Tires Inventory & Sales) ─── */

function balancesForTireCustomer(customerId, initialBalanceUsd = 0) {
  const sales = db.prepare(`
    SELECT 
      COALESCE(SUM(total_usd), 0) - COALESCE(SUM(paid_usd), 0) AS owed_usd,
      COALESCE(SUM(total_iqd), 0) - COALESCE(SUM(paid_iqd), 0) AS owed_iqd
    FROM tire_sales WHERE customer_id = ?
  `).get(customerId);
  
  const payments = db.prepare(`
    SELECT 
      COALESCE(SUM(amount_usd), 0) AS paid_usd,
      COALESCE(SUM(amount_iqd), 0) AS paid_iqd
    FROM tire_payments WHERE customer_id = ?
  `).get(customerId);
  
  return {
    balance_usd: initialBalanceUsd + (sales.owed_usd || 0) - (payments.paid_usd || 0),
    balance_iqd: (sales.owed_iqd || 0) - (payments.paid_iqd || 0)
  };
}

function rowTireCustomer(r) {
  const bal = balancesForTireCustomer(r.id, r.initial_balance_usd || 0);

  // Find latest debt transaction for tire customer (from tire sales)
  const latestSaleRow = db.prepare(`
    SELECT (total_usd - paid_usd) AS debt_usd
    FROM tire_sales
    WHERE customer_id = ? AND payment_type = 'قەرز' AND (total_usd - paid_usd) > 0
    ORDER BY sale_date DESC, id DESC LIMIT 1
  `).get(r.id);
  
  const latest_debt_usd = latestSaleRow ? latestSaleRow.debt_usd : 0;
  const previous_debt_usd = bal.balance_usd - latest_debt_usd;

  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? "",
    note: r.note ?? "",
    initial_balance_usd: r.initial_balance_usd || 0,
    created_at: r.created_at,
    balance_usd: bal.balance_usd,
    balance_iqd: bal.balance_iqd,
    latest_debt_usd,
    previous_debt_usd,
  };
}

// 1. Inventory Endpoints
app.get("/api/tires", adminOrTire, (_req, res) => {
  const rows = db.prepare("SELECT * FROM tires_inventory ORDER BY name COLLATE NOCASE").all();
  res.json(rows);
});

app.post("/api/tires", adminOrTire, (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "ناوی تایە پێویستە" });
  const size = String(req.body?.size ?? "").trim();
  const quantity = Number(req.body?.quantity) || 0;
  const purchase_price_usd = Number(req.body?.purchase_price_usd) || 0;
  const sale_price_usd = Number(req.body?.sale_price_usd) || 0;
  
  try {
    const info = db
      .prepare("INSERT INTO tires_inventory (name, size, quantity, purchase_price_usd, sale_price_usd) VALUES (?,?,?,?,?)")
      .run(name, size, quantity, purchase_price_usd, sale_price_usd);
    const r = db.prepare("SELECT * FROM tires_inventory WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json(r);
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "ئەم تایەیە پێشتر هەیە لە مخزن" });
    }
    throw e;
  }
});

app.patch("/api/tires/:id", adminOrTire, (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare("SELECT * FROM tires_inventory WHERE id = ?").get(id);
  if (!cur) return res.status(404).json({ error: "نەدۆزرایەوە" });
  
  const name = req.body?.name != null ? String(req.body.name).trim() : cur.name;
  const size = req.body?.size != null ? String(req.body.size).trim() : cur.size;
  const quantity = req.body?.quantity != null ? Number(req.body.quantity) : cur.quantity;
  const purchase_price_usd = req.body?.purchase_price_usd != null ? Number(req.body.purchase_price_usd) : cur.purchase_price_usd;
  const sale_price_usd = req.body?.sale_price_usd != null ? Number(req.body.sale_price_usd) : cur.sale_price_usd;
  
  if (!name) return res.status(400).json({ error: "ناونیشانی تایە پێویستە" });
  
  try {
    db.prepare(`
      UPDATE tires_inventory 
      SET name = ?, size = ?, quantity = ?, purchase_price_usd = ?, sale_price_usd = ?
      WHERE id = ?
    `).run(name, size, quantity, purchase_price_usd, sale_price_usd, id);
    const r = db.prepare("SELECT * FROM tires_inventory WHERE id = ?").get(id);
    res.json(r);
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "ئەم ناوە پێشتر هەیە" });
    }
    throw e;
  }
});

app.delete("/api/tires/:id", adminOrTire, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM tires_inventory WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "نەدۆزرایەوە" });
  res.json({ ok: true });
});

// 2. Customers Endpoints
app.get("/api/tire-customers", adminOrTire, (_req, res) => {
  const rows = db.prepare("SELECT * FROM tire_customers ORDER BY name COLLATE NOCASE").all();
  res.json(rows.map(rowTireCustomer));
});

app.post("/api/tire-customers", adminOrTire, (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "ناو پێویستە" });
  const phone = String(req.body?.phone ?? "").trim();
  const note = String(req.body?.note ?? "").trim();
  const initial_balance_usd = Number(req.body?.initial_balance_usd) || 0;
  
  try {
    const info = db
      .prepare("INSERT INTO tire_customers (name, phone, note, initial_balance_usd) VALUES (?,?,?,?)")
      .run(name, phone, note, initial_balance_usd);
    const r = db.prepare("SELECT * FROM tire_customers WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json(rowTireCustomer(r));
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "ئەم ناوە پێشتر هەیە" });
    }
    throw e;
  }
});

app.patch("/api/tire-customers/:id", adminOrTire, (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare("SELECT * FROM tire_customers WHERE id = ?").get(id);
  if (!cur) return res.status(404).json({ error: "نەدۆزرایەوە" });
  const name = req.body?.name != null ? String(req.body.name).trim() : cur.name;
  const phone = req.body?.phone != null ? String(req.body.phone).trim() : cur.phone;
  const note = req.body?.note != null ? String(req.body.note).trim() : cur.note;
  const initial_balance_usd = req.body?.initial_balance_usd != null ? Number(req.body.initial_balance_usd) : cur.initial_balance_usd;
  if (!name) return res.status(400).json({ error: "ناو پێویستە" });
  try {
    db.prepare("UPDATE tire_customers SET name = ?, phone = ?, note = ?, initial_balance_usd = ? WHERE id = ?").run(
      name, phone, note, initial_balance_usd, id
    );
    const r = db.prepare("SELECT * FROM tire_customers WHERE id = ?").get(id);
    res.json(rowTireCustomer(r));
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "ئەم ناوە پێشتر هەیە" });
    }
    throw e;
  }
});

app.delete("/api/tire-customers/:id", adminOrTire, (req, res) => {
  const id = Number(req.params.id);
  // Check for existing sales linked to this customer
  const salesCount = db.prepare("SELECT COUNT(*) AS cnt FROM tire_sales WHERE customer_id = ?").get(id);
  if (salesCount && salesCount.cnt > 0) {
    return res.status(400).json({ error: "ناتوانیت ئەم قەرزدارە بسڕیتەوە چونکە فرۆشتنی پەیوەست بەوەوە هەیە. سەرەتا فرۆشتنەکانی بسڕەوە." });
  }
  // Delete payments
  db.prepare("DELETE FROM tire_payments WHERE customer_id = ?").run(id);
  const info = db.prepare("DELETE FROM tire_customers WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "نەدۆزرایەوە" });
  res.json({ ok: true });
});

// 3. Sales Endpoints
app.get("/api/tire-sales", adminOrTire, (_req, res) => {
  const rows = db.prepare(`
    SELECT s.*, c.name AS customer_name 
    FROM tire_sales s
    LEFT JOIN tire_customers c ON c.id = s.customer_id
    ORDER BY s.sale_date DESC, s.id DESC LIMIT 500
  `).all();
  
  const salesWithItems = rows.map(sale => {
    const items = db.prepare(`
      SELECT i.*, t.name AS tire_name
      FROM tire_sale_items i
      JOIN tires_inventory t ON t.id = i.tire_id
      WHERE i.sale_id = ?
    `).all(sale.id);
    return { ...sale, items };
  });
  
  res.json(salesWithItems);
});

app.post("/api/tire-sales", adminOrTire, (req, res) => {
  const customer_id = req.body?.customer_id ? Number(req.body.customer_id) : null;
  const sale_date = String(req.body?.sale_date ?? "").trim();
  const payment_type = String(req.body?.payment_type ?? "نەقد").trim();
  const total_usd = Number(req.body?.total_usd) || 0;
  const total_iqd = Number(req.body?.total_iqd) || 0;
  const paid_usd = Number(req.body?.paid_usd) || 0;
  const paid_iqd = Number(req.body?.paid_iqd) || 0;
  const note = String(req.body?.note ?? "").trim();
  const items = req.body?.items || []; // { tire_id, quantity, price_usd, price_iqd }
  
  if (!sale_date) return res.status(400).json({ error: "ڕێکەوت پێویستە" });
  if (items.length === 0) return res.status(400).json({ error: "لانیکەم پێویستە یەک جۆر تایە هەڵبژێریت" });
  
  const executeSale = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO tire_sales (customer_id, sale_date, payment_type, total_usd, total_iqd, paid_usd, paid_iqd, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(customer_id, sale_date, payment_type, total_usd, total_iqd, paid_usd, paid_iqd, note);
    
    const saleId = info.lastInsertRowid;
    
    for (const item of items) {
      const tireId = Number(item.tire_id);
      const quantity = Number(item.quantity) || 0;
      const priceUsd = Number(item.price_usd) || 0;
      const priceIqd = Number(item.price_iqd) || 0;
      
      if (!tireId || quantity <= 0) {
        throw new Error("زانیاری تایە یان بڕی فرۆشراو نادروستە");
      }
      
      const tire = db.prepare("SELECT quantity, name FROM tires_inventory WHERE id = ?").get(tireId);
      if (!tire || tire.quantity < quantity) {
        throw new Error(`بڕی پێویست لە مخزن نییە بۆ تایەی: ${tire ? tire.name : 'نەناسراو'}`);
      }
      
      db.prepare(`
        INSERT INTO tire_sale_items (sale_id, tire_id, quantity, price_usd, price_iqd)
        VALUES (?, ?, ?, ?, ?)
      `).run(saleId, tireId, quantity, priceUsd, priceIqd);
      
      db.prepare("UPDATE tires_inventory SET quantity = quantity - ? WHERE id = ?").run(quantity, tireId);
    }
    return saleId;
  });
  
  try {
    const saleId = executeSale();
    res.status(201).json({ ok: true, sale_id: saleId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/tire-sales/:id", adminOrTire, (req, res) => {
  const saleId = Number(req.params.id);
  
  const voidSale = db.transaction(() => {
    const items = db.prepare("SELECT * FROM tire_sale_items WHERE sale_id = ?").all(saleId);
    for (const item of items) {
      db.prepare("UPDATE tires_inventory SET quantity = quantity + ? WHERE id = ?").run(item.quantity, item.tire_id);
    }
    const info = db.prepare("DELETE FROM tire_sales WHERE id = ?").run(saleId);
    return info.changes;
  });
  
  try {
    const changes = voidSale();
    if (changes === 0) return res.status(404).json({ error: "نەدۆزرایەوە" });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 4. Payments Endpoints
app.get("/api/tire-payments", adminOrTire, (req, res) => {
  const customerId = req.query.customer_id ? Number(req.query.customer_id) : null;
  let sql = `
    SELECT p.*, c.name AS customer_name
    FROM tire_payments p
    JOIN tire_customers c ON c.id = p.customer_id
    WHERE 1=1
  `;
  const params = [];
  if (customerId) {
    sql += " AND p.customer_id = ?";
    params.push(customerId);
  }
  sql += " ORDER BY p.payment_date DESC, p.id DESC LIMIT 500";
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

app.post("/api/tire-payments", adminOrTire, (req, res) => {
  const customer_id = Number(req.body?.customer_id);
  const payment_date = String(req.body?.payment_date ?? "").trim();
  const amount_usd = Number(req.body?.amount_usd) || 0;
  const amount_iqd = Number(req.body?.amount_iqd) || 0;
  const note = String(req.body?.note ?? "").trim();
  
  if (!customer_id) return res.status(400).json({ error: "قەرزدار هەڵبژێرە" });
  if (!payment_date) return res.status(400).json({ error: "ڕێکەوت پێویستە" });
  if (amount_usd === 0 && amount_iqd === 0) return res.status(400).json({ error: "بڕی پارەی واسڵکراو بنووسە" });
  
  const info = db.prepare(`
    INSERT INTO tire_payments (customer_id, payment_date, amount_usd, amount_iqd, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(customer_id, payment_date, amount_usd, amount_iqd, note);
  
  res.status(201).json({ id: info.lastInsertRowid });
});

app.delete("/api/tire-payments/:id", adminOrTire, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM tire_payments WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "نەدۆزرایەوە" });
  res.json({ ok: true });
});

// 5. Reports Endpoint
app.get("/api/tire-reports/summary", adminOrTire, (req, res) => {
  const from = req.query.from || "";
  const to = req.query.to || "";
  
  let salesSql = `
    SELECT 
      COALESCE(SUM(total_usd), 0) AS total_sales_usd,
      COALESCE(SUM(total_iqd), 0) AS total_sales_iqd,
      COALESCE(SUM(paid_usd), 0) AS total_paid_usd,
      COALESCE(SUM(paid_iqd), 0) AS total_paid_iqd
    FROM tire_sales WHERE 1=1
  `;
  const salesParams = [];
  if (from) { salesSql += " AND sale_date >= ?"; salesParams.push(from); }
  if (to) { salesSql += " AND sale_date <= ?"; salesParams.push(to); }
  const sales = db.prepare(salesSql).get(...salesParams);
  
  let paySql = `
    SELECT 
      COALESCE(SUM(amount_usd), 0) AS total_payments_usd,
      COALESCE(SUM(amount_iqd), 0) AS total_payments_iqd
    FROM tire_payments WHERE 1=1
  `;
  const payParams = [];
  if (from) { paySql += " AND payment_date >= ?"; payParams.push(from); }
  if (to) { paySql += " AND payment_date <= ?"; payParams.push(to); }
  const payments = db.prepare(paySql).get(...payParams);
  
  let popSql = `
    SELECT t.name, SUM(i.quantity) AS sold_qty
    FROM tire_sale_items i
    JOIN tires_inventory t ON t.id = i.tire_id
    JOIN tire_sales s ON s.id = i.sale_id
    WHERE 1=1
  `;
  const popParams = [];
  if (from) { popSql += " AND s.sale_date >= ?"; popParams.push(from); }
  if (to) { popSql += " AND s.sale_date <= ?"; popParams.push(to); }
  popSql += " GROUP BY i.tire_id ORDER BY sold_qty DESC LIMIT 10";
  const popularTires = db.prepare(popSql).all(...popParams);
  
  const stock = db.prepare(`
    SELECT 
      SUM(quantity * purchase_price_usd) AS stock_value_purchase_usd,
      SUM(quantity * sale_price_usd) AS stock_value_sale_usd,
      SUM(quantity) AS total_tires_count
    FROM tires_inventory
  `).get();
  
  // Calculate Profit from All Sales (both Cash and Credit)
  let tireSalesSql = `
    SELECT s.id, s.total_usd
    FROM tire_sales s
    WHERE 1=1
  `;
  const tireSalesParams = [];
  if (from) { tireSalesSql += " AND s.sale_date >= ?"; tireSalesParams.push(from); }
  if (to) { tireSalesSql += " AND s.sale_date <= ?"; tireSalesParams.push(to); }
  const tireSales = db.prepare(tireSalesSql).all(...tireSalesParams);
  
  let totalProfitUsd = 0;
  tireSales.forEach(sale => {
    const costRow = db.prepare(`
      SELECT SUM(i.quantity * t.purchase_price_usd) AS cost
      FROM tire_sale_items i
      JOIN tires_inventory t ON t.id = i.tire_id
      WHERE i.sale_id = ?
    `).get(sale.id);
    const cost = costRow.cost || 0;
    totalProfitUsd += (sale.total_usd - cost);
  });
  
  const totalInitialBalance = db.prepare("SELECT SUM(initial_balance_usd) AS initial_usd FROM tire_customers").get();
  const initialUsd = totalInitialBalance.initial_usd || 0;

  const totalOwedSales = db.prepare("SELECT SUM(total_usd - paid_usd) AS owed_usd, SUM(total_iqd - paid_iqd) AS owed_iqd FROM tire_sales").get();
  const totalPayments = db.prepare("SELECT SUM(amount_usd) AS paid_usd, SUM(amount_iqd) AS paid_iqd FROM tire_payments").get();
  
  const outstandingDebtUsd = initialUsd + (totalOwedSales.owed_usd || 0) - (totalPayments.paid_usd || 0);
  const outstandingDebtIqd = (totalOwedSales.owed_iqd || 0) - (totalPayments.paid_iqd || 0);
  
  let tireExpSql = `
    SELECT COALESCE(SUM(amount_iqd), 0) AS total_expenses_iqd
    FROM tire_expenses WHERE 1=1
  `;
  const tireExpParams = [];
  if (from) { tireExpSql += " AND expense_date >= ?"; tireExpParams.push(from); }
  if (to) { tireExpSql += " AND expense_date <= ?"; tireExpParams.push(to); }
  const tireExpSum = db.prepare(tireExpSql).get(...tireExpParams);
  const totalExpensesIqd = tireExpSum.total_expenses_iqd || 0;

  res.json({
    total_sales_usd: sales.total_sales_usd,
    total_sales_iqd: sales.total_sales_iqd,
    total_cash_usd: sales.total_paid_usd + payments.total_payments_usd,
    total_cash_iqd: sales.total_paid_iqd + payments.total_payments_iqd,
    outstanding_debt_usd: outstandingDebtUsd,
    outstanding_debt_iqd: outstandingDebtIqd,
    stock_value_purchase_usd: stock.stock_value_purchase_usd || 0,
    stock_value_sale_usd: stock.stock_value_sale_usd || 0,
    total_tires_count: stock.total_tires_count || 0,
    popular_tires: popularTires,
    total_profit_usd: totalProfitUsd,
    total_expenses_iqd: totalExpensesIqd
  });
});


// 6. Sold Items Summary Endpoint
app.get("/api/tire-reports/sold-items", adminOrTire, (req, res) => {
  const from = req.query.from || "";
  const to = req.query.to || "";

  // کۆی گشتی پارەی دراو بۆ مخزن (نرخی کڕین × بڕی سەرەتایی)
  // ئەمە هەموو تایەکانی مخزن دەگرێتەوە: ئەوانەی ماوە + ئەوانەی فرۆشراوە
  const currentStock = db.prepare(`
    SELECT 
      COALESCE(SUM(quantity * purchase_price_usd), 0) AS current_stock_cost_usd,
      COALESCE(SUM(quantity), 0) AS current_stock_qty
    FROM tires_inventory
  `).get();

  // کۆی تایەی فرۆشراو و نرخی کڕینی هەر تایەیەک
  let soldSql = `
    SELECT 
      t.name AS tire_name,
      t.size AS tire_size,
      t.purchase_price_usd,
      SUM(i.quantity) AS total_sold_qty,
      SUM(i.quantity * i.price_usd) AS total_revenue_usd,
      SUM(i.quantity * t.purchase_price_usd) AS total_cost_usd
    FROM tire_sale_items i
    JOIN tires_inventory t ON t.id = i.tire_id
    JOIN tire_sales s ON s.id = i.sale_id
    WHERE 1=1
  `;
  const soldParams = [];
  if (from) { soldSql += " AND s.sale_date >= ?"; soldParams.push(from); }
  if (to) { soldSql += " AND s.sale_date <= ?"; soldParams.push(to); }
  soldSql += " GROUP BY i.tire_id ORDER BY total_sold_qty DESC";
  const soldItems = db.prepare(soldSql).all(...soldParams);

  // کۆی گشتی فرۆشراو
  const totalSoldQty = soldItems.reduce((acc, item) => acc + (item.total_sold_qty || 0), 0);
  const totalRevenue = soldItems.reduce((acc, item) => acc + (item.total_revenue_usd || 0), 0);
  const totalCostSold = soldItems.reduce((acc, item) => acc + (item.total_cost_usd || 0), 0);
  const totalProfit = totalRevenue - totalCostSold;

  // کۆی گشتی پارەی داو بە مخزن = نرخی کڕینی مخزنی ئێستا + نرخی کڕینی فرۆشراوەکان
  const totalWarehouseInvestment = currentStock.current_stock_cost_usd + totalCostSold;

  // لیستی تەواوی فرۆشتنەکان بە وردەکاری
  let salesDetailSql = `
    SELECT 
      s.id AS sale_id,
      s.sale_date,
      s.payment_type,
      COALESCE(c.name, 'نەقد (کاش)') AS customer_name,
      i.quantity AS sold_qty,
      i.price_usd AS sale_price,
      t.name AS tire_name,
      t.purchase_price_usd,
      (i.quantity * i.price_usd) AS line_revenue,
      (i.quantity * t.purchase_price_usd) AS line_cost,
      (i.quantity * i.price_usd) - (i.quantity * t.purchase_price_usd) AS line_profit
    FROM tire_sale_items i
    JOIN tires_inventory t ON t.id = i.tire_id
    JOIN tire_sales s ON s.id = i.sale_id
    LEFT JOIN tire_customers c ON c.id = s.customer_id
    WHERE 1=1
  `;
  const detailParams = [];
  if (from) { salesDetailSql += " AND s.sale_date >= ?"; detailParams.push(from); }
  if (to) { salesDetailSql += " AND s.sale_date <= ?"; detailParams.push(to); }
  salesDetailSql += " ORDER BY s.sale_date DESC, s.id DESC";
  const salesDetail = db.prepare(salesDetailSql).all(...detailParams);

  res.json({
    current_stock_cost_usd: currentStock.current_stock_cost_usd,
    current_stock_qty: currentStock.current_stock_qty,
    total_sold_qty: totalSoldQty,
    total_revenue_usd: totalRevenue,
    total_cost_sold_usd: totalCostSold,
    total_profit_usd: totalProfit,
    total_warehouse_investment_usd: totalWarehouseInvestment,
    sold_by_tire: soldItems,
    sales_detail: salesDetail,
  });
});


// ─── مسروفاتی تایە (Tire Expenses) ───
app.get("/api/tire-expenses", adminOrTire, (req, res) => {
  const from = req.query.from || "";
  const to = req.query.to || "";
  let sql = "SELECT * FROM tire_expenses WHERE 1=1";
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

app.post("/api/tire-expenses", adminOrTire, (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  const amount_iqd = Number(req.body?.amount_iqd) || 0;
  const expense_date = String(req.body?.expense_date ?? "").trim();
  const note = String(req.body?.note ?? "").trim();

  if (!title) return res.status(400).json({ error: "ناوی مسروف پێویستە" });
  if (amount_iqd <= 0) return res.status(400).json({ error: "بڕی مسروف دەبێت لە سفر گەورەتر بێت" });
  if (!expense_date) return res.status(400).json({ error: "ڕێکەوت پێویستە" });

  try {
    const info = db.prepare(`
      INSERT INTO tire_expenses (title, amount_iqd, expense_date, note)
      VALUES (?, ?, ?, ?)
    `).run(title, amount_iqd, expense_date, note);
    const row = db.prepare("SELECT * FROM tire_expenses WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    console.error("Error adding tire expense:", err);
    res.status(500).json({ error: "تۆمارکردنی مسروف سەرنەکەوت" });
  }
});

app.delete("/api/tire-expenses/:id", adminOrTire, (req, res) => {
  const id = Number(req.params.id);
  try {
    const info = db.prepare("DELETE FROM tire_expenses WHERE id = ?").run(id);
    if (info.changes === 0) return res.status(404).json({ error: "مسروفەکە نەدۆزرایەوە" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Error deleting tire expense:", err);
    res.status(500).json({ error: "سڕینەوەی مسروف سەرنەکەوت" });
  }
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
