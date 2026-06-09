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

/** دیاریکردنی خانەی قازانج لەسەر بنەمای دراو */
function getProfitFieldMask(currencyKind) {
  const ck = String(currencyKind);
  const dollar = ck.includes("دۆلار") && !ck.includes("هەردوو");
  const dinar = ck.includes("دینار") && !ck.includes("هەردوو");
  const both = ck.includes("هەردوو");
  return {
    profit_usd: dollar || both,
    profit_iqd: dinar || both,
  };
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

const IconInventory = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);
const IconTireSales = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z" />
    <path d="M3 6h18M16 10a4 4 0 01-8 0" />
  </svg>
);
const IconTireDebtors = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IconTireReports = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
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
    note: "",
    profit_usd: "",
    profit_iqd: "",
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

  /* ─── تایە فرۆشتن و مخزن state ─── */
  const [tires, setTires] = useState([]);
  const [tireForm, setTireForm] = useState({ name: "", size: "", quantity: "", purchase_price_usd: "", sale_price_usd: "" });
  const [editingTireId, setEditingTireId] = useState(null);
  const [tireSearch, setTireSearch] = useState("");
  
  const [tireCustomers, setTireCustomers] = useState([]);
  const [tireCustomerForm, setTireCustomerForm] = useState({ name: "", phone: "", note: "", initial_balance_usd: "" });
  const [showAddCustomerForm, setShowAddCustomerForm] = useState(false);
  const [tireCustomerSearch, setTireCustomerSearch] = useState("");
  
  const [tireSales, setTireSales] = useState([]);
  const [tireSaleSearch, setTireSaleSearch] = useState("");
  const [tireSaleFilterType, setTireSaleFilterType] = useState("all");
  const [cart, setCart] = useState([]);
  const [cartForm, setCartForm] = useState({ tire_id: "", quantity: "1", price_usd: "" });
  const [saleForm, setSaleForm] = useState({
    sale_date: today,
    customer_id: "",
    payment_type: "نەقد",
    paid_usd: "",
    note: ""
  });
  
  const [tirePayments, setTirePayments] = useState([]);
  const [tirePaymentForm, setTirePaymentForm] = useState({
    customer_id: "",
    payment_date: today,
    amount_usd: "",
    note: ""
  });
  const [activeTireCustomerTab, setActiveTireCustomerTab] = useState("customers"); // customers, payments
  const [focusedTireCustomerId, setFocusedTireCustomerId] = useState("");
  const [focusedTireCustomerDetail, setFocusedTireCustomerDetail] = useState(null);
  
  const [tireReport, setTireReport] = useState(null);
  const [tireReportFrom, setTireReportFrom] = useState("");
  const [tireReportTo, setTireReportTo] = useState("");
  const [tireReportLoading, setTireReportLoading] = useState(false);
  
  const [backupSecret, setBackupSecret] = useState("");
  const [backupErr, setBackupErr] = useState("");

  /* ───────── API helpers ───────── */

  const loadTires = useCallback(async () => {
    const r = await fetch(`${API}/tires`);
    if (r.ok) setTires(await r.json());
  }, []);

  const loadTireCustomers = useCallback(async () => {
    const r = await fetch(`${API}/tire-customers`);
    if (r.ok) setTireCustomers(await r.json());
  }, []);

  const loadTireSales = useCallback(async () => {
    const r = await fetch(`${API}/tire-sales`);
    if (r.ok) setTireSales(await r.json());
  }, []);

  const loadTirePayments = useCallback(async () => {
    const r = await fetch(`${API}/tire-payments`);
    if (r.ok) setTirePayments(await r.json());
  }, []);

  const loadTireReport = useCallback(async () => {
    setTireReportLoading(true);
    try {
      const p = new URLSearchParams();
      if (tireReportFrom) p.set("from", tireReportFrom);
      if (tireReportTo) p.set("to", tireReportTo);
      const r = await fetch(`${API}/tire-reports/summary?` + p.toString());
      if (r.ok) setTireReport(await r.json());
    } finally {
      setTireReportLoading(false);
    }
  }, [tireReportFrom, tireReportTo]);

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

  function handleDownloadBackup() {
    setBackupErr("");
    if (!backupSecret.trim()) {
      setBackupErr("تکایە تێپەڕەوشە بنووسە");
      return;
    }
    const downloadUrl = `${API}/admin/backup-db?secret=${encodeURIComponent(backupSecret)}`;
    fetch(downloadUrl, { method: "HEAD" })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 403) {
            setBackupErr("تێپەڕەوشەی باکئەپ هەڵەیە!");
          } else {
            setBackupErr("کێشەیەک ڕوویدا لە کاتی داگرتن.");
          }
        } else {
          window.location.href = downloadUrl;
          setBackupSecret("");
        }
      })
      .catch(() => {
        setBackupErr("پەیوەندی لەگەڵ سێرڤەر سەرنەکەوت.");
      });
  }

  async function handleResetDatabase() {
    setBackupErr("");
    if (!backupSecret.trim()) {
      setBackupErr("تکایە تێپەڕەوشە بنووسە");
      return;
    }
    if (!confirm("⚠️ ئاگاداری زۆر گرنگ: ئایا دڵنیایت لە سفرکردنەوەی تەواوی داتابەیس؟ هەموو تۆمارەکانی مامەڵە، قەرز، مەسرەف و تایە بە یەکجاری دەسڕێنەوە و ناگەڕێنەوە!")) {
      return;
    }
    try {
      const r = await fetch(`${API}/admin/reset-db`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: backupSecret })
      });
      const raw = await r.text();
      if (!r.ok) {
        let msg = "کێشەیەک ڕوویدا";
        try {
          const j = JSON.parse(raw);
          msg = j.error || msg;
        } catch {}
        setBackupErr(msg);
        return;
      }
      alert("✅ داتابەیس بە سەرکەوتوویی سفر کرایەوە!");
      setBackupSecret("");
      window.location.reload();
    } catch (err) {
      setBackupErr("پەیوەندی لەگەڵ سێرڤەر سەرنەکەوت.");
    }
  }

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

  /* بارکردنی داتای بەشی تایە کاتێک تابەکان دەگۆڕێن */
  useEffect(() => {
    if (tab === "tire_inventory") {
      loadTires();
    } else if (tab === "tire_sales") {
      loadTires();
      loadTireCustomers();
      loadTireSales();
    } else if (tab === "tire_debtors") {
      loadTireCustomers();
      loadTirePayments();
    } else if (tab === "tire_reports") {
      loadTireReport();
    }
  }, [tab, loadTires, loadTireCustomers, loadTireSales, loadTirePayments, loadTireReport]);

  /* نوێکردنەوەی کورتەی قەرزداری تایەی هەڵبژێردراو */
  useEffect(() => {
    if (tab !== "tire_debtors" || !focusedTireCustomerId) {
      setFocusedTireCustomerDetail(null);
      return;
    }
    let cancel = false;
    (async () => {
      const r = await fetch(`${API}/tire-customers`);
      if (r.ok && !cancel) {
        const list = await r.json();
        const found = list.find((c) => String(c.id) === String(focusedTireCustomerId));
        if (found) setFocusedTireCustomerDetail(found);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [tab, focusedTireCustomerId, tirePayments, tireSales]);

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
    const pMask = getProfitFieldMask(txnForm.currency_kind);
    const body = {
      debtor_id: Number(selectedId),
      txn_date: txnForm.txn_date,
      currency_kind: txnForm.currency_kind,
      txn_type: txnForm.txn_type,
      debt_usd: m.debt_usd ? num(txnForm.debt_usd) : 0,
      payment_usd: m.payment_usd ? num(txnForm.payment_usd) : 0,
      debt_iqd: m.debt_iqd ? num(txnForm.debt_iqd) : 0,
      payment_iqd: m.payment_iqd ? num(txnForm.payment_iqd) : 0,
      note: txnForm.note.trim(),
      profit_usd: pMask.profit_usd ? num(txnForm.profit_usd) : 0,
      profit_iqd: pMask.profit_iqd ? num(txnForm.profit_iqd) : 0,
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
      note: "",
      profit_usd: "",
      profit_iqd: "",
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

  /* ───────── Tire Inventory Actions ───────── */

  async function submitTire(e) {
    e.preventDefault();
    setErr("");
    setInfoMsg("");
    const body = {
      name: tireForm.name.trim(),
      size: tireForm.size.trim(),
      quantity: num(tireForm.quantity),
      purchase_price_usd: num(tireForm.purchase_price_usd),
      sale_price_usd: num(tireForm.sale_price_usd),
    };
    try {
      let r;
      if (editingTireId) {
        r = await fetch(`${API}/tires/${editingTireId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        r = await fetch(`${API}/tires`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const raw = await r.text();
      if (!r.ok) {
        setErr(humanApiFailure(r.status, raw));
        return;
      }
      setTireForm({ name: "", size: "", quantity: "", purchase_price_usd: "", sale_price_usd: "" });
      setEditingTireId(null);
      await loadTires();
      setInfoMsg(editingTireId ? "تایە نوێکرایەوە." : "تایە زیادکرا بۆ مخزن.");
      window.setTimeout(() => setInfoMsg(""), 3000);
    } catch (ex) {
      setErr(String(ex?.message || ex));
    }
  }

  async function deleteTire(id) {
    if (!confirm("ئایا دڵنیای لە سڕینەوەی ئەم تایەیە لە مخزن؟")) return;
    await fetch(`${API}/tires/${id}`, { method: "DELETE" });
    await loadTires();
    setInfoMsg("تایە سڕایەوە.");
    window.setTimeout(() => setInfoMsg(""), 3000);
  }

  function startEditTire(t) {
    setEditingTireId(t.id);
    setTireForm({
      name: t.name,
      size: t.size,
      quantity: String(t.quantity),
      purchase_price_usd: String(t.purchase_price_usd),
      sale_price_usd: String(t.sale_price_usd),
    });
  }

  function cancelEditTire() {
    setEditingTireId(null);
    setTireForm({ name: "", size: "", quantity: "", purchase_price_usd: "", sale_price_usd: "" });
  }

  /* ───────── Tire Customer Actions ───────── */

  async function submitTireCustomer(e) {
    e.preventDefault();
    setErr("");
    setInfoMsg("");
    try {
      const body = {
        name: tireCustomerForm.name.trim(),
        phone: tireCustomerForm.phone.trim(),
        note: tireCustomerForm.note ? tireCustomerForm.note.trim() : "",
        initial_balance_usd: num(tireCustomerForm.initial_balance_usd),
      };
      const r = await fetch(`${API}/tire-customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await r.text();
      if (!r.ok) {
        setErr(humanApiFailure(r.status, raw));
        return;
      }
      setTireCustomerForm({ name: "", phone: "", note: "", initial_balance_usd: "" });
      setShowAddCustomerForm(false);
      await loadTireCustomers();
      setInfoMsg("قەرزداری تایە بە سەرکەوتوویی زیادکرا.");
      window.setTimeout(() => setInfoMsg(""), 3000);
    } catch (ex) {
      setErr(String(ex?.message || ex));
    }
  }

  /* ───────── Tire Sales Actions ───────── */

  function addToCart(e) {
    e.preventDefault();
    setErr("");
    const tireId = Number(cartForm.tire_id);
    const qty = Number(cartForm.quantity) || 0;
    const prcUsd = Number(cartForm.price_usd) || 0;

    if (!tireId) {
      setErr("تایەیەک هەڵبژێرە");
      return;
    }
    if (qty <= 0) {
      setErr("بڕی فرۆشراو دەبێت لە سفر گەورەتر بێت");
      return;
    }

    const selectedTire = tires.find((t) => t.id === tireId);
    if (!selectedTire) return;

    if (selectedTire.quantity < qty) {
      setErr(`بڕی پێویست لە مخزن نییە. بڕی ماوە: ${selectedTire.quantity}`);
      return;
    }

    // Check if item already exists in cart, if so update it
    const idx = cart.findIndex((item) => item.tire_id === tireId);
    if (idx !== -1) {
      const newCart = [...cart];
      newCart[idx].quantity += qty;
      setCart(newCart);
    } else {
      setCart([...cart, {
        tire_id: tireId,
        tire_name: selectedTire.name,
        quantity: qty,
        price_usd: prcUsd
      }]);
    }

    setCartForm({ tire_id: "", quantity: "1", price_usd: "" });
  }

  function removeFromCart(index) {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  }

  async function submitTireSale(e) {
    e.preventDefault();
    setErr("");
    setInfoMsg("");

    if (cart.length === 0) {
      setErr("سەبەتەی کڕین خاڵیە. سەرەتا تایە زیاد بکە.");
      return;
    }

    const isCredit = saleForm.payment_type === "قەرز";
    if (isCredit && !saleForm.customer_id) {
      setErr("بۆ فرۆشتنی قەرز، دەبێت ناوێک لە لیستی قەرزداران هەڵبژێریت یان زیادی بکەیت.");
      return;
    }

    // Calculate totals
    let totUsd = 0;
    cart.forEach((item) => {
      totUsd += (item.price_usd || 0) * item.quantity;
    });

    const body = {
      customer_id: isCredit ? Number(saleForm.customer_id) : null,
      sale_date: saleForm.sale_date,
      payment_type: saleForm.payment_type,
      total_usd: totUsd,
      total_iqd: 0,
      paid_usd: isCredit ? (Number(saleForm.paid_usd) || 0) : totUsd,
      paid_iqd: 0,
      note: saleForm.note.trim(),
      items: cart.map(i => ({
        tire_id: i.tire_id,
        quantity: i.quantity,
        price_usd: i.price_usd,
        price_iqd: 0
      }))
    };

    try {
      const r = await fetch(`${API}/tire-sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const raw = await r.text();
      if (!r.ok) {
        setErr(humanApiFailure(r.status, raw));
        return;
      }
      setCart([]);
      setSaleForm({
        sale_date: today,
        customer_id: "",
        payment_type: "نەقد",
        paid_usd: "",
        note: ""
      });
      await loadTires();
      await loadTireSales();
      await loadTireCustomers();
      setInfoMsg("فرۆشتنی تایە بە سەرکەوتوویی تۆمار کرا.");
      window.setTimeout(() => setInfoMsg(""), 3000);
    } catch (ex) {
      setErr(String(ex?.message || ex));
    }
  }

  async function deleteTireSale(id) {
    if (!confirm("سڕینەوەی ئەم فەسڵە؟ (بڕی تایەکان دەگەڕێتەوە بۆ مخزن)")) return;
    await fetch(`${API}/tire-sales/${id}`, { method: "DELETE" });
    await loadTires();
    await loadTireSales();
    await loadTireCustomers();
    setInfoMsg("فەسڵەکە سڕایەوە و مخزن نوێکرایەوە.");
    window.setTimeout(() => setInfoMsg(""), 3000);
  }

  /* ───────── Tire Payment Actions ───────── */

  async function submitTirePayment(e) {
    e.preventDefault();
    setErr("");
    setInfoMsg("");

    const body = {
      customer_id: Number(tirePaymentForm.customer_id),
      payment_date: tirePaymentForm.payment_date,
      amount_usd: num(tirePaymentForm.amount_usd),
      amount_iqd: 0,
      note: tirePaymentForm.note.trim()
    };

    if (!body.customer_id) {
      setErr("قەرزدار هەڵبژێرە");
      return;
    }

    try {
      const r = await fetch(`${API}/tire-payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const raw = await r.text();
      if (!r.ok) {
        setErr(humanApiFailure(r.status, raw));
        return;
      }
      setTirePaymentForm({
        customer_id: "",
        payment_date: today,
        amount_usd: "",
        note: ""
      });
      await loadTirePayments();
      await loadTireCustomers();
      setInfoMsg("واسڵکردنی قەرز بە سەرکەوتوویی تۆمار کرا.");
      window.setTimeout(() => setInfoMsg(""), 3000);
    } catch (ex) {
      setErr(String(ex?.message || ex));
    }
  }

  async function deleteTirePayment(id) {
    if (!confirm("سڕینەوەی ئەم واسڵکردنە؟")) return;
    await fetch(`${API}/tire-payments/${id}`, { method: "DELETE" });
    await loadTirePayments();
    await loadTireCustomers();
    setInfoMsg("تۆماری پارەکە سڕایەوە.");
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

  const profitMask = useMemo(
    () => getProfitFieldMask(txnForm.currency_kind),
    [txnForm.currency_kind]
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

  const filteredTires = useMemo(() => {
    const q = tireSearch.trim().toLowerCase();
    if (!q) return tires;
    return tires.filter(
      (t) =>
        String(t.name || "").toLowerCase().includes(q) ||
        String(t.size || "").toLowerCase().includes(q)
    );
  }, [tires, tireSearch]);

  const filteredTireCustomers = useMemo(() => {
    const q = tireCustomerSearch.trim().toLowerCase();
    if (!q) return tireCustomers;
    return tireCustomers.filter(
      (c) =>
        String(c.name || "").toLowerCase().includes(q) ||
        String(c.phone || "").toLowerCase().includes(q) ||
        String(c.note || "").toLowerCase().includes(q)
    );
  }, [tireCustomers, tireCustomerSearch]);

  const filteredTireSales = useMemo(() => {
    return tireSales.filter((s) => {
      // 1. Payment type filter
      if (tireSaleFilterType !== "all" && s.payment_type !== tireSaleFilterType) {
        return false;
      }
      // 2. Text search filter
      const q = tireSaleSearch.trim().toLowerCase();
      if (!q) return true;
      
      const matchCustomer = String(s.customer_name || "نەقد (کاش)").toLowerCase().includes(q);
      const matchNote = String(s.note || "").toLowerCase().includes(q);
      const matchTires = (s.items || []).some(item => 
        String(item.tire_name || "").toLowerCase().includes(q)
      );
      
      return matchCustomer || matchNote || matchTires;
    });
  }, [tireSales, tireSaleSearch, tireSaleFilterType]);

  const tireCustomersTotals = useMemo(() => {
    let usd = 0;
    tireCustomers.forEach((c) => {
      usd += c.balance_usd || 0;
    });
    return { usd };
  }, [tireCustomers]);

  const cartTotals = useMemo(() => {
    let usd = 0;
    cart.forEach((i) => {
      usd += (i.price_usd || 0) * i.quantity;
    });
    return { usd };
  }, [cart]);

  function patchTxnForm(updates) {
    setTxnForm((prev) => {
      const next = { ...prev, ...updates };
      const mask = getFieldMask(next.txn_type, next.currency_kind);
      const pMask = getProfitFieldMask(next.currency_kind);
      if (!mask.debt_usd) next.debt_usd = "";
      if (!mask.payment_usd) next.payment_usd = "";
      if (!mask.debt_iqd) next.debt_iqd = "";
      if (!mask.payment_iqd) next.payment_iqd = "";
      if (!pMask.profit_usd) next.profit_usd = "";
      if (!pMask.profit_iqd) next.profit_iqd = "";
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
          
          <span className="nav-separator"></span>
          
          <button type="button" className={tab === "tire_inventory" ? "on" : ""} onClick={() => switchTab("tire_inventory")}>
            <IconInventory /> مخزنی تایە
          </button>
          <button type="button" className={tab === "tire_sales" ? "on" : ""} onClick={() => switchTab("tire_sales")}>
            <IconTireSales /> فرۆشتنی تایە
          </button>
          <button type="button" className={tab === "tire_debtors" ? "on" : ""} onClick={() => switchTab("tire_debtors")}>
            <IconTireDebtors /> قەرزدارانی تایە
          </button>
          <button type="button" className={tab === "tire_reports" ? "on" : ""} onClick={() => switchTab("tire_reports")}>
            <IconTireReports /> ڕاپۆرتی تایە
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
            <div className="table-wrap">
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
              <div className="amount-row" style={{ marginTop: "0.5rem" }}>
                <label className={`cell-sm pay${profitMask.profit_usd ? "" : " off"}`} style={{ gridColumn: "span 2" }}>
                  قازانج ($)
                  <input
                    inputMode="decimal"
                    value={txnForm.profit_usd}
                    disabled={!profitMask.profit_usd}
                    onChange={(e) => setTxnForm({ ...txnForm, profit_usd: e.target.value })}
                    placeholder="0"
                  />
                </label>
                <label className={`cell-sm pay${profitMask.profit_iqd ? "" : " off"}`} style={{ gridColumn: "span 2" }}>
                  قازانج (د.ع)
                  <input
                    inputMode="numeric"
                    value={txnForm.profit_iqd}
                    disabled={!profitMask.profit_iqd}
                    onChange={(e) => setTxnForm({ ...txnForm, profit_iqd: e.target.value })}
                    placeholder="0"
                  />
                </label>
              </div>
              <div className="txn-note-row" style={{ marginTop: "0.5rem" }}>
                <label className="txn-note-label">
                  تێبینی (ئیختیاری — بۆ نموونە: کێ پارەی دایە)
                  <input
                    value={txnForm.note}
                    onChange={(e) => setTxnForm({ ...txnForm, note: e.target.value })}
                    placeholder="بۆ نموونە: ئەحمەد پارەکەی لە جیاتی دایە"
                  />
                </label>
              </div>
            </form>
          </section>

          <section className="card" aria-labelledby="daily-list-heading">
            <h2 id="daily-list-heading">دوایین مامەڵەکان</h2>
            <div className="table-wrap scroll">
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
                    <th>قازانج</th>
                    <th>تێبینی</th>
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
                      <td className="num" style={{ color: "var(--ok)", fontWeight: "600" }}>
                        {t.profit_usd ? fmtMoney(t.profit_usd, "usd") : ""}
                        {t.profit_usd && t.profit_iqd ? " / " : ""}
                        {t.profit_iqd ? fmtMoney(t.profit_iqd, "iqd") : ""}
                        {!t.profit_usd && !t.profit_iqd ? "—" : ""}
                      </td>
                      <td className="muted txn-note-cell">{t.note || ""}</td>
                      <td>
                        <button type="button" className="danger link" onClick={() => deleteTxn(t.id)}>
                          سڕینەوە
                        </button>
                      </td>
                    </tr>
                  ))}
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
                    {(t.profit_usd || t.profit_iqd) ? (
                      <div className="txn-card-amounts" style={{ marginTop: "0.25rem", borderTop: "1px dashed var(--border)", paddingTop: "0.25rem" }}>
                        <div className="amount-val num pay" style={{ fontWeight: "600" }}>
                          قازانج: {t.profit_usd ? fmtMoney(t.profit_usd, "usd") : ""} {t.profit_usd && t.profit_iqd ? " + " : ""} {t.profit_iqd ? fmtMoney(t.profit_iqd, "iqd") : ""}
                        </div>
                      </div>
                    ) : null}
                    {t.note ? (
                      <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
                        تێبینی: {t.note}
                      </div>
                    ) : null}
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
            <div className="table-wrap scroll">
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
                <div className="rpt-card rpt-pay" style={{ borderRight: "3px solid var(--ok)" }}>
                  <span className="rpt-label" style={{ color: "var(--ok)" }}>کۆی قازانج</span>
                  <strong style={{ color: "var(--ok)" }}>{fmtMoney(report.total_profit_usd, "usd")}</strong>
                  <span className="rpt-sub">{fmtMoney(report.total_profit_iqd, "iqd")}</span>
                </div>
                <div className="rpt-card rpt-remain" style={{ borderRight: "3px solid #06b6d4" }}>
                  <span className="rpt-label" style={{ color: "#06b6d4" }}>قازانجی سافی</span>
                  <strong style={{ color: (report.total_profit_usd - report.total_expense_usd) >= 0 ? "var(--ok)" : "var(--owe)" }}>
                    {fmtMoney(report.total_profit_usd - report.total_expense_usd, "usd")}
                  </strong>
                  <span className="rpt-sub" style={{ color: (report.total_profit_iqd - report.total_expense_iqd) >= 0 ? "var(--ok)" : "var(--owe)" }}>
                    {fmtMoney(report.total_profit_iqd - report.total_expense_iqd, "iqd")}
                  </span>
                </div>
              </div>

              {/* سەرەکیترین قەرزداران */}
              <section className="card" aria-labelledby="rpt-top-heading">
                <h2 id="rpt-top-heading">سەرەکیترین قەرزداران</h2>
                {report.top_debtors.length > 0 ? (
                  <div className="table-wrap">
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

          {/* بەشی باکئەپی داتابەیس */}
          <section className="card card-compact" style={{ marginTop: "1.5rem" }}>
            <h3>باکئەپ و پاراستنی داتاکان (SQLite Backup)</h3>
            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
              لێرەوە دەتوانیت کۆپییەکی تەواوی داتابەیسی سیستەمەکە (`gazxana.sqlite`) دابەزێنیتە سەر کۆمپیوتەرەکەت بۆ پاراستنی حیساباتەکانت.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", maxWidth: "550px" }}>
              <input
                type="password"
                placeholder="تێپەڕەوشە بنووسە…"
                value={backupSecret}
                onChange={(e) => setBackupSecret(e.target.value)}
                style={{ flex: "1 1 200px", minHeight: "2.2rem" }}
              />
              <button
                type="button"
                className="primary"
                onClick={handleDownloadBackup}
                style={{ minHeight: "2.2rem", padding: "0 1.2rem" }}
              >
                داگرتنی باکئەپ
              </button>
              <button
                type="button"
                className="danger"
                onClick={handleResetDatabase}
                style={{ minHeight: "2.2rem", padding: "0 1.2rem" }}
              >
                ⚠️ سفرکردنەوەی داتابەیس
              </button>
            </div>
            {backupErr ? <p style={{ color: "var(--owe)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{backupErr}</p> : null}
          </section>
        </div>
      ) : null}

      {/* ═══════ TAB: مخزنی تایە (Tire Inventory) ═══════ */}
      {tab === "tire_inventory" ? (
        <div className="tab-panels">
          <section className="card" aria-labelledby="tire-add-heading">
            <h2 id="tire-add-heading">{editingTireId ? "دەستکاریکردنی زانیاری تایە" : "زیادکردنی تایە بۆ مخزن"}</h2>
            <form className="grid-form" onSubmit={submitTire}>
              <label>
                ناونیشان / جۆری تایە
                <input
                  value={tireForm.name}
                  onChange={(e) => setTireForm({ ...tireForm, name: e.target.value })}
                  placeholder="بۆ نموونە: Michelin 205/55R16"
                  required
                />
              </label>
              <label>
                قەبارە (Size)
                <input
                  value={tireForm.size}
                  onChange={(e) => setTireForm({ ...tireForm, size: e.target.value })}
                  placeholder="بۆ نموونە: R16"
                />
              </label>
              <label>
                بڕی سەرەتایی (مخزن)
                <input
                  type="number"
                  value={tireForm.quantity}
                  onChange={(e) => setTireForm({ ...tireForm, quantity: e.target.value })}
                  placeholder="0"
                  required
                />
              </label>
              <label>
                نرخی کڕین بە دۆلار ($)
                <input
                  inputMode="decimal"
                  value={tireForm.purchase_price_usd}
                  onChange={(e) => setTireForm({ ...tireForm, purchase_price_usd: e.target.value })}
                  placeholder="0.00"
                />
              </label>
              <label>
                نرخی فرۆشتن بە دۆلار ($)
                <input
                  inputMode="decimal"
                  value={tireForm.sale_price_usd}
                  onChange={(e) => setTireForm({ ...tireForm, sale_price_usd: e.target.value })}
                  placeholder="0.00"
                />
              </label>
              <div className="span2" style={{ display: "flex", gap: "0.5rem" }}>
                <button type="submit" className="primary">
                  {editingTireId ? "پاشەکەوتکردنی گۆڕانکارییەکان" : "زیادکردن بۆ مخزن"}
                </button>
                {editingTireId ? (
                  <button type="button" className="ghost" onClick={cancelEditTire}>
                    پاشگەزبوونەوە
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          {/* کورتەی مخزن */}
          <section className="card">
            <div className="expense-summary-bar" style={{ background: "var(--pay-bg)", borderColor: "var(--pay-border)" }}>
              <div className="expense-total">
                <span className="lbl" style={{ color: "var(--text)" }}>کۆی جۆری تایەکان</span>
                <strong className="expense-amount" style={{ color: "var(--ok)" }}>{tires.length} دانە</strong>
              </div>
              <div className="expense-total">
                <span className="lbl" style={{ color: "var(--text)" }}>کۆی گشتی ژمارەی تایەکان</span>
                <strong className="expense-amount" style={{ color: "var(--ok)" }}>
                  {tires.reduce((acc, curr) => acc + (curr.quantity || 0), 0)} دانە
                </strong>
              </div>
            </div>
          </section>

          {/* لیستی تایەکان */}
          <section className="card" aria-labelledby="tire-list-heading">
            <div className="section-head">
              <h2 id="tire-list-heading">مخزنی تایەکان</h2>
              <div className="filter-row">
                <label className="filter-label">
                  گەڕان لە مخزندا
                  <input
                    value={tireSearch}
                    onChange={(e) => setTireSearch(e.target.value)}
                    placeholder="بنووسە بۆ گەڕان…"
                    style={{ width: "220px" }}
                  />
                </label>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>جۆری تایە</th>
                    <th>قەبارە</th>
                    <th>بڕی ماوە (مخزن)</th>
                    <th>نرخی کڕین ($)</th>
                    <th>نرخی فرۆشتن ($)</th>
                    <th>کۆی نرخی مخزن</th>
                    <th>کردارەکان</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTires.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: "600" }}>{t.name}</td>
                      <td>{t.size || "—"}</td>
                      <td className={`num ${t.quantity <= 5 ? "debt" : ""}`} style={{ fontWeight: "700" }}>
                        {t.quantity} دانە {t.quantity <= 5 ? "(کەمە!)" : ""}
                      </td>
                      <td className="num">{fmtMoney(t.purchase_price_usd, "usd")}</td>
                      <td className="num" style={{ color: "var(--ok)" }}>{fmtMoney(t.sale_price_usd, "usd")}</td>
                      <td className="num muted">{fmtMoney(t.quantity * t.purchase_price_usd, "usd")}</td>
                      <td>
                        <div style={{ display: "flex", gap: "0.25rem" }}>
                          <button type="button" className="ghost" style={{ minHeight: "1.8rem", padding: "0.2rem 0.5rem" }} onClick={() => startEditTire(t)}>
                            دەستکاری
                          </button>
                          <button type="button" className="danger link" onClick={() => deleteTire(t.id)}>
                            سڕینەوە
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredTires.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                        هیچ تایەیەک لە مخزن نییە.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {/* ═══════ TAB: فرۆشتنی تایە (Tire Sales) ═══════ */}
      {tab === "tire_sales" ? (
        <div className="tab-panels">
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "1rem", alignItems: "start" }}>
            {/* لای چەپ: سەبەتە و تۆمارکردن */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <section className="card card-compact" aria-labelledby="tire-cart-heading">
                <h2 id="tire-cart-heading">فرۆشتنی تایە — سەبەتەی کڕین</h2>
                <form className="grid-form" onSubmit={addToCart}>
                  <label className="span2">
                    تایە هەڵبژێرە (مخزن)
                    <select
                      value={cartForm.tire_id}
                      onChange={(e) => {
                        const val = e.target.value;
                        const match = tires.find((t) => String(t.id) === val);
                        setCartForm({
                          ...cartForm,
                          tire_id: val,
                          price_usd: match ? String(match.sale_price_usd) : "",
                        });
                      }}
                      required
                    >
                      <option value="">— هەڵبژێرە —</option>
                      {tires.map((t) => (
                        <option key={t.id} value={t.id} disabled={t.quantity <= 0}>
                          {t.name} (ماوە: {t.quantity}) — {fmtMoney(t.sale_price_usd, "usd")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    بڕ (Quantity)
                    <input
                      type="number"
                      value={cartForm.quantity}
                      onChange={(e) => setCartForm({ ...cartForm, quantity: e.target.value })}
                      min="1"
                      required
                    />
                  </label>
                  <label>
                    نرخی فرۆشتن بە دۆلار ($)
                    <input
                      inputMode="decimal"
                      value={cartForm.price_usd}
                      onChange={(e) => setCartForm({ ...cartForm, price_usd: e.target.value })}
                      placeholder="0.00"
                      required
                    />
                  </label>
                  <button type="submit" className="primary span2" style={{ justifySelf: "stretch" }}>
                    زیادکردن بۆ سەبەتە
                  </button>
                </form>
              </section>

              {/* پێرستی سەبەتە */}
              <section className="card">
                <h3>سەبەتەی کڕین ({cart.length} بابەت)</h3>
                <div className="table-wrap">
                  <table className="data compact">
                    <thead>
                      <tr>
                        <th>بابەت</th>
                        <th>بڕ</th>
                        <th>نرخ ($)</th>
                        <th>کۆ ($)</th>
                        <th>کردار</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item, index) => (
                        <tr key={index}>
                          <td>{item.tire_name}</td>
                          <td>{item.quantity} دانە</td>
                          <td className="num">{fmtMoney(item.price_usd, "usd")}</td>
                          <td className="num" style={{ fontWeight: "600" }}>{fmtMoney(item.price_usd * item.quantity, "usd")}</td>
                          <td>
                            <button type="button" className="danger link" onClick={() => removeFromCart(index)}>
                              سڕینەوە
                            </button>
                          </td>
                        </tr>
                      ))}
                      {cart.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="muted" style={{ textAlign: "center", padding: "1.5rem" }}>
                            هیچ بابەتێک لە سەبەتەدا نییە.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                {cart.length > 0 ? (
                  <div className="balance-inline" style={{ marginTop: "1rem", width: "100%" }}>
                    <div>
                      <span className="lbl">کۆی گشتی بە دۆلار ($)</span>
                      <strong>{fmtMoney(cartTotals.usd, "usd")}</strong>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>

            {/* لای ڕاست: کڕیار و فەسڵکردن */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <section className="card" aria-labelledby="tire-checkout-heading">
                <h2 id="tire-checkout-heading">تەواوکردنی فرۆشتن</h2>
                <form className="grid-form" onSubmit={submitTireSale}>
                  <label className="span2">
                    ڕێکەوتی فرۆشتن
                    <input
                      type="date"
                      value={saleForm.sale_date}
                      onChange={(e) => setSaleForm({ ...saleForm, sale_date: e.target.value })}
                      required
                    />
                  </label>
                  <label className="span2">
                    جۆری پارەدان
                    <select
                      value={saleForm.payment_type}
                      onChange={(e) => setSaleForm({ ...saleForm, payment_type: e.target.value })}
                      required
                    >
                      <option value="نەقد">نەقد (کاش)</option>
                      <option value="قەرز">قەرز</option>
                    </select>
                  </label>

                  {saleForm.payment_type === "قەرز" ? (
                    <>
                      <label className="span2">
                        قەرزدار هەڵبژێرە
                        <select
                          value={saleForm.customer_id}
                          onChange={(e) => setSaleForm({ ...saleForm, customer_id: e.target.value })}
                          required
                        >
                          <option value="">— هەڵبژێرە —</option>
                          {tireCustomers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} (قەرز: {fmtMoney(c.balance_usd, "usd")})
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="span2" style={{ marginTop: "-0.5rem" }}>
                        <button type="button" className="ghost" style={{ width: "100%", fontSize: "0.8rem", minHeight: "2rem" }} onClick={() => setShowAddCustomerForm(!showAddCustomerForm)}>
                          {showAddCustomerForm ? "داخستنی فۆرمی زیادکردنی قەرزدار" : "➕ زیادکردنی قەرزداری نوێ بۆ ئەم بەشە"}
                        </button>
                      </div>

                      {showAddCustomerForm ? (
                        <div className="card-nested span2" style={{ margin: "0.5rem 0", background: "#f8fafc" }}>
                          <h4>زیادکردنی قەرزداری تایە</h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            <input
                              value={tireCustomerForm.name}
                              onChange={(e) => setTireCustomerForm({ ...tireCustomerForm, name: e.target.value })}
                              placeholder="ناوی قەرزدار"
                              required
                            />
                            <input
                              value={tireCustomerForm.phone}
                              onChange={(e) => setTireCustomerForm({ ...tireCustomerForm, phone: e.target.value })}
                              placeholder="مۆبایل"
                            />
                            <input
                              inputMode="decimal"
                              value={tireCustomerForm.initial_balance_usd}
                              onChange={(e) => setTireCustomerForm({ ...tireCustomerForm, initial_balance_usd: e.target.value })}
                              placeholder="قەرزی سەرەتایی بە دۆلار ($) - ئیختیاری"
                            />
                            <button type="button" className="primary" style={{ width: "100%", minHeight: "2rem" }} onClick={submitTireCustomer}>
                              پاشەکەوتکردن
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <label className="span2">
                        پارەی دراو بە دۆلار ($)
                        <input
                          inputMode="decimal"
                          value={saleForm.paid_usd}
                          onChange={(e) => setSaleForm({ ...saleForm, paid_usd: e.target.value })}
                          placeholder="0.00"
                        />
                      </label>
                    </>
                  ) : null}

                  <label className="span2">
                    تێبینی فەسڵ
                    <input
                      value={saleForm.note}
                      onChange={(e) => setSaleForm({ ...saleForm, note: e.target.value })}
                      placeholder="ئیختیاری"
                    />
                  </label>

                  <button type="submit" className="primary span2" style={{ justifySelf: "stretch" }} disabled={cart.length === 0}>
                    فرۆشتن و واژۆکردنی فەسڵ
                  </button>
                </form>
              </section>
            </div>
          </div>

          {/* دوایین فرۆشتنەکان */}
          <section className="card" aria-labelledby="tire-sales-history">
            <div className="section-head">
              <h2 id="tire-sales-history">تۆماری فرۆشتنی تایەکان</h2>
              <div className="filter-row" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <input
                  value={tireSaleSearch}
                  onChange={(e) => setTireSaleSearch(e.target.value)}
                  placeholder="گەڕان بەپێی کڕیار، تایە، تێبینی…"
                  style={{ width: "240px", minHeight: "2.2rem" }}
                />
                <select
                  value={tireSaleFilterType}
                  onChange={(e) => setTireSaleFilterType(e.target.value)}
                  style={{ width: "150px", minHeight: "2.2rem" }}
                >
                  <option value="all">هەموو جۆرەکان</option>
                  <option value="نەقد">نەقد (کاش)</option>
                  <option value="قەرز">قەرز</option>
                </select>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>ڕێکەوت</th>
                    <th>کڕیار / جۆر</th>
                    <th>تایە فرۆشراوەکان</th>
                    <th>کۆی فەسڵ</th>
                    <th>دراو / ماوە</th>
                    <th>تێبینی</th>
                    <th>کردار</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTireSales.map((s) => (
                    <tr key={s.id}>
                      <td>{s.sale_date}</td>
                      <td>
                        <strong>{s.customer_name || "نەقد (کاش)"}</strong>
                        <div className="muted small">{s.payment_type}</div>
                      </td>
                      <td style={{ fontSize: "0.82rem" }}>
                        {(s.items || []).map((item, idx) => (
                          <div key={idx}>
                            • {item.tire_name} ({item.quantity} دانە × {fmtMoney(item.price_usd, "usd")})
                          </div>
                        ))}
                      </td>
                      <td className="num">
                        <div>{fmtMoney(s.total_usd, "usd")}</div>
                      </td>
                      <td className="num">
                        {s.payment_type === "قەرز" ? (
                          <>
                            <div style={{ color: "var(--ok)" }}>دراو: {fmtMoney(s.paid_usd, "usd")}</div>
                            <div style={{ color: "var(--owe)", fontWeight: "600" }}>
                              ماوە: {fmtMoney(s.total_usd - s.paid_usd, "usd")}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: "var(--ok)" }}>تەواو دراوە</span>
                        )}
                      </td>
                      <td className="muted">{s.note}</td>
                      <td>
                        <button type="button" className="danger link" onClick={() => deleteTireSale(s.id)}>
                          سڕینەوە
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredTireSales.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                        هیچ فرۆشتنێک نەدۆزرایەوە.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {/* ═══════ TAB: قەرزدارانی تایە (Tire Debtors) ═══════ */}
      {tab === "tire_debtors" ? (
        <div className="tab-panels">
          {/* کورتەی کۆی قەرزی تایەکان */}
          <section className="card">
            <div className="expense-summary-bar" style={{ background: "var(--debt-bg)", borderColor: "var(--debt-border)", gridTemplateColumns: "1fr" }}>
              <div className="expense-total">
                <span className="lbl" style={{ color: "var(--text)" }}>کۆ قەرزی تایە بە دۆلار ($)</span>
                <strong className="expense-amount" style={{ color: "var(--owe)" }}>{fmtMoney(tireCustomersTotals.usd, "usd")}</strong>
              </div>
            </div>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: focusedTireCustomerId ? "1.2fr 0.8fr" : "1fr", gap: "1rem", alignItems: "start" }}>
            {/* لیستی قەرزدارانی تایە */}
            <section className="card" aria-labelledby="tire-debtors-list">
              <div className="section-head">
                <h2 id="tire-debtors-list">لیستی قەرزدارانی تایە</h2>
                <div className="filter-row">
                  <input
                    value={tireCustomerSearch}
                    onChange={(e) => setTireCustomerSearch(e.target.value)}
                    placeholder="گەڕان بەپێی ناو یان مۆبایل…"
                    style={{ width: "220px" }}
                  />
                  <button type="button" className="ghost" onClick={() => {
                    setShowAddCustomerForm(!showAddCustomerForm);
                    setTireCustomerForm({ name: "", phone: "", note: "", initial_balance_usd: "" });
                  }}>
                    {showAddCustomerForm ? "داخستنی فۆرم" : "➕ زیادکردنی قەرزدار"}
                  </button>
                </div>
              </div>
              
              {showAddCustomerForm ? (
                <div className="card-nested" style={{ background: "#f8fafc", margin: "1rem", padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                  <h4 style={{ marginTop: 0, marginBottom: "1rem", color: "var(--primary)" }}>➕ زیادکردنی قەرزداری نوێ بۆ بەشی تایە</h4>
                  <form onSubmit={submitTireCustomer} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", alignItems: "end" }}>
                    <label style={{ display: "flex", flexDirection: "column", fontSize: "0.85rem", gap: "0.25rem", color: "var(--text)" }}>
                      ناوی قەرزدار
                      <input
                        value={tireCustomerForm.name}
                        onChange={(e) => setTireCustomerForm({ ...tireCustomerForm, name: e.target.value })}
                        placeholder="بۆ نموونە: ئەحمەد عەلی"
                        required
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", fontSize: "0.85rem", gap: "0.25rem", color: "var(--text)" }}>
                      مۆبایل
                      <input
                        value={tireCustomerForm.phone}
                        onChange={(e) => setTireCustomerForm({ ...tireCustomerForm, phone: e.target.value })}
                        placeholder="ئیختیاری"
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", fontSize: "0.85rem", gap: "0.25rem", color: "var(--text)" }}>
                      قەرزی سەرەتایی بە دۆلار ($)
                      <input
                        inputMode="decimal"
                        value={tireCustomerForm.initial_balance_usd}
                        onChange={(e) => setTireCustomerForm({ ...tireCustomerForm, initial_balance_usd: e.target.value })}
                        placeholder="0.00"
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", fontSize: "0.85rem", gap: "0.25rem", color: "var(--text)" }}>
                      تێبینی
                      <input
                        value={tireCustomerForm.note}
                        onChange={(e) => setTireCustomerForm({ ...tireCustomerForm, note: e.target.value })}
                        placeholder="ئیختیاری"
                      />
                    </label>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button type="submit" className="primary" style={{ minHeight: "2.2rem", flex: 1 }}>
                        پاشەکەوتکردن
                      </button>
                      <button type="button" className="ghost" style={{ minHeight: "2.2rem" }} onClick={() => {
                        setShowAddCustomerForm(false);
                        setTireCustomerForm({ name: "", phone: "", note: "", initial_balance_usd: "" });
                      }}>
                        پاشگەزبوونەوە
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>ناو</th>
                      <th>مۆبایل</th>
                      <th>ماوەی قەرز ($)</th>
                      <th>تێبینی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTireCustomers.map((c) => (
                      <tr key={c.id} className={String(focusedTireCustomerId) === String(c.id) ? "row-focus" : ""}>
                        <td>
                          <button type="button" className="name-link" onClick={() => setFocusedTireCustomerId(String(c.id))}>
                            {c.name}
                          </button>
                        </td>
                        <td>{c.phone}</td>
                        <td className="num debt" style={{ fontWeight: "700" }}>{fmtMoney(c.balance_usd, "usd")}</td>
                        <td className="muted">{c.note}</td>
                      </tr>
                    ))}
                    {filteredTireCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                          هیچ قەرزدارێکی تایە نەدۆزرایەوە.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            {/* پانێڵی لای ڕاست: وەرگرتنی پارەی قەرز */}
            {focusedTireCustomerId && focusedTireCustomerDetail ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <section className="card" aria-labelledby="tire-pay-heading">
                  <div className="debtor-detail-head">
                    <h2 id="tire-pay-heading">وەرگرتنەوەی قەرز — {focusedTireCustomerDetail.name}</h2>
                    <button type="button" className="ghost" style={{ minHeight: "1.8rem" }} onClick={() => setFocusedTireCustomerId("")}>
                      داخستن
                    </button>
                  </div>
                  
                  <div className="balance-inline" style={{ width: "100%", margin: "0.5rem 0 1rem", background: "var(--debt-bg)" }}>
                    <div>
                      <span className="lbl">ماوەی قەرز بە دۆلار</span>
                      <strong style={{ color: "var(--owe)" }}>{fmtMoney(focusedTireCustomerDetail.balance_usd, "usd")}</strong>
                    </div>
                  </div>

                  <form className="grid-form" onSubmit={submitTirePayment}>
                    <label className="span2">
                      ڕێکەوتی وەرگرتن
                      <input
                        type="date"
                        value={tirePaymentForm.payment_date}
                        onChange={(e) => setTirePaymentForm({ ...tirePaymentForm, payment_date: e.target.value })}
                        required
                      />
                    </label>
                    <label className="span2">
                      بڕی وەرگیراو بە دۆلار ($)
                      <input
                        inputMode="decimal"
                        value={tirePaymentForm.amount_usd}
                        onChange={(e) => setTirePaymentForm({ ...tirePaymentForm, amount_usd: e.target.value, customer_id: focusedTireCustomerId })}
                        placeholder="0.00"
                      />
                    </label>
                    <label className="span2">
                      تێبینی
                      <input
                        value={tirePaymentForm.note}
                        onChange={(e) => setTirePaymentForm({ ...tirePaymentForm, note: e.target.value })}
                        placeholder="بۆ نموونە: قەبزی ژمارە 10"
                      />
                    </label>
                    <button type="submit" className="primary span2" style={{ justifySelf: "stretch" }}>
                      تۆمارکردنی پارەی وەرگیراو
                    </button>
                  </form>
                </section>

                {/* مێژووی پارە دانەوەکان */}
                <section className="card">
                  <h3>مێژووی وەرگرتنەوەکان</h3>
                  <div className="table-wrap">
                    <table className="data compact">
                      <thead>
                        <tr>
                          <th>ڕێکەوت</th>
                          <th>وەرگیراو</th>
                          <th>تێبینی</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tirePayments
                          .filter((p) => String(p.customer_id) === String(focusedTireCustomerId))
                          .map((p) => (
                            <tr key={p.id}>
                              <td>{p.payment_date}</td>
                              <td className="num" style={{ color: "var(--ok)", fontWeight: "600" }}>
                                {p.amount_usd ? fmtMoney(p.amount_usd, "usd") : "0 $"}
                              </td>
                              <td className="muted">{p.note}</td>
                              <td>
                                <button type="button" className="danger link" onClick={() => deleteTirePayment(p.id)}>
                                  سڕینەوە
                                </button>
                              </td>
                            </tr>
                          ))}
                        {tirePayments.filter((p) => String(p.customer_id) === String(focusedTireCustomerId)).length === 0 ? (
                          <tr>
                            <td colSpan={4} className="muted" style={{ textAlign: "center", padding: "1rem" }}>
                              هیچ پارەیەکی وەرگیراو نییە.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ═══════ TAB: ڕاپۆرتی تایە (Tire Reports) ═══════ */}
      {tab === "tire_reports" ? (
        <div className="tab-panels">
          <section className="card">
            <div className="section-head">
              <h2>ڕاپۆرت و ئامارەکانی بەشی تایە</h2>
              <div className="filter-row">
                <label className="filter-label">
                  لە
                  <input type="date" value={tireReportFrom} onChange={(e) => setTireReportFrom(e.target.value)} />
                </label>
                <label className="filter-label">
                  بۆ
                  <input type="date" value={tireReportTo} onChange={(e) => setTireReportTo(e.target.value)} />
                </label>
                <button type="button" className="ghost" onClick={loadTireReport}>
                  نوێکردنەوە
                </button>
              </div>
            </div>
          </section>

          {tireReportLoading ? (
            <section className="card">
              <div className="banner">بارکردنی ڕاپۆرت…</div>
            </section>
          ) : tireReport ? (
            <>
              {/* کارتە سەرەکییەکان */}
              <div className="report-cards">
                <div className="rpt-card rpt-pay">
                  <span className="rpt-label">کۆی فرۆشی تایەکان</span>
                  <strong>{fmtMoney(tireReport.total_sales_usd, "usd")}</strong>
                </div>
                <div className="rpt-card rpt-remain">
                  <span className="rpt-label">پارەی وەرگیراو</span>
                  <strong>{fmtMoney(tireReport.total_cash_usd, "usd")}</strong>
                </div>
                <div className="rpt-card rpt-debt">
                  <span className="rpt-label">ماوەی قەرز (لای کڕیاران)</span>
                  <strong>{fmtMoney(tireReport.outstanding_debt_usd, "usd")}</strong>
                </div>
                <div className="rpt-card rpt-expense">
                  <span className="rpt-label">کۆی گشتی کڕین</span>
                  <strong>{fmtMoney(tireReport.stock_value_purchase_usd, "usd")}</strong>
                  <span className="rpt-sub">بەهای فرۆشتن: {fmtMoney(tireReport.stock_value_sale_usd, "usd")}</span>
                </div>
                <div className="rpt-card rpt-profit">
                  <span className="rpt-label">کۆی گشتی قازانج</span>
                  <strong>{fmtMoney(tireReport.total_profit_usd, "usd")}</strong>
                </div>
              </div>

              {/* پڕفرۆشترین تایەکان */}
              <section className="card" aria-labelledby="rpt-pop-tires">
                <h2 id="rpt-pop-tires">پڕفرۆشترین تایەکان (بەپێی ژمارەی فرۆشراو)</h2>
                {tireReport.popular_tires.length > 0 ? (
                  <div className="table-wrap">
                    <table className="data compact">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>جۆری تایە</th>
                          <th>ژمارەی فرۆشراو</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tireReport.popular_tires.map((t, idx) => (
                          <tr key={idx}>
                            <td className="muted">{idx + 1}</td>
                            <td><strong>{t.name}</strong></td>
                            <td className="num" style={{ color: "var(--ok)", fontWeight: "600" }}>{t.sold_qty} دانە</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted" style={{ textAlign: "center" }}>هیچ فرۆشتنێک تۆمار نەکراوە لەم بەروارەدا.</p>
                )}
              </section>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
