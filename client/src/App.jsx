import React, { useCallback, useEffect, useMemo, useState } from "react";

const API = "/api";

const CURRENCY_OPTIONS = ["دۆلار ($)", "دینار (د.ع)", "هەردووک"];

/** تەنها دوو جۆر مامەڵە؛ دراو لە «جۆری دراو» دیاری دەکرێت. */
const TXN_TYPES = ["قەرز", "واسڵ"];

const EXPENSE_CATEGORIES = [
  "گشتی",
  "گواستنەوە",
  "مووچە",
  "کرێ",
  "کارەبا و ئاو",
  "چاککردنەوە",
  "هیتر",
];

/** کام خانەی بڕ دەتوانرێت پڕ بکرێتەوە (ئەوانی تر disabled دەبن). */
function getFieldMask(txnType, currencyKind) {
  const z = { debt_usd: false, payment_usd: false, debt_iqd: false, payment_iqd: false };
  const ck = String(currencyKind);
  const dollar = ck.includes("دۆلار") && !ck.includes("هەردوو");
  const dinar = ck.includes("دینار") && !ck.includes("هەردوو");
  const both = ck.includes("هەردوو");

  if (txnType === "قەرز") {
    if (both) return { ...z, debt_usd: true, debt_iqd: true };
    if (dinar) return { ...z, debt_iqd: true };
    if (dollar) return { ...z, debt_usd: true };
    return { ...z, debt_usd: true };
  }
  if (txnType === "واسڵ") {
    if (both) return { ...z, payment_usd: true, payment_iqd: true };
    if (dinar) return { ...z, payment_iqd: true };
    if (dollar) return { ...z, payment_usd: true };
    return { ...z, payment_usd: true };
  }

  /* تۆمارە کۆنەکان لە داتابەیس */
  return { debt_usd: true, payment_usd: true, debt_iqd: true, payment_iqd: true };
}

function num(v) {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(n, cur) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  try {
    if (cur === "usd") return x.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " $";
    return x.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " د.ع";
  } catch {
    if (cur === "usd") return x.toFixed(2) + " $";
    return String(Math.round(x)) + " د.ع";
  }
}

/** وەڵامی fetch تەنها جارێک دەخوێنێتەوە و پەیامی هەڵە دەگەڕێتەوە */
function parseJsonFromText(raw) {
  if (!raw || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function humanApiFailure(status, raw) {
  const j = parseJsonFromText(raw);
  if (j && (j.error || j.message)) return String(j.error || j.message);
  const snippet = String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  if (snippet && snippet.startsWith("<")) {
    return `سێرڤەری API دەست ناکەوێت (${status}). لە فۆڵدەری پڕۆژەکە «npm run dev» بکە (سێرڤەر + Vite).`;
  }
  if (status === 404) {
    return (
      "API نەدۆزرایەوە (404). زۆرجار سێرڤەری Node کاردەکات یان پۆرتی هەڵە هەیە.\n" +
      "• لە فۆڵدەری پڕۆژەکە (gazxanarebaz) بنووسە: npm run dev — نەک تەنها «vite» لە ناو client.\n" +
      "• لە .env ئەگەر API_PORT گۆڕیت، دڵنیابە هەمان ژمارە لە سێرڤەردا بەکار دەهێنرێت.\n" +
      '• تاقی بکەوە لە وێبگەڕ: http://127.0.0.1:3001/api/health — دەبێت {"ok":true} ببینیت.'
    );
  }
  if (snippet) return `${snippet} (${status})`;
  return `کێشەی تۆڕ (${status})`;
}

/* ─── ئەیکۆنەکانی تابەکان (SVG) ─── */
const IconDaily = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);
const IconDebtors = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconExpenses = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);
const IconReport = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M18 20V10M12 20V4M6 20v-6" />
  </svg>
);

export default function App() {
  const [tab, setTab] = useState("daily");
  const [debtors, setDebtors] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  const [debtorForm, setDebtorForm] = useState({ name: "", phone: "", note: "" });
  const [nameSearch, setNameSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [summary, setSummary] = useState(null);

  /** لە بەشی قەرزداران: کاتێک ناو دەگرین کورتەی قەرز پیشان دەدرێت */
  const [debtorsFocusId, setDebtorsFocusId] = useState("");
  const [debtorsFocusDetail, setDebtorsFocusDetail] = useState(null);
  const [debtorSearch, setDebtorSearch] = useState("");

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [txnForm, setTxnForm] = useState({
    txn_date: today,
    currency_kind: CURRENCY_OPTIONS[0],
    txn_type: TXN_TYPES[0],
    debt_usd: "",
    payment_usd: "",
    debt_iqd: "",
    payment_iqd: "",
  });

  /* ─── مسروفات state ─── */
  const [expenses, setExpenses] = useState([]);
  const [expForm, setExpForm] = useState({
    title: "",
    category: EXPENSE_CATEGORIES[0],
    amount_usd: "",
    amount_iqd: "",
    expense_date: today,
    note: "",
  });
  const [expFilterFrom, setExpFilterFrom] = useState("");
  const [expFilterTo, setExpFilterTo] = useState("");

  /* ─── ڕاپۆرت state ─── */
  const [report, setReport] = useState(null);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [reportLoading, setReportLoading] = useState(false);

  /* ───────── API helpers ───────── */

  const loadDebtors = useCallback(async () => {
    const r = await fetch(`${API}/debtors`);
    const raw = await r.text();
    if (!r.ok) {
      throw new Error(humanApiFailure(r.status, raw));
    }
    const list = parseJsonFromText(raw);
    if (!Array.isArray(list)) throw new Error("وەڵامی سێرڤەر نادروستە");
    setDebtors(list);
  }, []);

  const loadTxns = useCallback(async (debtorId, q) => {
    const p = new URLSearchParams();
    if (debtorId) p.set("debtor_id", String(debtorId));
    if (q.trim()) p.set("q", q.trim());
    const r = await fetch(`${API}/transactions?` + p.toString());
    const raw = await r.text();
    if (!r.ok) {
      throw new Error(humanApiFailure(r.status, raw));
    }
    const list = parseJsonFromText(raw);
    if (!Array.isArray(list)) throw new Error("وەڵامی سێرڤەر نادروستە");
    setTransactions(list);
  }, []);

  const loadExpenses = useCallback(async () => {
    const p = new URLSearchParams();
    if (expFilterFrom) p.set("from", expFilterFrom);
    if (expFilterTo) p.set("to", expFilterTo);
    const r = await fetch(`${API}/expenses?` + p.toString());
    const raw = await r.text();
    if (!r.ok) throw new Error(humanApiFailure(r.status, raw));
    const list = parseJsonFromText(raw);
    if (!Array.isArray(list)) throw new Error("وەڵامی سێرڤەر نادروستە");
    setExpenses(list);
  }, [expFilterFrom, expFilterTo]);

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const p = new URLSearchParams();
      if (reportFrom) p.set("from", reportFrom);
      if (reportTo) p.set("to", reportTo);
      const r = await fetch(`${API}/reports/summary?` + p.toString());
      const raw = await r.text();
      if (!r.ok) throw new Error(humanApiFailure(r.status, raw));
      const j = parseJsonFromText(raw);
      setReport(j);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setReportLoading(false);
    }
  }, [reportFrom, reportTo]);

  const refreshDebtors = useCallback(async () => {
    setErr("");
    try {
      await loadDebtors();
    } catch (e) {
      setErr(String(e?.message || e) || "پەیوەندی لەگەڵ سێرڤەر سەرکەوتوو نەبوو.");
    }
  }, [loadDebtors]);

  const refreshTxns = useCallback(async () => {
    try {
      await loadTxns(selectedId || null, nameSearch);
    } catch (e) {
      setErr(String(e?.message || e) || "پەیوەندی لەگەڵ سێرڤەر سەرکەوتوو نەبوو.");
    }
  }, [loadTxns, selectedId, nameSearch]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      await refreshDebtors();
      if (!cancel) setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [refreshDebtors]);

  useEffect(() => {
    refreshTxns();
  }, [refreshTxns]);

  useEffect(() => {
    if (!selectedId) {
      setSummary(null);
      return;
    }
    let cancel = false;
    (async () => {
      const r = await fetch(`${API}/debtors/${selectedId}/summary`);
      if (!cancel && r.ok) setSummary(await r.json());
    })();
    return () => {
      cancel = true;
    };
  }, [selectedId, debtors, transactions]);

  useEffect(() => {
    if (tab !== "debtors" || !debtorsFocusId) {
      setDebtorsFocusDetail(null);
      return;
    }
    let cancel = false;
    (async () => {
      const r = await fetch(`${API}/debtors/${debtorsFocusId}/summary`);
      if (!cancel && r.ok) setDebtorsFocusDetail(await r.json());
      else if (!cancel) setDebtorsFocusDetail(null);
    })();
    return () => {
      cancel = true;
    };
  }, [tab, debtorsFocusId, debtors, transactions]);

  /* بارکردنی مسروفات کاتێک تاب دەبێتە expenses */
  useEffect(() => {
    if (tab === "expenses") loadExpenses();
  }, [tab, loadExpenses]);

  /* بارکردنی ڕاپۆرت کاتێک تاب دەبێتە report */
  useEffect(() => {
    if (tab === "report") loadReport();
  }, [tab, loadReport]);

  /* ───────── Debtor actions ───────── */

  async function addDebtor(e) {
    e.preventDefault();
    setErr("");
    setInfoMsg("");
    try {
      const r = await fetch(`${API}/debtors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(debtorForm),
      });
      const raw = await r.text();
      if (!r.ok) {
        setErr(humanApiFailure(r.status, raw));
        return;
      }
      const j = parseJsonFromText(raw);
      if (!j || j.id == null) {
        setErr("وەڵامی سێرڤەر نادروستە");
        return;
      }
      setDebtorForm({ name: "", phone: "", note: "" });
      await refreshDebtors();
      await refreshTxns();
      setInfoMsg("قەرزدار بە سەرکەوتوویی تۆمار کرا.");
      window.setTimeout(() => setInfoMsg(""), 4000);
    } catch (ex) {
      setErr(String(ex?.message || ex) || "پەیوەندی سێرڤەر سەرکەوتوو نەبوو.");
    }
  }

  async function removeDebtor(id) {
    if (!confirm("سڕینەوەی ئەم قەرزدارە و هەموو مامەڵەکانی؟")) return;
    await fetch(`${API}/debtors/${id}`, { method: "DELETE" });
    if (String(selectedId) === String(id)) setSelectedId("");
    if (String(debtorsFocusId) === String(id)) setDebtorsFocusId("");
    await refreshDebtors();
    await refreshTxns();
  }

  async function refreshDebtorFocusSummary() {
    if (!debtorsFocusId) return;
    const r = await fetch(`${API}/debtors/${debtorsFocusId}/summary`);
    if (r.ok) setDebtorsFocusDetail(await r.json());
  }

  /* ───────── Transaction actions ───────── */

  async function submitTxn(e) {
    e.preventDefault();
    setErr("");
    setInfoMsg("");
    if (!selectedId) {
      setErr("سەرەتا قەرزدار هەڵبژێرە: لە فۆڕمی «هەڵبژاردنی قەرزدار» ناو بنووسە یان لە لیست هەڵبژێرە.");
      return;
    }
    const m = getFieldMask(txnForm.txn_type, txnForm.currency_kind);
    const body = {
      debtor_id: Number(selectedId),
      txn_date: txnForm.txn_date,
      currency_kind: txnForm.currency_kind,
      txn_type: txnForm.txn_type,
      debt_usd: m.debt_usd ? num(txnForm.debt_usd) : 0,
      payment_usd: m.payment_usd ? num(txnForm.payment_usd) : 0,
      debt_iqd: m.debt_iqd ? num(txnForm.debt_iqd) : 0,
      payment_iqd: m.payment_iqd ? num(txnForm.payment_iqd) : 0,
    };
    const r = await fetch(`${API}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await r.text();
    if (!r.ok) {
      setErr(humanApiFailure(r.status, raw));
      return;
    }
    setTxnForm((f) => ({
      ...f,
      debt_usd: "",
      payment_usd: "",
      debt_iqd: "",
      payment_iqd: "",
    }));
    await refreshTxns();
    if (debtorsFocusId && String(debtorsFocusId) === String(selectedId)) {
      await refreshDebtorFocusSummary();
    }
    setInfoMsg("مامەڵە بە سەرکەوتوویی تۆمار کرا.");
    window.setTimeout(() => setInfoMsg(""), 4000);
  }

  async function deleteTxn(id) {
    if (!confirm("سڕینەوەی ئەم ڕیزە؟")) return;
    await fetch(`${API}/transactions/${id}`, { method: "DELETE" });
    await refreshTxns();
    if (debtorsFocusId) await refreshDebtorFocusSummary();
    setInfoMsg("مامەڵە سڕایەوە.");
    window.setTimeout(() => setInfoMsg(""), 3000);
  }

  /* ───────── Expense actions ───────── */

  async function submitExpense(e) {
    e.preventDefault();
    setErr("");
    setInfoMsg("");
    const body = {
      title: expForm.title.trim(),
      category: expForm.category,
      amount_usd: num(expForm.amount_usd),
      amount_iqd: num(expForm.amount_iqd),
      expense_date: expForm.expense_date,
      note: expForm.note.trim(),
    };
    try {
      const r = await fetch(`${API}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await r.text();
      if (!r.ok) {
        setErr(humanApiFailure(r.status, raw));
        return;
      }
      setExpForm((f) => ({ ...f, title: "", amount_usd: "", amount_iqd: "", note: "" }));
      await loadExpenses();
      setInfoMsg("مسروف بە سەرکەوتوویی تۆمار کرا.");
      window.setTimeout(() => setInfoMsg(""), 4000);
    } catch (ex) {
      setErr(String(ex?.message || ex));
    }
  }

  async function deleteExpense(id) {
    if (!confirm("سڕینەوەی ئەم مسروفە؟")) return;
    await fetch(`${API}/expenses/${id}`, { method: "DELETE" });
    await loadExpenses();
    setInfoMsg("مسروف سڕایەوە.");
    window.setTimeout(() => setInfoMsg(""), 3000);
  }

  /* ───────── Computed ───────── */

  const filteredDebtorPick = useMemo(() => {
    const q = nameSearch.trim().toLowerCase();
    if (!q) return debtors;
    return debtors.filter((d) => String(d.name || "").toLowerCase().includes(q));
  }, [debtors, nameSearch]);

  const fieldMask = useMemo(
    () => getFieldMask(txnForm.txn_type, txnForm.currency_kind),
    [txnForm.txn_type, txnForm.currency_kind]
  );

  const expenseTotals = useMemo(() => {
    let usd = 0, iqd = 0;
    expenses.forEach((e) => { usd += e.amount_usd || 0; iqd += e.amount_iqd || 0; });
    return { usd, iqd };
  }, [expenses]);

  const debtorsTotals = useMemo(() => {
    let usd = 0, iqd = 0;
    debtors.forEach((d) => {
      usd += d.balance_usd || 0;
      iqd += d.balance_iqd || 0;
    });
    return { usd, iqd };
  }, [debtors]);

  const filteredDebtors = useMemo(() => {
    const q = debtorSearch.trim().toLowerCase();
    if (!q) return debtors;
    return debtors.filter(
      (d) =>
        String(d.name || "").toLowerCase().includes(q) ||
        String(d.phone || "").toLowerCase().includes(q) ||
        String(d.note || "").toLowerCase().includes(q)
    );
  }, [debtors, debtorSearch]);

  function patchTxnForm(updates) {
    setTxnForm((prev) => {
      const next = { ...prev, ...updates };
      const mask = getFieldMask(next.txn_type, next.currency_kind);
      if (!mask.debt_usd) next.debt_usd = "";
      if (!mask.payment_usd) next.payment_usd = "";
      if (!mask.debt_iqd) next.debt_iqd = "";
      if (!mask.payment_iqd) next.payment_iqd = "";
      return next;
    });
  }

  function switchTab(t) {
    setTab(t);
    setErr("");
    setInfoMsg("");
  }

  /* ═══════════════════════════════════════════ RENDER ═══════════════════════════════════════════ */

  return (
    <div className="app">
      <header className="top">
        <h1>گازخانە — بەڕێوەبردنی قەرز و مامەڵە</h1>
        <p className="sub">تابی قەرزداران بۆ تۆمار و کورتە؛ مامەڵەی ڕۆژانە بۆ قەرز و واسڵ؛ مسروفات بۆ خەرجی؛ ڕاپۆرت بۆ ئامار.</p>
        <nav className="tabs">
          <button type="button" className={tab === "daily" ? "on" : ""} onClick={() => switchTab("daily")}>
            <IconDaily /> مامەڵەی ڕۆژانە
          </button>
          <button type="button" className={tab === "debtors" ? "on" : ""} onClick={() => switchTab("debtors")}>
            <IconDebtors /> قەرزداران
          </button>
          <button type="button" className={tab === "expenses" ? "on" : ""} onClick={() => switchTab("expenses")}>
            <IconExpenses /> مسروفات
          </button>
          <button type="button" className={tab === "report" ? "on" : ""} onClick={() => switchTab("report")}>
            <IconReport /> ڕاپۆرت
          </button>
        </nav>
      </header>

      {err ? <div className="banner err">{err}</div> : null}
      {infoMsg ? <div className="banner ok">{infoMsg}</div> : null}
      {loading ? <div className="banner">بارکردن…</div> : null}

      {/* ═══════ TAB: قەرزداران ═══════ */}
      {tab === "debtors" ? (
        <div className="tab-panels">
          <section className="card" aria-labelledby="debtor-add-heading">
            <h2 id="debtor-add-heading">زیادکردنی قەرزدار</h2>
            <form className="grid-form" onSubmit={addDebtor}>
              <label>
                ناو
                <input
                  value={debtorForm.name}
                  onChange={(e) => setDebtorForm({ ...debtorForm, name: e.target.value })}
                  placeholder="ناوی شۆفێر یان کڕیار"
                  required
                />
              </label>
              <label>
                مۆبایل
                <input
                  value={debtorForm.phone}
                  onChange={(e) => setDebtorForm({ ...debtorForm, phone: e.target.value })}
                  placeholder="0750…"
                />
              </label>
              <label className="span2">
                تێبینی
                <input
                  value={debtorForm.note}
                  onChange={(e) => setDebtorForm({ ...debtorForm, note: e.target.value })}
                />
              </label>
              <button type="submit" className="primary">
                زیادکردن
              </button>
            </form>
          </section>

          {/* کورتەی کۆی گشتی قەرزداران */}
          <section className="card">
            <div className="expense-summary-bar" style={{ background: "var(--debt-bg)", borderColor: "var(--debt-border)" }}>
              <div className="expense-total">
                <span className="lbl" style={{ color: "var(--text)" }}>کۆی گشتی قەرزەکان بە دۆلار ($)</span>
                <strong className="expense-amount" style={{ color: "var(--owe)" }}>{fmtMoney(debtorsTotals.usd, "usd")}</strong>
              </div>
              <div className="expense-total">
                <span className="lbl" style={{ color: "var(--text)" }}>کۆی گشتی قەرزەکان بە دینار (د.ع)</span>
                <strong className="expense-amount" style={{ color: "var(--owe)" }}>{fmtMoney(debtorsTotals.iqd, "iqd")}</strong>
              </div>
            </div>
          </section>

          <section className="card" aria-labelledby="debtor-list-heading">
            <div className="section-head">
              <h2 id="debtor-list-heading">لیستی قەرزداران</h2>
              <div className="filter-row">
                <label className="filter-label">
                  گەڕان بەپێی ناو یان مۆبایل
                  <input
                    value={debtorSearch}
                    onChange={(e) => setDebtorSearch(e.target.value)}
                    placeholder="بنووسە بۆ گەڕان…"
                    style={{ width: "220px" }}
                  />
                </label>
              </div>
            </div>
            <p className="muted hint-inline">بۆ بینینی وردەکاری و لیستی تەواوی مامەڵەکان، لەسەر ناوی قەرزدارەکە کلیک بکە.</p>
            <div className="table-wrap desktop-only">
              <table className="data">
                <thead>
                  <tr>
                    <th>ناو</th>
                    <th>مۆبایل</th>
                    <th>ماوەی قەرز ($)</th>
                    <th>ماوەی قەرز (د.ع)</th>
                    <th>تێبینی</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDebtors.map((d) => (
                    <tr key={d.id} className={String(debtorsFocusId) === String(d.id) ? "row-focus" : ""}>
                      <td>
                        <button
                          type="button"
                          className="name-link"
                          onClick={() => setDebtorsFocusId(String(d.id))}
                        >
                          {d.name}
                        </button>
                      </td>
                      <td>{d.phone}</td>
                      <td className="num debt" style={{ fontWeight: "600" }}>{d.balance_usd ? fmtMoney(d.balance_usd, "usd") : "0 $"}</td>
                      <td className="num debt" style={{ fontWeight: "600" }}>{d.balance_iqd ? fmtMoney(d.balance_iqd, "iqd") : "0 د.ع"}</td>
                      <td className="muted">{d.note}</td>
                      <td>
                        <button type="button" className="danger link" onClick={() => removeDebtor(d.id)}>
                          سڕینەوە
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredDebtors.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                        هیچ قەرزدارێک نەدۆزرایەوە.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mobile-only debtor-cards">
              {filteredDebtors.map((d) => (
                <div key={d.id} className={`debtor-card-item ${String(debtorsFocusId) === String(d.id) ? "active" : ""}`}>
                  <div className="debtor-card-header">
                    <button
                      type="button"
                      className="name-link"
                      onClick={() => setDebtorsFocusId(String(d.id))}
                    >
                      {d.name}
                    </button>
                    {d.phone && <span className="phone-num num">{d.phone}</span>}
                  </div>
                  <div className="debtor-card-balances">
                    <div className="bal-item">
                      <span className="lbl">قەرز ($):</span>
                      <span className="val num debt">{d.balance_usd ? fmtMoney(d.balance_usd, "usd") : "0 $"}</span>
                    </div>
                    <div className="bal-item">
                      <span className="lbl">قەرز (د.ع):</span>
                      <span className="val num debt">{d.balance_iqd ? fmtMoney(d.balance_iqd, "iqd") : "0 د.ع"}</span>
                    </div>
                  </div>
                  {d.note && <div className="debtor-card-note muted">{d.note}</div>}
                  <div className="debtor-card-actions">
                    <button type="button" className="danger link" onClick={() => removeDebtor(d.id)}>
                      سڕینەوە
                    </button>
                  </div>
                </div>
              ))}
              {filteredDebtors.length === 0 ? (
                <div className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                  هیچ قەرزدارێک نەدۆزرایەوە.
                </div>
              ) : null}
            </div>
          </section>

          {debtorsFocusId && debtorsFocusDetail ? (
            <section className="card debtor-summary-card" aria-labelledby="debtor-summary-heading">
              <div className="debtor-detail-head">
                <h2 id="debtor-summary-heading">کورتەی قەرز — {debtorsFocusDetail.name}</h2>
                <div className="debtor-detail-actions">
                  <button type="button" className="ghost" onClick={() => refreshDebtorFocusSummary()}>
                    نوێکردنەوە
                  </button>
                  <button type="button" className="ghost" onClick={() => setDebtorsFocusId("")}>
                    داخستن
                  </button>
                </div>
              </div>
              {debtorsFocusDetail.phone ? (
                <p className="muted small">مۆبایل: {debtorsFocusDetail.phone}</p>
              ) : null}
              {debtorsFocusDetail.note ? (
                <p className="muted small">تێبینی: {debtorsFocusDetail.note}</p>
              ) : null}
              <div className="balance-bar debtor-totals">
                <div>
                  <span className="lbl">کۆی قەرز بە دۆلار</span>
                  <strong className={debtorsFocusDetail.balance_usd > 0 ? "owe" : "ok"}>
                    {fmtMoney(debtorsFocusDetail.balance_usd, "usd")}
                  </strong>
                </div>
                <div>
                  <span className="lbl">کۆی قەرز بە دینار</span>
                  <strong className={debtorsFocusDetail.balance_iqd > 0 ? "owe" : "ok"}>
                    {fmtMoney(debtorsFocusDetail.balance_iqd, "iqd")}
                  </strong>
                </div>
              </div>
            </section>
          ) : debtorsFocusId ? (
            <section className="card">
              <div className="banner">بارکردنی کورتە…</div>
            </section>
          ) : null}
        </div>
      ) : null}

      {/* ═══════ TAB: مامەڵەی ڕۆژانە ═══════ */}
      {tab === "daily" ? (
        <div className="tab-panels">
          <section className="card card-compact" aria-labelledby="daily-pick-heading">
            <div className="daily-top-row">
              <div className="daily-pick">
                <h2 id="daily-pick-heading">هەڵبژاردنی قەرزدار</h2>
                <div className="search-row compact">
                  <label className="grow">
                    گەڕان / ناو
                    <input
                      list="debtor-names"
                      value={nameSearch}
                      onChange={(e) => {
                        setNameSearch(e.target.value);
                        const match = debtors.find(
                          (d) => String(d.name || "").toLowerCase() === e.target.value.trim().toLowerCase()
                        );
                        if (match) setSelectedId(String(match.id));
                      }}
                      placeholder="بنوسە یان لە لیست هەڵبژێرە"
                    />
                    <datalist id="debtor-names">
                      {debtors.map((d) => (
                        <option key={d.id} value={String(d.name ?? "")} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    قەرزدار
                    <select
                      value={selectedId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedId(v);
                        const d = debtors.find((x) => String(x.id) === v);
                        if (d) setNameSearch(d.name);
                      }}
                    >
                      <option value="">— هەڵبژێرە —</option>
                      {filteredDebtorPick.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {summary ? (
                <div className="balance-inline">
                  <div>
                    <span className="lbl">قەرزی ماوە ($)</span>
                    <strong className={summary.balance_usd > 0 ? "owe" : "ok"}>
                      {fmtMoney(summary.balance_usd, "usd")}
                    </strong>
                  </div>
                  <div>
                    <span className="lbl">قەرزی ماوە (د.ع)</span>
                    <strong className={summary.balance_iqd > 0 ? "owe" : "ok"}>
                      {fmtMoney(summary.balance_iqd, "iqd")}
                    </strong>
                  </div>
                </div>
              ) : !selectedId ? (
                <div className="balance-inline empty">
                  <span className="muted">قەرزدار هەڵبژێرە</span>
                </div>
              ) : null}
            </div>

            <hr className="divider" />

            <h2 id="daily-txn-heading" className="h2-sm">مامەڵەی ڕۆژانە</h2>
            <form className="txn-form compact" onSubmit={submitTxn}>
              <div className="txn-grid-compact">
                <label>
                  ڕێکەوت
                  <input
                    type="date"
                    value={txnForm.txn_date}
                    onChange={(e) => setTxnForm({ ...txnForm, txn_date: e.target.value })}
                    required
                  />
                </label>
                <label>
                  جۆری دراو
                  <select
                    value={txnForm.currency_kind}
                    onChange={(e) => patchTxnForm({ currency_kind: e.target.value })}
                  >
                    {CURRENCY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  جۆری مامەڵە
                  <select
                    value={txnForm.txn_type}
                    onChange={(e) => patchTxnForm({ txn_type: e.target.value })}
                  >
                    {TXN_TYPES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="primary compact-btn" disabled={!selectedId}>
                  تۆمارکردن
                </button>
              </div>
              <div className="amount-row">
                <label className={`cell-sm debt${fieldMask.debt_usd ? "" : " off"}`}>
                  قەرز ($)
                  <input
                    inputMode="decimal"
                    value={txnForm.debt_usd}
                    disabled={!fieldMask.debt_usd}
                    onChange={(e) => setTxnForm({ ...txnForm, debt_usd: e.target.value })}
                    placeholder="0"
                  />
                </label>
                <label className={`cell-sm pay${fieldMask.payment_usd ? "" : " off"}`}>
                  واسڵ ($)
                  <input
                    inputMode="decimal"
                    value={txnForm.payment_usd}
                    disabled={!fieldMask.payment_usd}
                    onChange={(e) => setTxnForm({ ...txnForm, payment_usd: e.target.value })}
                    placeholder="0"
                  />
                </label>
                <label className={`cell-sm debt${fieldMask.debt_iqd ? "" : " off"}`}>
                  قەرز (د.ع)
                  <input
                    inputMode="numeric"
                    value={txnForm.debt_iqd}
                    disabled={!fieldMask.debt_iqd}
                    onChange={(e) => setTxnForm({ ...txnForm, debt_iqd: e.target.value })}
                    placeholder="0"
                  />
                </label>
                <label className={`cell-sm pay${fieldMask.payment_iqd ? "" : " off"}`}>
                  واسڵ (د.ع)
                  <input
                    inputMode="numeric"
                    value={txnForm.payment_iqd}
                    disabled={!fieldMask.payment_iqd}
                    onChange={(e) => setTxnForm({ ...txnForm, payment_iqd: e.target.value })}
                    placeholder="0"
                  />
                </label>
              </div>
            </form>
          </section>

          <section className="card" aria-labelledby="daily-list-heading">
            <h2 id="daily-list-heading">دوایین مامەڵەکان</h2>
            <div className="table-wrap scroll desktop-only">
              <table className="data compact">
                <thead>
                  <tr>
                    <th>ڕێکەوت</th>
                    <th>ناو</th>
                    <th>جۆری مامەڵە</th>
                    <th>قەرز $</th>
                    <th>پارە $</th>
                    <th>قەرز د.ع</th>
                    <th>واسڵ د.ع</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id}>
                      <td>{t.txn_date}</td>
                      <td>{t.debtor_name}</td>
                      <td className="muted">{t.txn_type}</td>
                      <td className="num debt">{t.debt_usd ? fmtMoney(t.debt_usd, "usd") : "—"}</td>
                      <td className="num pay">{t.payment_usd ? fmtMoney(t.payment_usd, "usd") : "—"}</td>
                      <td className="num debt">{t.debt_iqd ? fmtMoney(t.debt_iqd, "iqd") : "—"}</td>
                      <td className="num pay">{t.payment_iqd ? fmtMoney(t.payment_iqd, "iqd") : "—"}</td>
                      <td>
                        <button type="button" className="danger link" onClick={() => deleteTxn(t.id)}>
                          سڕینەوە
                        </button>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                        هیچ مامەڵەیەک تۆمار نەکراوە.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mobile-only txn-cards">
              {transactions.map((t) => (
                <div key={t.id} className="txn-card-item">
                  <div className="txn-card-header">
                    <span className="txn-card-name">{t.debtor_name}</span>
                    <span className="txn-card-date num">{t.txn_date}</span>
                  </div>
                  <div className="txn-card-body">
                    <span className="txn-card-type muted">{t.txn_type}</span>
                    <div className="txn-card-amounts">
                      {t.debt_usd ? <div className="amount-val num debt">قەرز: {fmtMoney(t.debt_usd, "usd")}</div> : null}
                      {t.payment_usd ? <div className="amount-val num pay">واسڵ: {fmtMoney(t.payment_usd, "usd")}</div> : null}
                      {t.debt_iqd ? <div className="amount-val num debt">قەرز: {fmtMoney(t.debt_iqd, "iqd")}</div> : null}
                      {t.payment_iqd ? <div className="amount-val num pay">واسڵ: {fmtMoney(t.payment_iqd, "iqd")}</div> : null}
                    </div>
                  </div>
                  <div className="txn-card-actions">
                    <button type="button" className="danger link" onClick={() => deleteTxn(t.id)}>
                      سڕینەوە
                    </button>
                  </div>
                </div>
              ))}
              {transactions.length === 0 ? (
                <div className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                  هیچ مامەڵەیەک تۆمار نەکراوە.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {/* ═══════ TAB: مسروفات ═══════ */}
      {tab === "expenses" ? (
        <div className="tab-panels">
          <section className="card" aria-labelledby="exp-add-heading">
            <h2 id="exp-add-heading">زیادکردنی مسروف</h2>
            <form className="grid-form" onSubmit={submitExpense}>
              <label>
                ناونیشان
                <input
                  value={expForm.title}
                  onChange={(e) => setExpForm({ ...expForm, title: e.target.value })}
                  placeholder="بۆ چی خەرج کرا؟"
                  required
                />
              </label>
              <label>
                کاتیگۆری
                <select
                  value={expForm.category}
                  onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                بڕ بە دۆلار ($)
                <input
                  inputMode="decimal"
                  value={expForm.amount_usd}
                  onChange={(e) => setExpForm({ ...expForm, amount_usd: e.target.value })}
                  placeholder="0"
                />
              </label>
              <label>
                بڕ بە دینار (د.ع)
                <input
                  inputMode="numeric"
                  value={expForm.amount_iqd}
                  onChange={(e) => setExpForm({ ...expForm, amount_iqd: e.target.value })}
                  placeholder="0"
                />
              </label>
              <label>
                ڕێکەوت
                <input
                  type="date"
                  value={expForm.expense_date}
                  onChange={(e) => setExpForm({ ...expForm, expense_date: e.target.value })}
                  required
                />
              </label>
              <label>
                تێبینی
                <input
                  value={expForm.note}
                  onChange={(e) => setExpForm({ ...expForm, note: e.target.value })}
                  placeholder="ئیختیاری"
                />
              </label>
              <button type="submit" className="primary">
                تۆمارکردنی مسروف
              </button>
            </form>
          </section>

          {/* کورتەی مسروفات */}
          <section className="card">
            <div className="expense-summary-bar">
              <div className="expense-total">
                <span className="lbl">کۆی مسروفات ($)</span>
                <strong className="expense-amount">{fmtMoney(expenseTotals.usd, "usd")}</strong>
              </div>
              <div className="expense-total">
                <span className="lbl">کۆی مسروفات (دینار)</span>
                <strong className="expense-amount">{fmtMoney(expenseTotals.iqd, "iqd")}</strong>
              </div>
            </div>
          </section>

          <section className="card" aria-labelledby="exp-list-heading">
            <div className="section-head">
              <h2 id="exp-list-heading">لیستی مسروفات</h2>
              <div className="filter-row">
                <label className="filter-label">
                  لە
                  <input type="date" value={expFilterFrom} onChange={(e) => setExpFilterFrom(e.target.value)} />
                </label>
                <label className="filter-label">
                  بۆ
                  <input type="date" value={expFilterTo} onChange={(e) => setExpFilterTo(e.target.value)} />
                </label>
              </div>
            </div>
            <div className="table-wrap scroll desktop-only">
              <table className="data compact">
                <thead>
                  <tr>
                    <th>ڕێکەوت</th>
                    <th>ناونیشان</th>
                    <th>کاتیگۆری</th>
                    <th>بڕ ($)</th>
                    <th>بڕ (د.ع)</th>
                    <th>تێبینی</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((ex) => (
                    <tr key={ex.id}>
                      <td>{ex.expense_date}</td>
                      <td>{ex.title}</td>
                      <td><span className={`cat-badge cat-${EXPENSE_CATEGORIES.indexOf(ex.category)}`}>{ex.category}</span></td>
                      <td className="num expense-col">{ex.amount_usd ? fmtMoney(ex.amount_usd, "usd") : "—"}</td>
                      <td className="num expense-col">{ex.amount_iqd ? fmtMoney(ex.amount_iqd, "iqd") : "—"}</td>
                      <td className="muted">{ex.note}</td>
                      <td>
                        <button type="button" className="danger link" onClick={() => deleteExpense(ex.id)}>
                          سڕینەوە
                        </button>
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 ? (
                    <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: "2rem" }}>هیچ مسروفێک تۆمار نەکراوە.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mobile-only expense-cards">
              {expenses.map((ex) => (
                <div key={ex.id} className="expense-card-item">
                  <div className="expense-card-header">
                    <span className="title">{ex.title}</span>
                    <span className="date num">{ex.expense_date}</span>
                  </div>
                  <div className="expense-card-body">
                    <span className={`cat-badge cat-${EXPENSE_CATEGORIES.indexOf(ex.category)}`}>{ex.category}</span>
                    <div className="expense-card-amounts">
                      {ex.amount_usd ? <span className="amt usd num">{fmtMoney(ex.amount_usd, "usd")}</span> : null}
                      {ex.amount_iqd ? <span className="amt iqd num">{fmtMoney(ex.amount_iqd, "iqd")}</span> : null}
                    </div>
                  </div>
                  {ex.note && <div className="expense-card-note muted">{ex.note}</div>}
                  <div className="expense-card-actions">
                    <button type="button" className="danger link" onClick={() => deleteExpense(ex.id)}>
                      سڕینەوە
                    </button>
                  </div>
                </div>
              ))}
              {expenses.length === 0 ? (
                <div className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                  هیچ مسروفێک تۆمار نەکراوە.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {/* ═══════ TAB: ڕاپۆرت ═══════ */}
      {tab === "report" ? (
        <div className="tab-panels">
          <section className="card">
            <div className="section-head">
              <h2>ڕاپۆرتی گشتی</h2>
              <div className="filter-row">
                <label className="filter-label">
                  لە
                  <input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} />
                </label>
                <label className="filter-label">
                  بۆ
                  <input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} />
                </label>
                <button type="button" className="ghost" onClick={loadReport}>
                  نوێکردنەوە
                </button>
              </div>
            </div>
          </section>

          {reportLoading ? (
            <section className="card"><div className="banner">بارکردنی ڕاپۆرت…</div></section>
          ) : report ? (
            <>
              {/* کارتەکانی کورتە */}
              <div className="report-cards">
                <div className="rpt-card rpt-debt">
                  <span className="rpt-label">کۆی قەرز</span>
                  <strong>{fmtMoney(report.total_debt_usd, "usd")}</strong>
                  <span className="rpt-sub">{fmtMoney(report.total_debt_iqd, "iqd")}</span>
                </div>
                <div className="rpt-card rpt-pay">
                  <span className="rpt-label">کۆی واسڵ</span>
                  <strong>{fmtMoney(report.total_payment_usd, "usd")}</strong>
                  <span className="rpt-sub">{fmtMoney(report.total_payment_iqd, "iqd")}</span>
                </div>
                <div className="rpt-card rpt-remain">
                  <span className="rpt-label">ماوەی قەرز</span>
                  <strong className={report.remaining_usd > 0 ? "owe" : "ok"}>{fmtMoney(report.remaining_usd, "usd")}</strong>
                  <span className="rpt-sub">{fmtMoney(report.remaining_iqd, "iqd")}</span>
                </div>
                <div className="rpt-card rpt-expense">
                  <span className="rpt-label">کۆی مسروفات</span>
                  <strong>{fmtMoney(report.total_expense_usd, "usd")}</strong>
                  <span className="rpt-sub">{fmtMoney(report.total_expense_iqd, "iqd")}</span>
                </div>
              </div>

              {/* سەرەکیترین قەرزداران */}
              <section className="card" aria-labelledby="rpt-top-heading">
                <h2 id="rpt-top-heading">سەرەکیترین قەرزداران</h2>
                {report.top_debtors.length > 0 ? (
                  <>
                    <div className="table-wrap desktop-only">
                      <table className="data compact">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>ناو</th>
                            <th>قەرزی ماوە ($)</th>
                            <th>قەرزی ماوە (د.ع)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.top_debtors.map((d, i) => (
                            <tr key={i}>
                              <td className="muted">{i + 1}</td>
                              <td>{d.name}</td>
                              <td className="num debt">{fmtMoney(d.balance_usd, "usd")}</td>
                              <td className="num debt">{fmtMoney(d.balance_iqd, "iqd")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mobile-only top-debtor-cards">
                      {report.top_debtors.map((d, i) => (
                        <div key={i} className="top-debtor-card-item">
                          <div className="top-debtor-card-header">
                            <span className="rank" style={{ fontWeight: "600" }}># {i + 1}</span>
                            <span className="name">{d.name}</span>
                          </div>
                          <div className="top-debtor-card-balances">
                            <div className="bal-item">
                              <span className="lbl">قەرزی ماوە ($):</span>
                              <span className="val num debt">{fmtMoney(d.balance_usd, "usd")}</span>
                            </div>
                            <div className="bal-item">
                              <span className="lbl">قەرزی ماوە (د.ع):</span>
                              <span className="val num debt">{fmtMoney(d.balance_iqd, "iqd")}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="muted" style={{ textAlign: "center" }}>هیچ قەرزدارێک نییە.</p>
                )}
              </section>

              {/* مسروفات بە کاتیگۆری */}
              <section className="card" aria-labelledby="rpt-cat-heading">
                <h2 id="rpt-cat-heading">مسروفات بە کاتیگۆری</h2>
                {report.expense_by_category.length > 0 ? (
                  <div className="cat-bars">
                    {report.expense_by_category.map((c, i) => {
                      const maxUsd = Math.max(...report.expense_by_category.map((x) => x.sum_usd), 1);
                      const pct = Math.round((c.sum_usd / maxUsd) * 100);
                      return (
                        <div key={i} className="cat-bar-row">
                          <span className="cat-bar-name">{c.category}</span>
                          <div className="cat-bar-track">
                            <div className="cat-bar-fill" style={{ width: `${Math.max(pct, 4)}%` }}></div>
                          </div>
                          <span className="cat-bar-val">{fmtMoney(c.sum_usd, "usd")}</span>
                          <span className="cat-bar-val sub">{fmtMoney(c.sum_iqd, "iqd")}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted" style={{ textAlign: "center" }}>هیچ مسروفێک تۆمار نەکراوە.</p>
                )}
              </section>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
