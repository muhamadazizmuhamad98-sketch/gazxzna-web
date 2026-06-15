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
const IconSoldItems = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    <path d="M9 14l2 2 4-4" />
  </svg>
);
const IconUsers = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
    <circle cx="9" cy="7" r="4" />
    <path d="M21 12h-3m0 0h-3m3 0V9m0 3v3" />
  </svg>
);
const IconExport = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M12 19V5m0 0l-7 7m7-7l7 7" />
    <path d="M5 21h14" />
  </svg>
);
const IconStorage = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7" />
    <ellipse cx="12" cy="7" rx="8" ry="4" />
    <path d="M4 12c0 2.21 3.582 4 8 4s8-1.79 8-4" />
  </svg>
);
const IconExportReport = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

// Intercept fetch to add authorization token and catch 401s
const originalFetch = window.fetch;
window.fetch = async (url, options = {}) => {
  const token = localStorage.getItem("gazxana_token");
  if (token) {
    options.headers = {
      ...options.headers,
      "Authorization": `Bearer ${token}`,
      ...options.headers
    };
  }
  const response = await originalFetch(url, options);
  if (response.status === 401 && !url.includes("/api/auth/login")) {
    localStorage.removeItem("gazxana_token");
    localStorage.removeItem("gazxana_user");
    window.dispatchEvent(new Event("auth-error"));
  }
  return response;
};

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("gazxana_token") || "");
  const [user, setUser] = useState(() => {
    try {
      const u = localStorage.getItem("gazxana_user");
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  });

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

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
  const [editingDebtorId, setEditingDebtorId] = useState(null);
  const [editDebtorForm, setEditDebtorForm] = useState({ name: "", phone: "", note: "" });

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
  const [editingTireCustomerId, setEditingTireCustomerId] = useState(null);
  const [editTireCustomerForm, setEditTireCustomerForm] = useState({ name: "", phone: "", note: "", initial_balance_usd: "" });
  
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
  const [tireCapitals, setTireCapitals] = useState([]);
  const [capitalForm, setCapitalForm] = useState({ amount_usd: "", capital_date: today, note: "" });

  /* ─── فرۆشراوەکان state ─── */
  const [soldItems, setSoldItems] = useState(null);
  const [soldItemsFrom, setSoldItemsFrom] = useState("");
  const [soldItemsTo, setSoldItemsTo] = useState("");
  const [soldItemsLoading, setSoldItemsLoading] = useState(false);
  const [soldItemsSearch, setSoldItemsSearch] = useState("");
  const [soldByTireSort, setSoldByTireSort] = useState({ key: "total_revenue_usd", dir: "desc" });
  const [soldDetailSort, setSoldDetailSort] = useState({ key: "line_revenue", dir: "desc" });
  
  /* ─── مسروفاتی تایە state ─── */
  const [tireExpenses, setTireExpenses] = useState([]);
  const [tireExpForm, setTireExpForm] = useState({ title: "", amount_iqd: "", expense_date: today, note: "" });
  const [tireExpFilterFrom, setTireExpFilterFrom] = useState("");
  const [tireExpFilterTo, setTireExpFilterTo] = useState("");
  const [tireExpensesLoading, setTireExpensesLoading] = useState(false);

  /* ─── هەناردەی گاز state ─── */
  const [gasExports, setGasExports] = useState([]);
  const [gasExportForm, setGasExportForm] = useState({
    receiver_name: "", quantity_liters: "", cost_price_per_barrel_usd: "", cost_price_per_barrel_iqd: "",
    status: "لە فرۆشتندایە", sell_price_per_barrel_usd: "", sell_price_per_barrel_iqd: "",
    export_date: today, note: ""
  });
  const [exportFilterFrom, setExportFilterFrom] = useState("");
  const [exportFilterTo, setExportFilterTo] = useState("");
  const [exportFilterStatus, setExportFilterStatus] = useState("");
  const [exportsLoading, setExportsLoading] = useState(false);
  const [exportSearch, setExportSearch] = useState("");
  const [exportSellForm, setExportSellForm] = useState({ id: null, sell_price_per_barrel_usd: "", sell_price_per_barrel_iqd: "" });

  /* ─── حەمباری گاز state ─── */
  const [gasStorage, setGasStorage] = useState([]);
  const [gasStorageSummary, setGasStorageSummary] = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageSellForm, setStorageSellForm] = useState({ id: null, sell_price_per_barrel_usd: "", sell_price_per_barrel_iqd: "" });

  /* ─── ڕاپۆرتی هەناردە state ─── */
  const [exportReport, setExportReport] = useState(null);
  const [exportReportFrom, setExportReportFrom] = useState("");
  const [exportReportTo, setExportReportTo] = useState("");
  const [exportReportLoading, setExportReportLoading] = useState(false);
  
  const [backupSecret, setBackupSecret] = useState("");
  const [backupErr, setBackupErr] = useState("");

  /* ─── بەڕێوەبردنی بەکارهێنەران (ئادمین) state ─── */
  const [managedUsers, setManagedUsers] = useState([]);
  const [newUserForm, setNewUserForm] = useState({ username: "", password: "", displayName: "", role: "user" });
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [usersErr, setUsersErr] = useState("");
  const [usersInfo, setUsersInfo] = useState("");

  /* ───────── API helpers ───────── */

  const loadTires = useCallback(async () => {
    if (!token || !user || user.role === "user") return;
    const r = await fetch(`${API}/tires`);
    if (r.ok) setTires(await r.json());
  }, [token, user]);

  const loadTireCustomers = useCallback(async () => {
    if (!token || !user || user.role === "user") return;
    const r = await fetch(`${API}/tire-customers`);
    if (r.ok) setTireCustomers(await r.json());
  }, [token, user]);

  const loadTireSales = useCallback(async () => {
    if (!token || !user || user.role === "user") return;
    const r = await fetch(`${API}/tire-sales`);
    if (r.ok) setTireSales(await r.json());
  }, [token, user]);

  const loadTirePayments = useCallback(async () => {
    if (!token || !user || user.role === "user") return;
    const r = await fetch(`${API}/tire-payments`);
    if (r.ok) setTirePayments(await r.json());
  }, [token, user]);

  const loadTireReport = useCallback(async () => {
    if (!token || !user || user.role === "user") return;
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
  }, [tireReportFrom, tireReportTo, token, user]);

  const loadTireCapitals = useCallback(async () => {
    if (!token || !user || user.role === "user") return;
    const r = await fetch(`${API}/tire-capital`);
    if (r.ok) setTireCapitals(await r.json());
  }, [token, user]);

  async function submitTireCapital(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await fetch(`${API}/tire-capital`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(capitalForm)
      });
      const raw = await r.text();
      if (!r.ok) {
        setErr(parseJsonFromText(raw)?.error || "تۆمارکردنی سەرمایە سەرنەکەوت");
        return;
      }
      setCapitalForm({ amount_usd: "", capital_date: today, note: "" });
      setInfoMsg("سەرمایە بە سەرکەوتوویی زیادکرا ✅");
      setTimeout(() => setInfoMsg(""), 3000);
      loadTireCapitals();
      loadTireReport();
    } catch (ex) {
      setErr(String(ex?.message || ex));
    }
  }

  async function deleteTireCapital(id) {
    if (!confirm("ئایا دڵنیایت لە سڕینەوەی ئەم بڕە سەرمایەیە؟")) return;
    setErr("");
    try {
      const r = await fetch(`${API}/tire-capital/${id}`, { method: "DELETE" });
      if (r.ok) {
        loadTireCapitals();
        loadTireReport();
      } else {
        setErr("سڕینەوەی سەرمایە سەرنەکەوت");
      }
    } catch (ex) {
      setErr(String(ex?.message || ex));
    }
  }

  const loadSoldItems = useCallback(async () => {
    if (!token || !user || user.role === "user") return;
    setSoldItemsLoading(true);
    try {
      const p = new URLSearchParams();
      if (soldItemsFrom) p.set("from", soldItemsFrom);
      if (soldItemsTo) p.set("to", soldItemsTo);
      const r = await fetch(`${API}/tire-reports/sold-items?` + p.toString());
      if (r.ok) setSoldItems(await r.json());
    } finally {
      setSoldItemsLoading(false);
    }
  }, [soldItemsFrom, soldItemsTo, token, user]);

  const loadTireExpenses = useCallback(async () => {
    if (!token || !user || user.role === "user") return;
    setTireExpensesLoading(true);
    try {
      const p = new URLSearchParams();
      if (tireExpFilterFrom) p.set("from", tireExpFilterFrom);
      if (tireExpFilterTo) p.set("to", tireExpFilterTo);
      const r = await fetch(`${API}/tire-expenses?` + p.toString());
      if (r.ok) setTireExpenses(await r.json());
    } finally {
      setTireExpensesLoading(false);
    }
  }, [tireExpFilterFrom, tireExpFilterTo, token, user]);

  /* ─── هەناردە API ─── */
  const loadGasExports = useCallback(async () => {
    if (!token || !user || user.role === "tire") return;
    setExportsLoading(true);
    try {
      const p = new URLSearchParams();
      if (exportFilterFrom) p.set("from", exportFilterFrom);
      if (exportFilterTo) p.set("to", exportFilterTo);
      if (exportFilterStatus) p.set("status", exportFilterStatus);
      const r = await fetch(`${API}/exports?` + p.toString());
      if (r.ok) setGasExports(await r.json());
    } finally {
      setExportsLoading(false);
    }
  }, [exportFilterFrom, exportFilterTo, exportFilterStatus, token, user]);

  const loadGasStorage = useCallback(async () => {
    if (!token || !user || user.role === "tire") return;
    setStorageLoading(true);
    try {
      const [listRes, summaryRes] = await Promise.all([
        fetch(`${API}/gas-storage`),
        fetch(`${API}/gas-storage/summary`)
      ]);
      if (listRes.ok) setGasStorage(await listRes.json());
      if (summaryRes.ok) setGasStorageSummary(await summaryRes.json());
    } finally {
      setStorageLoading(false);
    }
  }, [token, user]);

  const loadExportReport = useCallback(async () => {
    if (!token || !user || user.role === "tire") return;
    setExportReportLoading(true);
    try {
      const p = new URLSearchParams();
      if (exportReportFrom) p.set("from", exportReportFrom);
      if (exportReportTo) p.set("to", exportReportTo);
      const r = await fetch(`${API}/export-reports/summary?` + p.toString());
      if (r.ok) setExportReport(await r.json());
    } finally {
      setExportReportLoading(false);
    }
  }, [exportReportFrom, exportReportTo, token, user]);

  const loadDebtors = useCallback(async () => {
    if (!token || !user || user.role === "tire") return;
    const r = await fetch(`${API}/debtors`);
    const raw = await r.text();
    if (!r.ok) {
      throw new Error(humanApiFailure(r.status, raw));
    }
    const list = parseJsonFromText(raw);
    if (!Array.isArray(list)) throw new Error("وەڵامی سێرڤەر نادروستە");
    setDebtors(list);
  }, [token, user]);

  const loadTxns = useCallback(async (debtorId, q) => {
    if (!token || !user || user.role === "tire") return;
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
  }, [token, user]);

  const loadExpenses = useCallback(async () => {
    if (!token || !user || user.role === "tire") return;
    const p = new URLSearchParams();
    if (expFilterFrom) p.set("from", expFilterFrom);
    if (expFilterTo) p.set("to", expFilterTo);
    const r = await fetch(`${API}/expenses?` + p.toString());
    const raw = await r.text();
    if (!r.ok) throw new Error(humanApiFailure(r.status, raw));
    const list = parseJsonFromText(raw);
    if (!Array.isArray(list)) throw new Error("وەڵامی سێرڤەر نادروستە");
    setExpenses(list);
  }, [expFilterFrom, expFilterTo, token, user]);

  const loadReport = useCallback(async () => {
    if (!token || !user || user.role === "tire") return;
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
  }, [reportFrom, reportTo, token, user]);

  function handleDownloadBackup(type = "db") {
    setBackupErr("");
    if (!backupSecret.trim()) {
      setBackupErr("تکایە تێپەڕەوشە بنووسە");
      return;
    }
    const downloadUrl = `${API}/admin/backup-db?secret=${encodeURIComponent(backupSecret)}&type=${type}`;
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

  async function handleRestoreBackup() {
    setBackupErr("");
    setInfoMsg("");
    if (!backupSecret.trim()) {
      setBackupErr("تکایە تێپەڕەوشەی باکئەپ بنووسە");
      return;
    }
    
    const fileInput = document.getElementById("restore-file-input");
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      setBackupErr("تکایە فایلی باکئەپەکە (.sqlite یان .json) هەڵبژێرە.");
      return;
    }

    const file = fileInput.files[0];
    const isJson = file.name.endsWith(".json");

    if (!confirm(`ئایا دڵنیای لە گەڕاندنەوەی ئەم فایلە؟ هەموو زانیارییەکانی بەشی پەیوەندیدار دەسڕێنەوە و داتاکانی ئەم فایلە جێگەی دەگرنەوە.`)) {
      return;
    }

    try {
      setLoading(true);
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          let bodyData;
          let headers = {};
          
          if (isJson) {
            bodyData = e.target.result;
            headers["Content-Type"] = "application/json";
          } else {
            bodyData = e.target.result;
            headers["Content-Type"] = "application/octet-stream";
          }

          const r = await fetch(`${API}/admin/restore-db?secret=${encodeURIComponent(backupSecret)}`, {
            method: "POST",
            headers: headers,
            body: bodyData
          });
          const raw = await r.text();
          if (!r.ok) {
            let errorMsg = "گەڕاندنەوەی داتا سەرنەکەوت";
            try {
              errorMsg = JSON.parse(raw).error || errorMsg;
            } catch (_) {}
            setBackupErr(errorMsg);
            setLoading(false);
            return;
          }
          setBackupSecret("");
          fileInput.value = "";
          
          if (isJson) {
            setInfoMsg("داتاکان بە سەرکەوتوویی گەڕێندرانەوە! پەڕەکە دوای ٢ چرکە نوێ دەبێتەوە.");
            setTimeout(() => {
              window.location.reload();
            }, 2000);
          } else {
            setInfoMsg("داتابەیس بە سەرکەوتوویی گەڕێندرایەوە! سیستەمەکە دوای ٣ چرکە نوێ دەبێتەوە.");
            setTimeout(() => {
              window.location.reload();
            }, 3000);
          }
        } catch (ex) {
          setBackupErr(String(ex?.message || ex));
          setLoading(false);
        }
      };

      if (isJson) {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    } catch (ex) {
      setBackupErr(String(ex?.message || ex));
      setLoading(false);
    }
  }

  /* ─── سێستەمی لۆگین و لۆگئاوت ─── */
  useEffect(() => {
    const handleAuthError = () => {
      setToken("");
      setUser(null);
      setErr("کێشەیەک لە چوونیەتەژوورەوە هەیە یان دانیشتنەکەت بەسەرچووە. تکایە دووبارە بچۆرە ژوورەوە.");
    };
    window.addEventListener("auth-error", handleAuthError);
    return () => {
      window.removeEventListener("auth-error", handleAuthError);
    };
  }, []);

  // کۆنتڕۆڵی دەستگەیشتنی تابەکان بۆ هەر بەکارهێنەرێک
  useEffect(() => {
    if (!user) return;
    if (user.role === "tire" && ["daily", "debtors", "expenses", "report"].includes(tab)) {
      setTab("tire_inventory");
    } else if (user.role === "user" && ["tire_inventory", "tire_sales", "tire_debtors", "tire_reports", "tire_sold_items"].includes(tab)) {
      setTab("daily");
    }
  }, [user, tab]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginErr("");
    setLoginLoading(true);
    try {
      const r = await originalFetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const raw = await r.text();
      if (!r.ok) {
        let msg = "پەیوەندی لەگەڵ سێرڤەر سەرنەکەوت";
        try {
          const j = JSON.parse(raw);
          msg = j.error || msg;
        } catch {}
        setLoginErr(msg);
        return;
      }
      const data = JSON.parse(raw);
      localStorage.setItem("gazxana_token", data.token);
      localStorage.setItem("gazxana_user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setLoginUsername("");
      setLoginPassword("");
      if (data.user.role === "tire") {
        setTab("tire_inventory");
      } else {
        setTab("daily");
      }
    } catch (ex) {
      setLoginErr("پەیوەندی لەگەڵ سێرڤەر سەرنەکەوت.");
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("gazxana_token");
    localStorage.removeItem("gazxana_user");
    setToken("");
    setUser(null);
    setTab("daily");
    setErr("");
    setInfoMsg("");
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
    if (!selectedId || !token || !user || user.role === "tire") {
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
  }, [selectedId, debtors, transactions, token, user]);

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
      loadTireSales();
    } else if (tab === "tire_reports") {
      loadTireReport();
      loadTireCapitals();
    } else if (tab === "tire_sold_items") {
      loadSoldItems();
    } else if (tab === "tire_expenses") {
      loadTireExpenses();
    } else if (tab === "gas_exports") {
      loadGasExports();
    } else if (tab === "gas_storage") {
      loadGasStorage();
    } else if (tab === "export_reports") {
      loadExportReport();
    }
  }, [tab, loadTires, loadTireCustomers, loadTireSales, loadTirePayments, loadTireReport, loadTireCapitals, loadSoldItems, loadTireExpenses, loadGasExports, loadGasStorage, loadExportReport]);

  /* بارکردنی مسروفاتی تایە کاتێک فلتەرەکان دەگۆڕێن */
  useEffect(() => {
    if (tab === "tire_expenses") {
      loadTireExpenses();
    }
  }, [tab, tireExpFilterFrom, tireExpFilterTo, loadTireExpenses]);

  /* بارکردنی لیستی بەکارهێنەران بۆ ئادمین */
  const loadManagedUsers = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${API}/admin/users`);
      if (r.ok) setManagedUsers(await r.json());
    } catch {}
  }, [token]);

  useEffect(() => {
    if (tab === "users" && user?.role === "admin") loadManagedUsers();
  }, [tab, user, loadManagedUsers]);

  async function addManagedUser(e) {
    e.preventDefault();
    setUsersErr("");
    setUsersInfo("");
    try {
      const r = await fetch(`${API}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUserForm),
      });
      const raw = await r.text();
      if (!r.ok) {
        let msg = "کێشەیەک ڕوویدا";
        try { const j = JSON.parse(raw); msg = j.error || msg; } catch {}
        setUsersErr(msg);
        return;
      }
      setNewUserForm({ username: "", password: "", displayName: "", role: "user" });
      setShowAddUserForm(false);
      await loadManagedUsers();
      setUsersInfo("بەکارهێنەر بە سەرکەوتوویی زیاد کرا.");
      window.setTimeout(() => setUsersInfo(""), 4000);
    } catch (ex) {
      setUsersErr("پەیوەندی لەگەڵ سێرڤەر سەرنەکەوت.");
    }
  }

  async function deleteManagedUser(username) {
    if (!confirm(`سڕینەوەی بەکارهێنەری "${username}"؟ ئەم کردارە ناگەڕێنەوە.`)) return;
    setUsersErr("");
    setUsersInfo("");
    try {
      const r = await fetch(`${API}/admin/users/${encodeURIComponent(username)}`, { method: "DELETE" });
      const raw = await r.text();
      if (!r.ok) {
        let msg = "کێشەیەک ڕوویدا";
        try { const j = JSON.parse(raw); msg = j.error || msg; } catch {}
        setUsersErr(msg);
        return;
      }
      await loadManagedUsers();
      setUsersInfo("بەکارهێنەر سڕایەوە.");
      window.setTimeout(() => setUsersInfo(""), 4000);
    } catch (ex) {
      setUsersErr("پەیوەندی لەگەڵ سێرڤەر سەرنەکەوت.");
    }
  }

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

  function startEditDebtor(d) {
    setEditingDebtorId(d.id);
    setEditDebtorForm({ name: d.name, phone: d.phone || "", note: d.note || "" });
  }

  function cancelEditDebtor() {
    setEditingDebtorId(null);
    setEditDebtorForm({ name: "", phone: "", note: "" });
  }

  async function saveEditDebtor(id) {
    setErr("");
    setInfoMsg("");
    try {
      const r = await fetch(`${API}/debtors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDebtorForm),
      });
      const raw = await r.text();
      if (!r.ok) {
        setErr(humanApiFailure(r.status, raw));
        return;
      }
      setEditingDebtorId(null);
      setEditDebtorForm({ name: "", phone: "", note: "" });
      await refreshDebtors();
      if (debtorsFocusId && String(debtorsFocusId) === String(id)) {
        await refreshDebtorFocusSummary();
      }
      setInfoMsg("زانیاری قەرزدار نوێکرایەوە.");
      window.setTimeout(() => setInfoMsg(""), 4000);
    } catch (ex) {
      setErr(String(ex?.message || ex) || "پەیوەندی سێرڤەر سەرکەوتوو نەبوو.");
    }
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

  function startEditTireCustomer(c) {
    setEditingTireCustomerId(c.id);
    setEditTireCustomerForm({
      name: c.name,
      phone: c.phone || "",
      note: c.note || "",
      initial_balance_usd: c.initial_balance_usd ?? 0
    });
  }

  function cancelEditTireCustomer() {
    setEditingTireCustomerId(null);
    setEditTireCustomerForm({ name: "", phone: "", note: "", initial_balance_usd: "" });
  }

  async function saveEditTireCustomer(id) {
    setErr("");
    setInfoMsg("");
    try {
      const r = await fetch(`${API}/tire-customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editTireCustomerForm),
      });
      const raw = await r.text();
      if (!r.ok) {
        setErr(humanApiFailure(r.status, raw));
        return;
      }
      setEditingTireCustomerId(null);
      setEditTireCustomerForm({ name: "", phone: "", note: "", initial_balance_usd: "" });
      await loadTireCustomers();
      setInfoMsg("زانیاری قەرزداری تایە نوێکرایەوە.");
      window.setTimeout(() => setInfoMsg(""), 4000);
    } catch (ex) {
      setErr(String(ex?.message || ex) || "پەیوەندی سێرڤەر سەرکەوتوو نەبوو.");
    }
  }

  async function removeTireCustomer(id) {
    if (!confirm("سڕینەوەی ئەم قەرزدارەی تایە و هەموو واسڵکردنەکانی؟")) return;
    setErr("");
    setInfoMsg("");
    try {
      const r = await fetch(`${API}/tire-customers/${id}`, { method: "DELETE" });
      const raw = await r.text();
      if (!r.ok) {
        setErr(humanApiFailure(r.status, raw));
        return;
      }
      if (String(focusedTireCustomerId) === String(id)) setFocusedTireCustomerId("");
      await loadTireCustomers();
      setInfoMsg("قەرزداری تایە سڕایەوە.");
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

  /* ───────── Tire Expense Actions ───────── */

  async function submitTireExpense(e) {
    e.preventDefault();
    setErr("");
    setInfoMsg("");
    try {
      const body = {
        title: tireExpForm.title.trim(),
        amount_iqd: num(tireExpForm.amount_iqd),
        expense_date: tireExpForm.expense_date,
        note: tireExpForm.note.trim()
      };
      const r = await fetch(`${API}/tire-expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const raw = await r.text();
      if (!r.ok) {
        setErr(humanApiFailure(r.status, raw));
        return;
      }
      setTireExpForm({ title: "", amount_iqd: "", expense_date: today, note: "" });
      await loadTireExpenses();
      setInfoMsg("مسروف بە سەرکەوتوویی تۆمار کرا.");
      window.setTimeout(() => setInfoMsg(""), 3000);
    } catch (ex) {
      setErr(String(ex?.message || ex));
    }
  }

  async function deleteTireExpense(id) {
    if (!confirm("ئایا دڵنیای لە سڕینەوەی ئەم مسروفە؟")) return;
    setErr("");
    setInfoMsg("");
    try {
      const r = await fetch(`${API}/tire-expenses/${id}`, { method: "DELETE" });
      const raw = await r.text();
      if (!r.ok) {
        setErr(humanApiFailure(r.status, raw));
        return;
      }
      await loadTireExpenses();
      setInfoMsg("مسروفەکە سڕایەوە.");
      window.setTimeout(() => setInfoMsg(""), 3000);
    } catch (ex) {
      setErr(String(ex?.message || ex));
    }
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

  /* ─── سۆرتکراوی فرۆشراوەکان ─── */
  const sortedSoldByTire = useMemo(() => {
    if (!soldItems || !soldItems.sold_by_tire) return [];
    let list = soldItems.sold_by_tire.map(item => ({
      ...item,
      profit: (item.total_revenue_usd || 0) - (item.total_cost_usd || 0)
    }));
    const q = soldItemsSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(item => 
        String(item.tire_name || "").toLowerCase().includes(q) ||
        String(item.tire_size || "").toLowerCase().includes(q)
      );
    }
    const { key, dir } = soldByTireSort;
    list.sort((a, b) => {
      let av = a[key] ?? 0, bv = b[key] ?? 0;
      if (typeof av === "string") { av = av.toLowerCase(); bv = (bv || "").toLowerCase(); }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [soldItems, soldByTireSort, soldItemsSearch]);

  const sortedSoldDetail = useMemo(() => {
    if (!soldItems || !soldItems.sales_detail) return [];
    let list = [...soldItems.sales_detail];
    const q = soldItemsSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(d => 
        String(d.customer_name || "نەقد (کاش)").toLowerCase().includes(q) ||
        String(d.tire_name || "").toLowerCase().includes(q) ||
        String(d.note || "").toLowerCase().includes(q) ||
        String(d.payment_type || "").toLowerCase().includes(q)
      );
    }
    const { key, dir } = soldDetailSort;
    list.sort((a, b) => {
      let av = a[key] ?? 0, bv = b[key] ?? 0;
      if (typeof av === "string") { av = av.toLowerCase(); bv = (bv || "").toLowerCase(); }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [soldItems, soldDetailSort, soldItemsSearch]);

  const soldByTireTotals = useMemo(() => {
    let qty = 0;
    let cost = 0;
    let rev = 0;
    let profit = 0;
    sortedSoldByTire.forEach((item) => {
      qty += item.total_sold_qty || 0;
      cost += item.total_cost_usd || 0;
      rev += item.total_revenue_usd || 0;
      profit += item.profit || 0;
    });
    return { qty, cost, rev, profit };
  }, [sortedSoldByTire]);

  const soldDetailTotals = useMemo(() => {
    let qty = 0;
    let cost = 0;
    let rev = 0;
    let profit = 0;
    sortedSoldDetail.forEach((d) => {
      qty += d.sold_qty || 0;
      cost += d.line_cost || 0;
      rev += d.line_revenue || 0;
      profit += d.line_profit || 0;
    });
    return { qty, cost, rev, profit };
  }, [sortedSoldDetail]);

  const tireCustomerStatement = useMemo(() => {
    if (!focusedTireCustomerId || !focusedTireCustomerDetail) return [];

    const list = [];
    let runningUsd = 0;

    // 1. Initial Balance
    const initVal = focusedTireCustomerDetail.initial_balance_usd || 0;
    runningUsd += initVal;
    list.push({
      date: focusedTireCustomerDetail.created_at ? focusedTireCustomerDetail.created_at.substring(0, 10) : "",
      type: "قەرزی سەرەتایی",
      description: "قەرزی سەرەتایی لە کاتی تۆمارکردنی ناو",
      debit_usd: initVal,
      credit_usd: 0,
      balance_usd: runningUsd
    });

    // 2. Sales
    const customerSales = tireSales.filter(s => String(s.customer_id) === String(focusedTireCustomerId));
    customerSales.forEach(s => {
      const itemsDesc = (s.items || []).map(i => `${i.quantity}x ${i.tire_name}`).join("، ");
      list.push({
        date: s.sale_date,
        type: "فرۆشتن",
        description: itemsDesc ? `کڕینی تایە (${itemsDesc})` : "فرۆشتنی تایە",
        debit_usd: s.total_usd || 0,
        credit_usd: s.paid_usd || 0
      });
    });

    // 3. Payments
    const customerPayments = tirePayments.filter(p => String(p.customer_id) === String(focusedTireCustomerId));
    customerPayments.forEach(p => {
      list.push({
        date: p.payment_date,
        type: "واسڵکردن",
        description: p.note ? `واسڵکردنی پارە (${p.note})` : "واسڵکردنی پارە",
        debit_usd: 0,
        credit_usd: p.amount_usd || 0
      });
    });

    // Sort chronologically by date
    list.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      if (a.type === "قەرزی سەرەتایی") return -1;
      if (b.type === "قەرزی سەرەتایی") return 1;
      if (a.type === "فرۆشتن" && b.type === "واسڵکردن") return -1;
      if (a.type === "واسڵکردن" && b.type === "فرۆشتن") return 1;
      return 0;
    });

    // Recalculate running balance
    let bal = 0;
    list.forEach(item => {
      bal += (item.debit_usd || 0) - (item.credit_usd || 0);
      item.balance_usd = bal;
    });

    return list;
  }, [focusedTireCustomerId, focusedTireCustomerDetail, tireSales, tirePayments]);

  function printTireCustomerStatement() {
    if (!focusedTireCustomerDetail || tireCustomerStatement.length === 0) return;
    const printWindow = window.open("", "_blank");
    
    let totalDebit = 0;
    let totalCredit = 0;
    tireCustomerStatement.forEach(item => {
      totalDebit += item.debit_usd || 0;
      totalCredit += item.credit_usd || 0;
    });
    const finalBalance = totalDebit - totalCredit;

    const html = `
      <!DOCTYPE html>
      <html lang="ku" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>کەشف حیسابی - ${focusedTireCustomerDetail.name}</title>
        <style>
          body {
            font-family: Tahoma, Geneva, sans-serif;
            margin: 40px;
            color: #333;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 15px;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            color: #1e3a8a;
          }
          .header p {
            margin: 5px 0 0;
            color: #666;
            font-size: 14px;
          }
          .info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
            background: #f8fafc;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
          }
          .info div {
            font-size: 14px;
          }
          .info div strong {
            color: #1e3a8a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 10px 12px;
            text-align: right;
            font-size: 13px;
          }
          th {
            background-color: #f1f5f9;
            color: #1e3a8a;
            font-weight: 700;
          }
          tr:nth-child(even) td {
            background-color: #f8fafc;
          }
          .totals {
            margin-top: 20px;
            float: left;
            width: 300px;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 15px;
          }
          .totals-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 14px;
          }
          .totals-row.grand {
            border-top: 2px solid #3b82f6;
            padding-top: 8px;
            font-weight: bold;
            font-size: 16px;
            color: #1e3a8a;
          }
          .footer {
            margin-top: 60px;
            text-align: center;
            font-size: 12px;
            color: #888;
            clear: both;
          }
          @media print {
            body { margin: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>گازخانە — بەشی تایە</h1>
          <p>کەشف حیسابی قەرزدار</p>
        </div>
        <div class="info">
          <div>ناوی قەرزدار: <strong>${focusedTireCustomerDetail.name}</strong></div>
          <div>مۆبایل: <strong>${focusedTireCustomerDetail.phone || "—"}</strong></div>
          <div>ڕێکەوت: <strong>${new Date().toLocaleDateString('ku-IQ')}</strong></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>ڕێکەوت</th>
              <th>جۆری مامەڵە</th>
              <th>وردەکاری</th>
              <th>بڕی قەرز (قەرزدارە)</th>
              <th>بڕی واسڵکراو (واسڵ)</th>
              <th>باڵانس / ماوە</th>
            </tr>
          </thead>
          <tbody>
            ${tireCustomerStatement.map(item => `
              <tr>
                <td>${item.date}</td>
                <td>${item.type}</td>
                <td>${item.description}</td>
                <td style="font-weight: 600; color: ${item.debit_usd > 0 ? '#b91c1c' : '#333'}">${item.debit_usd > 0 ? '$' + item.debit_usd.toFixed(2) : '—'}</td>
                <td style="font-weight: 600; color: ${item.credit_usd > 0 ? '#15803d' : '#333'}">${item.credit_usd > 0 ? '$' + item.credit_usd.toFixed(2) : '—'}</td>
                <td style="font-weight: 700; color: ${item.balance_usd > 0 ? '#b91c1c' : '#15803d'}">$${item.balance_usd.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="totals">
          <div class="totals-row">
            <span>کۆی گشتی قەرزەکان:</span>
            <span>$${totalDebit.toFixed(2)}</span>
          </div>
          <div class="totals-row">
            <span>کۆی گشتی واسڵکراو:</span>
            <span>$${totalCredit.toFixed(2)}</span>
          </div>
          <div class="totals-row grand">
            <span>ماوەی قەرزی کۆتایی:</span>
            <span>$${finalBalance.toFixed(2)}</span>
          </div>
        </div>
        <div class="footer">
          <p>سیستەمی گازخانە — بەڕێوەبردنی قەرز و مامەڵە</p>
        </div>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  }

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

  if (!token || !user) {
    return (
      <div className="login-container">
        <form className="login-card" onSubmit={handleLogin}>
          <h2>چوونەژوورەوە بۆ گازخانە</h2>
          {loginErr ? <div className="banner err" style={{ gridColumn: "span 2" }}>{loginErr}</div> : null}
          <label className="span2">
            ناوی بەکارهێنەر
            <input
              type="text"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              placeholder="ناوی بەکارهێنەر بنووسە"
              required
              autoFocus
            />
          </label>
          <label className="span2">
            وشەی نهێنی
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="وشەی نهێنی بنووسە"
              required
            />
          </label>
          <button type="submit" className="primary span2" style={{ justifySelf: "stretch" }} disabled={loginLoading}>
            {loginLoading ? "کاردەکات..." : "چوونەژوورەوە"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top">
        <div className="logo-section">
          <h1>گازخانە — بەڕێوەبردنی قەرز و مامەڵە</h1>
          <div className="user-profile">
            <span>👤 {user.displayName}</span>
            <button type="button" className="danger link logout-btn" onClick={handleLogout}>
              دەرچوون
            </button>
          </div>
        </div>
        <nav className="tabs">
          {(user.role === "admin" || user.role === "user") && (
            <>
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
            </>
          )}
          
          {user.role === "admin" && <span className="nav-separator"></span>}
          
          {(user.role === "admin" || user.role === "tire") && (
            <>
              <button type="button" className={tab === "tire_inventory" ? "on" : ""} onClick={() => switchTab("tire_inventory")}>
                <IconInventory /> مخزنی تایە
              </button>
              <button type="button" className={tab === "tire_sales" ? "on" : ""} onClick={() => switchTab("tire_sales")}>
                <IconTireSales /> فرۆشتنی تایە
              </button>
              <button type="button" className={tab === "tire_debtors" ? "on" : ""} onClick={() => switchTab("tire_debtors")}>
                <IconTireDebtors /> قەرزدارانی تایە
              </button>
              <button type="button" className={tab === "tire_sold_items" ? "on" : ""} onClick={() => switchTab("tire_sold_items")}>
                <IconSoldItems /> فرۆشراوەکان
              </button>
              <button type="button" className={tab === "tire_expenses" ? "on" : ""} onClick={() => switchTab("tire_expenses")}>
                <IconExpenses /> مسروفات
              </button>
              <button type="button" className={tab === "tire_reports" ? "on" : ""} onClick={() => switchTab("tire_reports")}>
                <IconTireReports /> ڕاپۆرتی تایە
              </button>
            </>
          )}

          {(user.role === "admin" || user.role === "user") && (
            <>
              <span className="nav-separator"></span>
              <button type="button" className={tab === "gas_exports" ? "on" : ""} onClick={() => switchTab("gas_exports")}>
                <IconExport /> هەناردە
              </button>
              <button type="button" className={tab === "gas_storage" ? "on" : ""} onClick={() => switchTab("gas_storage")}>
                <IconStorage /> حەمباری گاز
              </button>
              <button type="button" className={tab === "export_reports" ? "on" : ""} onClick={() => switchTab("export_reports")}>
                <IconExportReport /> ڕاپۆرتی هەناردە
              </button>
            </>
          )}

          {user.role === "admin" && (
            <>
              <span className="nav-separator"></span>
              <button type="button" className={tab === "users" ? "on" : ""} onClick={() => switchTab("users")}>
                <IconUsers /> بەکارهێنەران
              </button>
            </>
          )}
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
                    editingDebtorId === d.id ? (
                      <tr key={d.id} className="row-editing">
                        <td>
                          <input
                            value={editDebtorForm.name}
                            onChange={(e) => setEditDebtorForm({ ...editDebtorForm, name: e.target.value })}
                            placeholder="ناو"
                            style={{ width: "100%", minWidth: "100px" }}
                            autoFocus
                          />
                        </td>
                        <td>
                          <input
                            value={editDebtorForm.phone}
                            onChange={(e) => setEditDebtorForm({ ...editDebtorForm, phone: e.target.value })}
                            placeholder="مۆبایل"
                            style={{ width: "100%", minWidth: "90px" }}
                          />
                        </td>
                        <td className="num debt" style={{ fontWeight: "600" }}>{d.balance_usd ? fmtMoney(d.balance_usd, "usd") : "0 $"}</td>
                        <td className="num debt" style={{ fontWeight: "600" }}>{d.balance_iqd ? fmtMoney(d.balance_iqd, "iqd") : "0 د.ع"}</td>
                        <td>
                          <input
                            value={editDebtorForm.note}
                            onChange={(e) => setEditDebtorForm({ ...editDebtorForm, note: e.target.value })}
                            placeholder="تێبینی"
                            style={{ width: "100%", minWidth: "100px" }}
                          />
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "nowrap" }}>
                            <button type="button" className="primary link" onClick={() => saveEditDebtor(d.id)} style={{ whiteSpace: "nowrap" }}>
                              پاشەکەوت
                            </button>
                            <button type="button" className="ghost link" onClick={cancelEditDebtor} style={{ whiteSpace: "nowrap" }}>
                              پاشگەزبوونەوە
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
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
                          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "nowrap" }}>
                            <button type="button" className="ghost link" onClick={() => startEditDebtor(d)} style={{ whiteSpace: "nowrap" }}>
                              دەستکاری
                            </button>
                            <button type="button" className="danger link" onClick={() => removeDebtor(d.id)} style={{ whiteSpace: "nowrap" }}>
                              سڕینەوە
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
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
              <div className="balance-bar debtor-totals" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem", background: "none", border: "none", padding: 0 }}>
                <div style={{ background: "rgba(59, 130, 246, 0.05)", padding: "1rem", borderRadius: "8px", border: "1px solid rgba(59, 130, 246, 0.1)" }}>
                  <h4 style={{ margin: "0 0 0.75rem 0", color: "var(--primary)", borderBottom: "1px solid rgba(59, 130, 246, 0.15)", paddingBottom: "0.25rem" }}>حیسابی دۆلار ($)</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="lbl">قەرزی پێشوو:</span>
                      <strong style={{ color: "var(--text)" }}>{fmtMoney(debtorsFocusDetail.previous_debt_usd, "usd")}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="lbl">قەرزی ئێستا:</span>
                      <strong style={{ color: "var(--owe)", fontWeight: "700" }}>{fmtMoney(debtorsFocusDetail.latest_debt_usd, "usd")}</strong>
                    </div>
                    <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.25rem 0" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="lbl" style={{ fontWeight: "700", color: "var(--text)" }}>کۆی گشتی قەرز:</span>
                      <strong className={debtorsFocusDetail.balance_usd > 0 ? "owe" : "ok"} style={{ fontSize: "1.2rem", fontWeight: "800" }}>
                        {fmtMoney(debtorsFocusDetail.balance_usd, "usd")}
                      </strong>
                    </div>
                  </div>
                </div>

                <div style={{ background: "rgba(59, 130, 246, 0.05)", padding: "1rem", borderRadius: "8px", border: "1px solid rgba(59, 130, 246, 0.1)" }}>
                  <h4 style={{ margin: "0 0 0.75rem 0", color: "var(--primary)", borderBottom: "1px solid rgba(59, 130, 246, 0.15)", paddingBottom: "0.25rem" }}>حیسابی دینار (د.ع)</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="lbl">قەرزی پێشوو:</span>
                      <strong style={{ color: "var(--text)" }}>{fmtMoney(debtorsFocusDetail.previous_debt_iqd, "iqd")}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="lbl">قەرزی ئێستا:</span>
                      <strong style={{ color: "var(--owe)", fontWeight: "700" }}>{fmtMoney(debtorsFocusDetail.latest_debt_iqd, "iqd")}</strong>
                    </div>
                    <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.25rem 0" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="lbl" style={{ fontWeight: "700", color: "var(--text)" }}>کۆی گشتی قەرز:</span>
                      <strong className={debtorsFocusDetail.balance_iqd > 0 ? "owe" : "ok"} style={{ fontSize: "1.2rem", fontWeight: "800" }}>
                        {fmtMoney(debtorsFocusDetail.balance_iqd, "iqd")}
                      </strong>
                    </div>
                  </div>
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
            <h3>باکئەپ و پاراستنی داتاکان (SQLite / JSON Backup)</h3>
            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
              لێرەوە دەتوانیت باکئەپی گشتی یان باکئەپی تایبەت بە هەر بەشێک جیا بکەیتەوە و دایبەزێنیتە سەر کۆمپیوتەرەکەت.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "600px", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="password"
                  placeholder="تێپەڕەوشەی باکئەپ بنووسە…"
                  value={backupSecret}
                  onChange={(e) => setBackupSecret(e.target.value)}
                  style={{ flex: "1 1 200px", minHeight: "2.2rem" }}
                />
                {user?.role === "admin" && (
                  <button
                    type="button"
                    className="danger"
                    onClick={handleResetDatabase}
                    style={{ minHeight: "2.2rem", padding: "0 1.2rem" }}
                  >
                    ⚠️ سفرکردنەوەی گشتی
                  </button>
                )}
              </div>
              
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {user?.role === "admin" && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => handleDownloadBackup("db")}
                    style={{ minHeight: "2.2rem", flex: "1 1 150px" }}
                  >
                    💾 باکئەپی گشتی (SQLite)
                  </button>
                )}
                {(user?.role === "admin" || user?.role === "user") && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => handleDownloadBackup("gazxana")}
                    style={{ minHeight: "2.2rem", flex: "1 1 150px", background: "#3b82f6" }}
                  >
                    📝 باکئەپی گازخانە (JSON)
                  </button>
                )}
                {(user?.role === "admin" || user?.role === "tire") && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => handleDownloadBackup("tires")}
                    style={{ minHeight: "2.2rem", flex: "1 1 150px", background: "#8b5cf6" }}
                  >
                    🚗 باکئەپی تایە (JSON)
                  </button>
                )}
              </div>
            </div>
            
            <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "1rem 0" }} />
            
            <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--text)" }}>گەڕاندنەوەی داتابەیس لە باکئەپ (Restore Backup)</h4>
            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
              {user?.role === "admin" 
                ? "فایلی باکئەپی دابەزێنراو (`.sqlite` یان `.json`) هەڵبژێرە و تێپەڕەوشەی باکئەپەکە لە سەرەوە بنووسە بۆ گەڕاندنەوەی سەرجەم حیساباتەکانت."
                : "فایلی باکئەپی دابەزێنراو (`.json`) هەڵبژێرە و تێپەڕەوشەی باکئەپەکە لە سەرەوە بنووسە بۆ گەڕاندنەوەی حیساباتەکانت."
              }
            </p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", maxWidth: "550px" }}>
              <input
                type="file"
                accept={user?.role === "admin" ? ".sqlite,.json" : ".json"}
                id="restore-file-input"
                style={{ flex: "1 1 200px", fontSize: "0.85rem", padding: "0.35rem" }}
              />
              <button
                type="button"
                className="primary"
                onClick={handleRestoreBackup}
                style={{ minHeight: "2.2rem", padding: "0 1.5rem", background: "var(--accent)" }}
              >
                📥 گەڕاندنەوەی داتا
              </button>
            </div>
            {backupErr ? <p style={{ color: "var(--owe)", fontSize: "0.85rem", marginTop: "0.75rem" }}>{backupErr}</p> : null}
          </section>
        </div>
      ) : null}

      {/* ═══════ TAB: مسروفات (Tire Expenses) ═══════ */}
      {tab === "tire_expenses" ? (
        <div className="tab-panels">
          <section className="card" aria-labelledby="tire-exp-add-heading">
            <h2 id="tire-exp-add-heading">زیادکردنی مسرووف</h2>
            <form className="grid-form" onSubmit={submitTireExpense}>
              <label>
                ناونیشان / چی خەرج کرا؟
                <input
                  value={tireExpForm.title}
                  onChange={(e) => setTireExpForm({ ...tireExpForm, title: e.target.value })}
                  placeholder="بۆ نموونە: کڕینی چا و قاوە"
                  required
                />
              </label>
              <label>
                بڕ بە دینار (د.ع)
                <input
                  inputMode="numeric"
                  value={tireExpForm.amount_iqd}
                  onChange={(e) => setTireExpForm({ ...tireExpForm, amount_iqd: e.target.value })}
                  placeholder="0"
                  required
                />
              </label>
              <label>
                ڕێکەوت
                <input
                  type="date"
                  value={tireExpForm.expense_date}
                  onChange={(e) => setTireExpForm({ ...tireExpForm, expense_date: e.target.value })}
                  required
                />
              </label>
              <label className="span2">
                تێبینی
                <input
                  value={tireExpForm.note}
                  onChange={(e) => setTireExpForm({ ...tireExpForm, note: e.target.value })}
                  placeholder="ئیختیاری"
                />
              </label>
              <button type="submit" className="primary">
                تۆمارکردنی مسرووف
              </button>
            </form>
          </section>

          {/* کورتەی مسروفاتی تایە */}
          <section className="card">
            <div className="expense-summary-bar" style={{ background: "var(--debt-bg)", borderColor: "var(--debt-border)", gridTemplateColumns: "1fr" }}>
              <div className="expense-total">
                <span className="lbl" style={{ color: "var(--text)" }}>کۆی گشتی مسروفات بە دینار (د.ع)</span>
                <strong className="expense-amount" style={{ color: "var(--owe)" }}>
                  {fmtMoney(tireExpenses.reduce((acc, curr) => acc + (curr.amount_iqd || 0), 0), "iqd")}
                </strong>
              </div>
            </div>
          </section>

          <section className="card" aria-labelledby="tire-exp-list-heading">
            <div className="section-head">
              <h2 id="tire-exp-list-heading">لیستی مسروفات بە دینار</h2>
              <div className="filter-row">
                <label className="filter-label">
                  لە
                  <input type="date" value={tireExpFilterFrom} onChange={(e) => setTireExpFilterFrom(e.target.value)} />
                </label>
                <label className="filter-label">
                  بۆ
                  <input type="date" value={tireExpFilterTo} onChange={(e) => setTireExpFilterTo(e.target.value)} />
                </label>
              </div>
            </div>
            <div className="table-wrap scroll">
              <table className="data compact">
                <thead>
                  <tr>
                    <th>ڕێکەوت</th>
                    <th>ناونیشانی مسرووف</th>
                    <th>بڕ (د.ع)</th>
                    <th>تێبینی</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tireExpenses.map((ex) => (
                    <tr key={ex.id}>
                      <td>{ex.expense_date}</td>
                      <td style={{ fontWeight: "600" }}>{ex.title}</td>
                      <td className="num debt" style={{ fontWeight: "700" }}>{fmtMoney(ex.amount_iqd, "iqd")}</td>
                      <td className="muted">{ex.note}</td>
                      <td>
                        <button type="button" className="danger link" onClick={() => deleteTireExpense(ex.id)}>
                          سڕینەوە
                        </button>
                      </td>
                    </tr>
                  ))}
                  {tireExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                        هیچ مسرووفێک تۆمار نەکراوە.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
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
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTireCustomers.map((c) => (
                      editingTireCustomerId === c.id ? (
                        <tr key={c.id} className="row-editing">
                          <td>
                            <input
                              value={editTireCustomerForm.name}
                              onChange={(e) => setEditTireCustomerForm({ ...editTireCustomerForm, name: e.target.value })}
                              placeholder="ناو"
                              style={{ width: "100%", minWidth: "100px" }}
                              autoFocus
                            />
                          </td>
                          <td>
                            <input
                              value={editTireCustomerForm.phone}
                              onChange={(e) => setEditTireCustomerForm({ ...editTireCustomerForm, phone: e.target.value })}
                              placeholder="مۆبایل"
                              style={{ width: "100%", minWidth: "90px" }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              value={editTireCustomerForm.initial_balance_usd}
                              onChange={(e) => setEditTireCustomerForm({ ...editTireCustomerForm, initial_balance_usd: e.target.value })}
                              placeholder="قەرزی سەرەتایی"
                              style={{ width: "100%", minWidth: "90px" }}
                            />
                          </td>
                          <td>
                            <input
                              value={editTireCustomerForm.note}
                              onChange={(e) => setEditTireCustomerForm({ ...editTireCustomerForm, note: e.target.value })}
                              placeholder="تێبینی"
                              style={{ width: "100%", minWidth: "100px" }}
                            />
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "nowrap" }}>
                              <button type="button" className="primary link" onClick={() => saveEditTireCustomer(c.id)} style={{ whiteSpace: "nowrap" }}>
                                پاشەکەوت
                              </button>
                              <button type="button" className="ghost link" onClick={cancelEditTireCustomer} style={{ whiteSpace: "nowrap" }}>
                                پاشگەزبوونەوە
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={c.id} className={String(focusedTireCustomerId) === String(c.id) ? "row-focus" : ""}>
                          <td>
                            <button type="button" className="name-link" onClick={() => setFocusedTireCustomerId(String(c.id))}>
                              {c.name}
                            </button>
                          </td>
                          <td>{c.phone}</td>
                          <td className="num debt" style={{ fontWeight: "700" }}>{fmtMoney(c.balance_usd, "usd")}</td>
                          <td className="muted">{c.note}</td>
                          <td>
                            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "nowrap" }}>
                              <button type="button" className="ghost link" onClick={() => startEditTireCustomer(c)} style={{ whiteSpace: "nowrap" }}>
                                دەستکاری
                              </button>
                              <button type="button" className="danger link" onClick={() => removeTireCustomer(c.id)} style={{ whiteSpace: "nowrap" }}>
                                سڕینەوە
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    ))}
                    {filteredTireCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
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
                  
                  <div className="card-nested" style={{ background: "var(--debt-bg)", padding: "1rem", borderRadius: "8px", margin: "0.5rem 0 1rem", border: "1px solid var(--debt-border)" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="lbl" style={{ color: "var(--text)" }}>قەرزی پێشوو:</span>
                        <strong style={{ color: "var(--text)" }}>{fmtMoney(focusedTireCustomerDetail.previous_debt_usd, "usd")}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="lbl" style={{ color: "var(--text)" }}>قەرزی ئێستا:</span>
                        <strong style={{ color: "var(--owe)", fontWeight: "700" }}>{fmtMoney(focusedTireCustomerDetail.latest_debt_usd, "usd")}</strong>
                      </div>
                      <hr style={{ border: "none", borderTop: "1px solid var(--debt-border)", margin: "0.25rem 0" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="lbl" style={{ fontWeight: "700", color: "var(--text)" }}>کۆی گشتی قەرز:</span>
                        <strong style={{ color: "var(--owe)", fontSize: "1.2rem", fontWeight: "800" }}>{fmtMoney(focusedTireCustomerDetail.balance_usd, "usd")}</strong>
                      </div>
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

                {/* کەشف حیسابی (Statement of Account) */}
                <section className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <h3>کەشف حیسابی — {focusedTireCustomerDetail.name}</h3>
                    <button type="button" className="primary" onClick={printTireCustomerStatement} style={{ minHeight: "1.8rem", padding: "0 0.75rem", fontSize: "0.85rem" }}>
                      🖨️ چاپکردن
                    </button>
                  </div>
                  
                  <div className="table-wrap" style={{ maxHeight: "350px", overflowY: "auto" }}>
                    <table className="data compact">
                      <thead>
                        <tr>
                          <th>ڕێکەوت</th>
                          <th>جۆر</th>
                          <th>وردەکاری</th>
                          <th>قەرزدارە</th>
                          <th>واسڵ</th>
                          <th>باڵانس</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tireCustomerStatement.map((item, idx) => (
                          <tr key={idx}>
                            <td>{item.date}</td>
                            <td>
                              <span style={{ 
                                display: "inline-block", 
                                padding: "0.15rem 0.45rem", 
                                borderRadius: "4px", 
                                fontSize: "0.75rem", 
                                fontWeight: "600", 
                                background: item.type === "فرۆشتن" ? "#fee2e2" : item.type === "واسڵکردن" ? "#dcfce7" : "#f1f5f9", 
                                color: item.type === "فرۆشتن" ? "#991b1b" : item.type === "واسڵکردن" ? "#166534" : "#475569" 
                              }}>
                                {item.type}
                              </span>
                            </td>
                            <td className="muted" style={{ fontSize: "0.8rem", whiteSpace: "normal", wordBreak: "break-all" }}>{item.description}</td>
                            <td className="num" style={{ color: item.debit_usd > 0 ? "var(--owe)" : "inherit" }}>
                              {item.debit_usd > 0 ? fmtMoney(item.debit_usd, "usd") : "—"}
                            </td>
                            <td className="num" style={{ color: item.credit_usd > 0 ? "var(--ok)" : "inherit" }}>
                              {item.credit_usd > 0 ? fmtMoney(item.credit_usd, "usd") : "—"}
                            </td>
                            <td className="num" style={{ fontWeight: "700", color: item.balance_usd > 0 ? "var(--owe)" : "var(--ok)" }}>
                              {fmtMoney(item.balance_usd, "usd")}
                            </td>
                          </tr>
                        ))}
                        {tireCustomerStatement.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="muted" style={{ textAlign: "center", padding: "1rem" }}>
                              هیچ مامەڵەیەک تۆمار نەکراوە.
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

      {/* ═══════ TAB: فرۆشراوەکان (Sold Items) ═══════ */}
      {tab === "tire_sold_items" ? (
        <div className="tab-panels">
          <section className="card">
            <div className="section-head">
              <h2>فرۆشراوەکان — کۆی گشتی پارەی دراو بە مخزن</h2>
              <div className="filter-row">
                <input
                  value={soldItemsSearch}
                  onChange={(e) => setSoldItemsSearch(e.target.value)}
                  placeholder="گەڕان بەپێی کڕیار یان جۆری تایە…"
                  style={{ width: "220px" }}
                />
                <label className="filter-label">
                  لە
                  <input type="date" value={soldItemsFrom} onChange={(e) => setSoldItemsFrom(e.target.value)} />
                </label>
                <label className="filter-label">
                  بۆ
                  <input type="date" value={soldItemsTo} onChange={(e) => setSoldItemsTo(e.target.value)} />
                </label>
                <button type="button" className="ghost" onClick={loadSoldItems}>
                  نوێکردنەوە
                </button>
              </div>
            </div>
          </section>

          {soldItemsLoading ? (
            <section className="card"><div className="banner">بارکردن…</div></section>
          ) : soldItems ? (
            <>
              {/* کارتەکانی کورتە */}
              <div className="report-cards">
                <div className="rpt-card rpt-expense" style={{ borderRight: "3px solid #8b5cf6" }}>
                  <span className="rpt-label" style={{ color: "#8b5cf6" }}>کۆی گشتی پارەی دراو بە مخزن</span>
                  <strong style={{ color: "#8b5cf6", fontSize: "1.3rem" }}>{fmtMoney(soldItems.total_warehouse_investment_usd, "usd")}</strong>
                  <span className="rpt-sub">ئەو پارەیەی تاکو ئێستا بۆ مخزنکردنی تایە خەرج کراوە</span>
                </div>
                <div className="rpt-card rpt-remain" style={{ borderRight: "3px solid #06b6d4" }}>
                  <span className="rpt-label" style={{ color: "#06b6d4" }}>بەهای مخزنی ئێستا (کڕین)</span>
                  <strong style={{ color: "#06b6d4" }}>{fmtMoney(soldItems.current_stock_cost_usd, "usd")}</strong>
                  <span className="rpt-sub">{soldItems.current_stock_qty} دانە لە مخزن ماوە</span>
                </div>
                <div className="rpt-card rpt-pay">
                  <span className="rpt-label">کۆی فرۆشراو</span>
                  <strong>{soldItems.total_sold_qty} دانە</strong>
                </div>
                <div className="rpt-card rpt-pay" style={{ borderRight: "3px solid #22c55e" }}>
                  <span className="rpt-label" style={{ color: "#22c55e" }}>کۆی داهات لە فرۆشتن</span>
                  <strong style={{ color: "#22c55e" }}>{fmtMoney(soldItems.total_revenue_usd, "usd")}</strong>
                </div>
                <div className="rpt-card rpt-debt">
                  <span className="rpt-label">تێچووی فرۆشراوەکان (نرخی کڕین)</span>
                  <strong>{fmtMoney(soldItems.total_cost_sold_usd, "usd")}</strong>
                </div>
                <div className="rpt-card" style={{ borderRight: `3px solid ${soldItems.total_profit_usd >= 0 ? "var(--ok)" : "var(--owe)"}`, background: soldItems.total_profit_usd >= 0 ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)" }}>
                  <span className="rpt-label" style={{ color: soldItems.total_profit_usd >= 0 ? "var(--ok)" : "var(--owe)" }}>قازانجی سافی</span>
                  <strong style={{ color: soldItems.total_profit_usd >= 0 ? "var(--ok)" : "var(--owe)", fontSize: "1.2rem" }}>{fmtMoney(soldItems.total_profit_usd, "usd")}</strong>
                  <span className="rpt-sub">داهات − نرخی کڕین</span>
                </div>
              </div>

              {/* کورتەی فرۆشراوەکان بەپێی جۆری تایە */}
              <section className="card" aria-labelledby="sold-by-tire-heading">
                <h2 id="sold-by-tire-heading">کورتەی فرۆشراوەکان بەپێی جۆری تایە</h2>
                <p className="muted" style={{ fontSize: "0.82rem", margin: "-0.5rem 0 0.75rem" }}>کلیک بکە لەسەر سەرەوەی ستوون بۆ ڕیزبەندیکردن — گرانترین یان زۆرترین لە سەرەوە</p>
                {sortedSoldByTire.length > 0 ? (
                  <div className="table-wrap">
                    <table className="data compact">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>
                            <button type="button" className="sort-btn" onClick={() => setSoldByTireSort(s => ({ key: "tire_name", dir: s.key === "tire_name" && s.dir === "asc" ? "desc" : "asc" }))}>
                              جۆری تایە {soldByTireSort.key === "tire_name" ? (soldByTireSort.dir === "asc" ? "↑" : "↓") : "⇅"}
                            </button>
                          </th>
                          <th>قەبارە</th>
                          <th>
                            <button type="button" className="sort-btn" onClick={() => setSoldByTireSort(s => ({ key: "purchase_price_usd", dir: s.key === "purchase_price_usd" && s.dir === "desc" ? "asc" : "desc" }))}>
                              نرخی کڕین {soldByTireSort.key === "purchase_price_usd" ? (soldByTireSort.dir === "asc" ? "↑" : "↓") : "⇅"}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="sort-btn" onClick={() => setSoldByTireSort(s => ({ key: "total_sold_qty", dir: s.key === "total_sold_qty" && s.dir === "desc" ? "asc" : "desc" }))}>
                              ژمارەی فرۆشراو {soldByTireSort.key === "total_sold_qty" ? (soldByTireSort.dir === "asc" ? "↑" : "↓") : "⇅"}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="sort-btn" onClick={() => setSoldByTireSort(s => ({ key: "total_cost_usd", dir: s.key === "total_cost_usd" && s.dir === "desc" ? "asc" : "desc" }))}>
                              تێچووی کڕین {soldByTireSort.key === "total_cost_usd" ? (soldByTireSort.dir === "asc" ? "↑" : "↓") : "⇅"}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="sort-btn" onClick={() => setSoldByTireSort(s => ({ key: "total_revenue_usd", dir: s.key === "total_revenue_usd" && s.dir === "desc" ? "asc" : "desc" }))}>
                              داهاتی فرۆشتن {soldByTireSort.key === "total_revenue_usd" ? (soldByTireSort.dir === "asc" ? "↑" : "↓") : "⇅"}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="sort-btn" onClick={() => setSoldByTireSort(s => ({ key: "profit", dir: s.key === "profit" && s.dir === "desc" ? "asc" : "desc" }))}>
                              قازانج {soldByTireSort.key === "profit" ? (soldByTireSort.dir === "asc" ? "↑" : "↓") : "⇅"}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedSoldByTire.map((item, idx) => (
                            <tr key={idx}>
                              <td className="muted">{idx + 1}</td>
                              <td><strong>{item.tire_name}</strong></td>
                              <td className="muted">{item.tire_size || "—"}</td>
                              <td className="num">{fmtMoney(item.purchase_price_usd, "usd")}</td>
                              <td className="num" style={{ fontWeight: "700", color: "var(--primary)" }}>{item.total_sold_qty} دانە</td>
                              <td className="num debt">{fmtMoney(item.total_cost_usd, "usd")}</td>
                              <td className="num" style={{ color: "var(--ok)" }}>{fmtMoney(item.total_revenue_usd, "usd")}</td>
                              <td className="num" style={{ fontWeight: "700", color: item.profit >= 0 ? "var(--ok)" : "var(--owe)" }}>{fmtMoney(item.profit, "usd")}</td>
                            </tr>
                        ))}
                        {/* ڕیزی کۆی گشتی */}
                        <tr style={{ background: "var(--bg)", fontWeight: "700", borderTop: "2px solid var(--border)" }}>
                          <td></td>
                          <td>کۆی گشتی</td>
                          <td></td>
                          <td></td>
                          <td className="num" style={{ color: "var(--primary)" }}>{soldByTireTotals.qty} دانە</td>
                          <td className="num debt">{fmtMoney(soldByTireTotals.cost, "usd")}</td>
                          <td className="num" style={{ color: "var(--ok)" }}>{fmtMoney(soldByTireTotals.rev, "usd")}</td>
                          <td className="num" style={{ color: soldByTireTotals.profit >= 0 ? "var(--ok)" : "var(--owe)" }}>{fmtMoney(soldByTireTotals.profit, "usd")}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted" style={{ textAlign: "center" }}>هیچ تایەیەک فرۆشراو نییە لەم بەروارەدا.</p>
                )}
              </section>

              {/* وردەکاری تەواوی فرۆشتنەکان */}
              <section className="card" aria-labelledby="sold-detail-heading">
                <h2 id="sold-detail-heading">وردەکاری هەموو فرۆشراوەکان</h2>
                {sortedSoldDetail.length > 0 ? (
                  <div className="table-wrap scroll">
                    <table className="data compact">
                      <thead>
                        <tr>
                          <th>
                            <button type="button" className="sort-btn" onClick={() => setSoldDetailSort(s => ({ key: "sale_date", dir: s.key === "sale_date" && s.dir === "desc" ? "asc" : "desc" }))}>
                              ڕێکەوت {soldDetailSort.key === "sale_date" ? (soldDetailSort.dir === "asc" ? "↑" : "↓") : "⇅"}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="sort-btn" onClick={() => setSoldDetailSort(s => ({ key: "customer_name", dir: s.key === "customer_name" && s.dir === "asc" ? "desc" : "asc" }))}>
                              کڕیار {soldDetailSort.key === "customer_name" ? (soldDetailSort.dir === "asc" ? "↑" : "↓") : "⇅"}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="sort-btn" onClick={() => setSoldDetailSort(s => ({ key: "tire_name", dir: s.key === "tire_name" && s.dir === "asc" ? "desc" : "asc" }))}>
                              جۆری تایە {soldDetailSort.key === "tire_name" ? (soldDetailSort.dir === "asc" ? "↑" : "↓") : "⇅"}
                            </button>
                          </th>
                          <th>بڕ</th>
                          <th>
                            <button type="button" className="sort-btn" onClick={() => setSoldDetailSort(s => ({ key: "purchase_price_usd", dir: s.key === "purchase_price_usd" && s.dir === "desc" ? "asc" : "desc" }))}>
                              نرخی کڕین {soldDetailSort.key === "purchase_price_usd" ? (soldDetailSort.dir === "asc" ? "↑" : "↓") : "⇅"}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="sort-btn" onClick={() => setSoldDetailSort(s => ({ key: "sale_price", dir: s.key === "sale_price" && s.dir === "desc" ? "asc" : "desc" }))}>
                              نرخی فرۆشتن {soldDetailSort.key === "sale_price" ? (soldDetailSort.dir === "asc" ? "↑" : "↓") : "⇅"}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="sort-btn" onClick={() => setSoldDetailSort(s => ({ key: "line_revenue", dir: s.key === "line_revenue" && s.dir === "desc" ? "asc" : "desc" }))}>
                              داهات {soldDetailSort.key === "line_revenue" ? (soldDetailSort.dir === "asc" ? "↑" : "↓") : "⇅"}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="sort-btn" onClick={() => setSoldDetailSort(s => ({ key: "line_cost", dir: s.key === "line_cost" && s.dir === "desc" ? "asc" : "desc" }))}>
                              تێچوو {soldDetailSort.key === "line_cost" ? (soldDetailSort.dir === "asc" ? "↑" : "↓") : "⇅"}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="sort-btn" onClick={() => setSoldDetailSort(s => ({ key: "line_profit", dir: s.key === "line_profit" && s.dir === "desc" ? "asc" : "desc" }))}>
                              قازانج {soldDetailSort.key === "line_profit" ? (soldDetailSort.dir === "asc" ? "↑" : "↓") : "⇅"}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedSoldDetail.map((d, idx) => (
                          <tr key={idx}>
                            <td>{d.sale_date}</td>
                            <td>
                              <strong>{d.customer_name}</strong>
                              <div className="muted small">{d.payment_type}</div>
                            </td>
                            <td>{d.tire_name}</td>
                            <td className="num">{d.sold_qty} دانە</td>
                            <td className="num muted">{fmtMoney(d.purchase_price_usd, "usd")}</td>
                            <td className="num">{fmtMoney(d.sale_price, "usd")}</td>
                            <td className="num" style={{ color: "var(--ok)" }}>{fmtMoney(d.line_revenue, "usd")}</td>
                            <td className="num debt">{fmtMoney(d.line_cost, "usd")}</td>
                            <td className="num" style={{ fontWeight: "600", color: d.line_profit >= 0 ? "var(--ok)" : "var(--owe)" }}>{fmtMoney(d.line_profit, "usd")}</td>
                          </tr>
                        ))}
                        {/* ڕیزی کۆی گشتی بۆ وردەکارییەکان */}
                        <tr style={{ background: "var(--bg)", fontWeight: "700", borderTop: "2px solid var(--border)" }}>
                          <td>کۆی گشتی</td>
                          <td></td>
                          <td></td>
                          <td className="num" style={{ color: "var(--primary)" }}>{soldDetailTotals.qty} دانە</td>
                          <td></td>
                          <td></td>
                          <td className="num" style={{ color: "var(--ok)" }}>{fmtMoney(soldDetailTotals.rev, "usd")}</td>
                          <td className="num debt">{fmtMoney(soldDetailTotals.cost, "usd")}</td>
                          <td className="num" style={{ color: soldDetailTotals.profit >= 0 ? "var(--ok)" : "var(--owe)" }}>{fmtMoney(soldDetailTotals.profit, "usd")}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted" style={{ textAlign: "center" }}>هیچ فرۆشتنێک تۆمار نەکراوە.</p>
                )}
              </section>
            </>
          ) : null}
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
                <div className="rpt-card rpt-expense" style={{ borderRight: "3px solid var(--owe)" }}>
                  <span className="rpt-label" style={{ color: "var(--owe)" }}>کۆی مسروفات بە دینار</span>
                  <strong style={{ color: "var(--owe)" }}>{fmtMoney(tireReport.total_expenses_iqd, "iqd")}</strong>
                </div>
              </div>

              {/* تەرازوی دارایی (Financial Balance Sheet) */}
              <section className="card" style={{ marginTop: "1.5rem" }}>
                <h3 style={{ marginBottom: "1rem", color: "var(--primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  📊 تەرازوی گشتی دارایی (Balance Sheet)
                </h3>
                <div className="report-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
                  <div className="rpt-card rpt-pay" style={{ borderRight: "3px solid #3b82f6", background: "rgba(59, 130, 246, 0.04)" }}>
                    <span className="rpt-label" style={{ color: "#3b82f6" }}>سەرمایەی گشتی (Total Capital)</span>
                    <strong style={{ color: "#3b82f6" }}>{fmtMoney((tireReport.initial_capital_usd || 0) + (tireReport.total_sales_usd || 0), "usd")}</strong>
                    <span className="rpt-sub">سەرمایەی سەرەتایی + کۆی فرۆش</span>
                  </div>
                  <div className="rpt-card rpt-remain" style={{ borderRight: "3px solid #10b981", background: "rgba(16, 185, 129, 0.04)" }}>
                    <span className="rpt-label" style={{ color: "#10b981" }}>نەقدی ماوە (Remaining Cash)</span>
                    <strong style={{ color: "#10b981" }}>{fmtMoney(tireReport.calculated_cash_usd, "usd")}</strong>
                    <span className="rpt-sub">کاش لە دەست (سەرمایە + قازانج - مخزن - قەرز)</span>
                  </div>
                  <div className="rpt-card rpt-expense" style={{ borderRight: "3px solid #f59e0b", background: "rgba(245, 158, 11, 0.04)" }}>
                    <span className="rpt-label" style={{ color: "#f59e0b" }}>بەهای مخزن (Inventory Value)</span>
                    <strong style={{ color: "#f59e0b" }}>{fmtMoney(tireReport.stock_value_purchase_usd, "usd")}</strong>
                    <span className="rpt-sub">بەهای تێچووی کڕینی کاڵاکانی مخزن</span>
                  </div>
                  <div className="rpt-card rpt-debt" style={{ borderRight: "3px solid #ef4444", background: "rgba(239, 68, 68, 0.04)" }}>
                    <span className="rpt-label" style={{ color: "#ef4444" }}>قەرزی کڕیاران (Receivable)</span>
                    <strong style={{ color: "#ef4444" }}>{fmtMoney(tireReport.outstanding_debt_usd, "usd")}</strong>
                    <span className="rpt-sub">کۆی ئەو پارەیەی لای کڕیارانە بە قەرز</span>
                  </div>
                </div>
              </section>

              {/* کۆنتڕۆڵی سەرمایە (Capital Ledger Card) */}
              <section className="card" aria-labelledby="rpt-capital-heading" style={{ marginTop: "1.5rem" }}>
                <h3 id="rpt-capital-heading" style={{ marginBottom: "1rem", color: "var(--primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  💰 بەڕێوەبردن و زیادکردنی سەرمایە (Capital Management)
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "1.5rem", alignItems: "start" }}>
                  {/* لای چەپ: فۆڕم */}
                  <div>
                    <h4 style={{ marginTop: 0, marginBottom: "0.75rem" }}>زیادکردنی سەرمایەی نوێ</h4>
                    <form className="grid-form" onSubmit={submitTireCapital} style={{ gap: "0.75rem" }}>
                      <label className="span2" style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        بڕی پارەی زیادکراو بە دۆلار ($)
                        <input
                          type="number"
                          step="any"
                          value={capitalForm.amount_usd}
                          onChange={(e) => setCapitalForm({ ...capitalForm, amount_usd: e.target.value })}
                          placeholder="0.00"
                          required
                          style={{ minHeight: "2.2rem" }}
                        />
                      </label>
                      <label className="span2" style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        ڕێکەوت
                        <input
                          type="date"
                          value={capitalForm.capital_date}
                          onChange={(e) => setCapitalForm({ ...capitalForm, capital_date: e.target.value })}
                          required
                          style={{ minHeight: "2.2rem" }}
                        />
                      </label>
                      <label className="span2" style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        تێبینی
                        <input
                          value={capitalForm.note}
                          onChange={(e) => setCapitalForm({ ...capitalForm, note: e.target.value })}
                          placeholder="ئیختیاری"
                          style={{ minHeight: "2.2rem" }}
                        />
                      </label>
                      <button type="submit" className="primary span2" style={{ minHeight: "2.2rem" }}>
                        پارە بخەرە سەر سەرمایە
                      </button>
                    </form>
                  </div>
                  {/* لای ڕاست: لیست */}
                  <div>
                    <h4 style={{ marginTop: 0, marginBottom: "0.75rem" }}>مێژووی سەرمایە زیادکراوەکان</h4>
                    <div className="table-wrap" style={{ maxHeight: "300px", overflowY: "auto" }}>
                      <table className="data compact">
                        <thead>
                          <tr>
                            <th>ڕێکەوت</th>
                            <th>بڕ ($)</th>
                            <th>تێبینی</th>
                            <th>کردار</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* تۆمارەکانی تر */}
                          {tireCapitals.map((cap) => (
                            <tr key={cap.id}>
                              <td>{cap.capital_date}</td>
                              <td className="num" style={{ color: "var(--ok)", fontWeight: "700" }}>{fmtMoney(cap.amount_usd, "usd")}</td>
                              <td className="muted">{cap.note || "—"}</td>
                              <td>
                                <button type="button" className="danger link" onClick={() => deleteTireCapital(cap.id)}>
                                  سڕینەوە
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </section>

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

              {/* بەشی باکئەپی داتابەیس بۆ بەشی تایە */}
              <section className="card card-compact" style={{ marginTop: "1.5rem" }}>
                <h3>باکئەپ و پاراستنی داتاکان (SQLite / JSON Backup)</h3>
                <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
                  لێرەوە دەتوانیت باکئەپی گشتی یان باکئەپی تایبەت بە هەر بەشێک جیا بکەیتەوە و دایبەزێنیتە سەر کۆمپیوتەرەکەت.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "600px", marginBottom: "1.25rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      type="password"
                      placeholder="تێپەڕەوشەی باکئەپ بنووسە…"
                      value={backupSecret}
                      onChange={(e) => setBackupSecret(e.target.value)}
                      style={{ flex: "1 1 200px", minHeight: "2.2rem" }}
                    />
                    {user?.role === "admin" && (
                      <button
                        type="button"
                        className="danger"
                        onClick={handleResetDatabase}
                        style={{ minHeight: "2.2rem", padding: "0 1.2rem" }}
                      >
                        ⚠️ سفرکردنەوەی گشتی
                      </button>
                    )}
                  </div>
                  
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {user?.role === "admin" && (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => handleDownloadBackup("db")}
                        style={{ minHeight: "2.2rem", flex: "1 1 150px" }}
                      >
                        💾 باکئەپی گشتی (SQLite)
                      </button>
                    )}
                    {(user?.role === "admin" || user?.role === "user") && (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => handleDownloadBackup("gazxana")}
                        style={{ minHeight: "2.2rem", flex: "1 1 150px", background: "#3b82f6" }}
                      >
                        📝 باکئەپی گازخانە (JSON)
                      </button>
                    )}
                    {(user?.role === "admin" || user?.role === "tire") && (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => handleDownloadBackup("tires")}
                        style={{ minHeight: "2.2rem", flex: "1 1 150px", background: "#8b5cf6" }}
                      >
                        🚗 باکئەپی تایە (JSON)
                      </button>
                    )}
                  </div>
                </div>
                
                <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "1rem 0" }} />
                
                <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--text)" }}>گەڕاندنەوەی داتابەیس لە باکئەپ (Restore Backup)</h4>
                <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                  {user?.role === "admin" 
                    ? "فایلی باکئەپی دابەزێنراو (`.sqlite` یان `.json`) هەڵبژێرە و تێپەڕەوشەی باکئەپەکە لە سەرەوە بنووسە بۆ گەڕاندنەوەی سەرجەم حیساباتەکانت."
                    : "فایلی باکئەپی دابەزێنراو (`.json`) هەڵبژێرە و تێپەڕەوشەی باکئەپەکە لە سەرەوە بنووسە بۆ گەڕاندنەوەی حیساباتەکانت."
                  }
                </p>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", maxWidth: "550px" }}>
                  <input
                    type="file"
                    accept={user?.role === "admin" ? ".sqlite,.json" : ".json"}
                    id="restore-file-input"
                    style={{ flex: "1 1 200px", fontSize: "0.85rem", padding: "0.35rem" }}
                  />
                  <button
                    type="button"
                    className="primary"
                    onClick={handleRestoreBackup}
                    style={{ minHeight: "2.2rem", padding: "0 1.5rem", background: "var(--accent)" }}
                  >
                    📥 گەڕاندنەوەی داتا
                  </button>
                </div>
                {backupErr ? <p style={{ color: "var(--owe)", fontSize: "0.85rem", marginTop: "0.75rem" }}>{backupErr}</p> : null}
              </section>
            </>
          ) : null}
        </div>
      ) : null}
      {/* ═══════ TAB: هەناردەی گاز ═══════ */}
      {tab === "gas_exports" ? (
        <div className="tab-panels">
          <section className="card" aria-labelledby="export-add-heading">
            <h2 id="export-add-heading">تۆمارکردنی هەناردەی تازە</h2>
            <form className="grid-form" onSubmit={async (e) => {
              e.preventDefault();
              setErr("");
              const liters = num(gasExportForm.quantity_liters);
              if (liters <= 0) { setErr("بڕی لیتر پێویستە"); return; }
              try {
                const r = await fetch(`${API}/exports`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...gasExportForm,
                    quantity_liters: liters,
                    cost_price_per_barrel_usd: 0,
                    cost_price_per_barrel_iqd: num(gasExportForm.cost_price_per_barrel_iqd),
                    sell_price_per_barrel_usd: 0,
                    sell_price_per_barrel_iqd: num(gasExportForm.sell_price_per_barrel_iqd),
                  }),
                });
                const raw = await r.text();
                if (!r.ok) { setErr(parseJsonFromText(raw)?.error || "هەڵەیەک ڕوویدا"); return; }
                setGasExportForm({
                  receiver_name: "", quantity_liters: "", cost_price_per_barrel_usd: "", cost_price_per_barrel_iqd: "",
                  status: "لە فرۆشتندایە", sell_price_per_barrel_usd: "", sell_price_per_barrel_iqd: "",
                  export_date: today, note: ""
                });
                setInfoMsg("هەناردە بە سەرکەوتوویی تۆمار کرا ✅");
                setTimeout(() => setInfoMsg(""), 3000);
                loadGasExports();
              } catch (ex) { setErr(String(ex?.message || ex)); }
            }}>
              <label>
                ناوی وەرگر
                <input value={gasExportForm.receiver_name} onChange={e => setGasExportForm(f => ({ ...f, receiver_name: e.target.value }))} placeholder="ناوی وەرگر" required />
              </label>
              <label>
                بڕ بە لیتر
                <input type="number" value={gasExportForm.quantity_liters} onChange={e => setGasExportForm(f => ({ ...f, quantity_liters: e.target.value }))} placeholder="20000" min="1" required />
              </label>
              <label>
                بەرمیل (ئۆتۆماتیک ÷ ٢٢٠)
                <input type="text" readOnly value={num(gasExportForm.quantity_liters) > 0 ? (num(gasExportForm.quantity_liters) / 220).toFixed(2) : "—"} className="computed-field" />
              </label>
              <label>
                نرخی کڕین / بەرمیل (د.ع)
                <input type="number" step="any" value={gasExportForm.cost_price_per_barrel_iqd} onChange={e => setGasExportForm(f => ({ ...f, cost_price_per_barrel_iqd: e.target.value }))} placeholder="0" />
              </label>
              <label>
                ڕێکەوت
                <input type="date" value={gasExportForm.export_date} onChange={e => setGasExportForm(f => ({ ...f, export_date: e.target.value }))} required />
              </label>
              <label>
                بارودۆخ
                <select value={gasExportForm.status} onChange={e => setGasExportForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="فرۆشرا">فرۆشرا</option>
                  <option value="لە فرۆشتندایە">لە فرۆشتندایە</option>
                  <option value="حەمبار کراوە">حەمبار کراوە</option>
                </select>
              </label>
              {gasExportForm.status === "فرۆشرا" && (
                <label>
                  نرخی فرۆشتن / بەرمیل (د.ع)
                  <input type="number" step="any" value={gasExportForm.sell_price_per_barrel_iqd} onChange={e => setGasExportForm(f => ({ ...f, sell_price_per_barrel_iqd: e.target.value }))} placeholder="0" />
                </label>
              )}
              {gasExportForm.status === "فرۆشرا" && num(gasExportForm.quantity_liters) > 0 && num(gasExportForm.sell_price_per_barrel_iqd) > 0 && (
                <div className="profit-preview span2">
                  <strong>پێشبینی قازانج:</strong>
                  <span> {fmtMoney(((num(gasExportForm.quantity_liters) / 220) * num(gasExportForm.sell_price_per_barrel_iqd)) - ((num(gasExportForm.quantity_liters) / 220) * num(gasExportForm.cost_price_per_barrel_iqd)), "iqd")}</span>
                </div>
              )}
              <label className="span2">
                تێبینی
                <input value={gasExportForm.note} onChange={e => setGasExportForm(f => ({ ...f, note: e.target.value }))} placeholder="تێبینی (ئارەزوومەندانە)" />
              </label>
              <button type="submit" className="primary span2">تۆمارکردن</button>
            </form>
          </section>

          <section className="card" aria-labelledby="export-list-heading">
            <div className="section-head">
              <h2 id="export-list-heading">لیستی هەناردەکان</h2>
              <div className="filter-row">
                <input type="text" placeholder="گەڕان بە ناو..." value={exportSearch} onChange={e => setExportSearch(e.target.value)} style={{ maxWidth: 200 }} />
                <select value={exportFilterStatus} onChange={e => { setExportFilterStatus(e.target.value); }} style={{ maxWidth: 160 }}>
                  <option value="">هەموو بارودۆخەکان</option>
                  <option value="فرۆشرا">فرۆشرا</option>
                  <option value="لە فرۆشتندایە">لە فرۆشتندایە</option>
                  <option value="حەمبار کراوە">حەمبار کراوە</option>
                </select>
                <label>لە <input type="date" value={exportFilterFrom} onChange={e => setExportFilterFrom(e.target.value)} /></label>
                <label>بۆ <input type="date" value={exportFilterTo} onChange={e => setExportFilterTo(e.target.value)} /></label>
                <button type="button" onClick={() => { setExportFilterFrom(""); setExportFilterTo(""); setExportFilterStatus(""); setExportSearch(""); }}>سڕینەوەی فلتەر</button>
              </div>
            </div>
            {exportsLoading ? <p className="muted">بارکردن...</p> : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th><th>وەرگر</th><th>لیتر</th><th>بەرمیل</th>
                      <th>نرخی کڕین (د.ع)</th>
                      <th>بارودۆخ</th>
                      <th>نرخی فرۆشتن (د.ع)</th>
                      <th>قازانج (د.ع)</th>
                      <th>ڕێکەوت</th><th>تێبینی</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {gasExports
                      .filter(e => !exportSearch || e.receiver_name?.toLowerCase().includes(exportSearch.toLowerCase()))
                      .map((ex, i) => (
                      <tr key={ex.id}>
                        <td>{i + 1}</td>
                        <td><strong>{ex.receiver_name}</strong></td>
                        <td>{Number(ex.quantity_liters).toLocaleString()}</td>
                        <td>{Number(ex.barrels).toFixed(2)}</td>
                        <td>{ex.cost_price_per_barrel_iqd > 0 ? fmtMoney(ex.cost_price_per_barrel_iqd, "iqd") : "—"}</td>
                        <td>
                          <span className={`export-status status-${ex.status === "فرۆشرا" ? "sold" : ex.status === "لە فرۆشتندایە" ? "progress" : "stored"}`}>
                            {ex.status}
                          </span>
                        </td>
                        <td>{ex.status === "فرۆشرا" && ex.sell_price_per_barrel_iqd > 0 ? fmtMoney(ex.sell_price_per_barrel_iqd, "iqd") : "—"}</td>
                        <td>{ex.status === "فرۆشرا" && ex.total_profit_iqd !== 0 ? <span className={ex.total_profit_iqd >= 0 ? "profit-pos" : "profit-neg"}>{fmtMoney(ex.total_profit_iqd, "iqd")}</span> : "—"}</td>
                        <td>{ex.export_date}</td>
                        <td className="muted" style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{ex.note || ""}</td>
                        <td>
                          {ex.status === "لە فرۆشتندایە" && (
                            exportSellForm.id === ex.id ? (
                              <div className="inline-sell-form" style={{ display: "inline-flex", gap: "4px", marginEnd: "10px" }}>
                                <input type="number" step="any" placeholder="فرۆشتن (د.ع)" value={exportSellForm.sell_price_per_barrel_iqd} onChange={e => setExportSellForm(f => ({ ...f, sell_price_per_barrel_iqd: e.target.value }))} style={{ width: 100, padding: "2px 5px", fontSize: "0.85rem" }} />
                                <button type="button" className="primary compact" onClick={async () => {
                                  setErr("");
                                  if (num(exportSellForm.sell_price_per_barrel_iqd) <= 0) {
                                    alert("پێویستە نرخێک دیاری بکەیت"); return;
                                  }
                                  const r = await fetch(`${API}/exports/${ex.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      status: "فرۆشرا",
                                      sell_price_per_barrel_usd: 0,
                                      sell_price_per_barrel_iqd: num(exportSellForm.sell_price_per_barrel_iqd),
                                    }),
                                  });
                                  if (r.ok) {
                                    setExportSellForm({ id: null, sell_price_per_barrel_usd: "", sell_price_per_barrel_iqd: "" });
                                    setInfoMsg("بە سەرکەوتوویی فرۆشرا ✅");
                                    setTimeout(() => setInfoMsg(""), 3000);
                                    loadGasExports();
                                  } else {
                                    const raw = await r.text();
                                    setErr(parseJsonFromText(raw)?.error || "فرۆشتن سەرنەکەوت");
                                  }
                                }} style={{ padding: "2px 8px", fontSize: "0.85rem" }}>فرۆشتن</button>
                                <button type="button" className="ghost compact" onClick={() => setExportSellForm({ id: null, sell_price_per_barrel_usd: "", sell_price_per_barrel_iqd: "" })} style={{ padding: "2px 5px", fontSize: "0.85rem" }}>پاشگەزبوونەوە</button>
                              </div>
                            ) : (
                              <>
                                <button type="button" className="primary compact link" onClick={() => setExportSellForm({ id: ex.id, sell_price_per_barrel_usd: "", sell_price_per_barrel_iqd: "" })} style={{ marginEnd: "10px", color: "var(--ok)", fontWeight: "bold" }}>فرۆشتن</button>
                                <button type="button" className="primary compact link" onClick={async () => {
                                  if (!confirm("ئایا دڵنیایت لە ناردنی ئەم هەناردەیە بۆ حەمبار؟")) return;
                                  const r = await fetch(`${API}/exports/${ex.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ status: "حەمبار کراوە" }),
                                  });
                                  if (r.ok) {
                                    setInfoMsg("بە سەرکەوتوویی گوازرایەوە بۆ حەمبار ✅");
                                    setTimeout(() => setInfoMsg(""), 3000);
                                    loadGasExports();
                                  } else {
                                    const raw = await r.text();
                                    setErr(parseJsonFromText(raw)?.error || "گواستنەوە سەرنەکەوت");
                                  }
                                }} style={{ marginEnd: "10px", color: "var(--accent)", fontWeight: "bold" }}>حەمبار کردن</button>
                              </>
                            )
                          )}
                          <button type="button" className="danger link" onClick={async () => {
                            if (!confirm("ئایا دڵنیایت لە سڕینەوەی ئەم هەناردەیە؟")) return;
                            const r = await fetch(`${API}/exports/${ex.id}`, { method: "DELETE" });
                            if (r.ok) loadGasExports();
                            else setErr("سڕینەوە سەرنەکەوت");
                          }}>سڕینەوە</button>
                        </td>
                      </tr>
                    ))}
                    {gasExports.length === 0 && (
                      <tr><td colSpan={14} className="muted" style={{ textAlign: "center", padding: "2rem" }}>هیچ هەناردەیەک نەدۆزرایەوە.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {/* ═══════ TAB: حەمباری گاز ═══════ */}
      {tab === "gas_storage" ? (
        <div className="tab-panels">
          {gasStorageSummary && (
            <div className="summary-cards export-summary">
              <div className="s-card s-card-blue">
                <span className="s-label">ئامانجی بەردەست</span>
                <span className="s-val">{Number(gasStorageSummary.total_barrels).toFixed(2)} بەرمیل</span>
                <span className="s-sub">{Number(gasStorageSummary.total_liters).toLocaleString()} لیتر</span>
              </div>
              <div className="s-card s-card-amber">
                <span className="s-label">نرخی مخزن (د.ع)</span>
                <span className="s-val">{fmtMoney(gasStorageSummary.total_cost_iqd, "iqd")}</span>
              </div>
              <div className="s-card s-card-green">
                <span className="s-label">قازانجی فرۆشراو (د.ع)</span>
                <span className="s-val">{fmtMoney(gasStorageSummary.sold_profit_iqd, "iqd")}</span>
              </div>
              <div className="s-card">
                <span className="s-label">ئامانج / فرۆشراو</span>
                <span className="s-val">{gasStorageSummary.available_count} / {gasStorageSummary.sold_count}</span>
              </div>
            </div>
          )}
          <section className="card" aria-labelledby="storage-heading">
            <h2 id="storage-heading">حەمباری گاز</h2>
            {storageLoading ? <p className="muted">بارکردن...</p> : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th><th>وەرگر</th><th>لیتر</th><th>بەرمیل</th>
                      <th>نرخی کڕین (د.ع)</th>
                      <th>بارودۆخ</th>
                      <th>نرخی فرۆشتن (د.ع)</th>
                      <th>قازانج (د.ع)</th>
                      <th>کاری حەمبار</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {gasStorage.map((s, i) => (
                      <tr key={s.id}>
                        <td>{i + 1}</td>
                        <td><strong>{s.receiver_name}</strong></td>
                        <td>{Number(s.quantity_liters).toLocaleString()}</td>
                        <td>{Number(s.barrels).toFixed(2)}</td>
                        <td>{s.cost_price_per_barrel_iqd > 0 ? fmtMoney(s.cost_price_per_barrel_iqd, "iqd") : "—"}</td>
                        <td>
                          <span className={`export-status status-${s.status === "فرۆشرا" ? "sold" : "stored"}`}>
                            {s.status}
                          </span>
                        </td>
                        <td>{s.status === "فرۆشرا" && s.sell_price_per_barrel_iqd > 0 ? fmtMoney(s.sell_price_per_barrel_iqd, "iqd") : "—"}</td>
                        <td>{s.status === "فرۆشرا" && s.total_profit_iqd !== 0 ? <span className={s.total_profit_iqd >= 0 ? "profit-pos" : "profit-neg"}>{fmtMoney(s.total_profit_iqd, "iqd")}</span> : "—"}</td>
                        <td>
                          {s.status === "هەمبار" ? (
                            storageSellForm.id === s.id ? (
                              <div className="inline-sell-form">
                                <input type="number" step="any" placeholder="نرخی فرۆشتن (د.ع)" value={storageSellForm.sell_price_per_barrel_iqd} onChange={e => setStorageSellForm(f => ({ ...f, sell_price_per_barrel_iqd: e.target.value }))} style={{ width: 120 }} />
                                <button type="button" className="primary" onClick={async () => {
                                  setErr("");
                                  if (num(storageSellForm.sell_price_per_barrel_iqd) <= 0) {
                                    setErr("نرخی فرۆشتن پێویستە"); return;
                                  }
                                  const r = await fetch(`${API}/gas-storage/${s.id}/sell`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      sell_price_per_barrel_usd: 0,
                                      sell_price_per_barrel_iqd: num(storageSellForm.sell_price_per_barrel_iqd),
                                    }),
                                  });
                                  if (r.ok) {
                                    setStorageSellForm({ id: null, sell_price_per_barrel_usd: "", sell_price_per_barrel_iqd: "" });
                                    setInfoMsg("بە سەرکەوتوویی فرۆشرا لە حەمبارەوە ✅");
                                    setTimeout(() => setInfoMsg(""), 3000);
                                    loadGasStorage();
                                  } else {
                                    const raw = await r.text();
                                    setErr(parseJsonFromText(raw)?.error || "فرۆشتن سەرنەکەوت");
                                  }
                                }}>فرۆشتن</button>
                                <button type="button" onClick={() => setStorageSellForm({ id: null, sell_price_per_barrel_usd: "", sell_price_per_barrel_iqd: "" })}>پاشگەزبوونەوە</button>
                              </div>
                            ) : (
                              <button type="button" className="primary" onClick={() => setStorageSellForm({ id: s.id, sell_price_per_barrel_usd: "", sell_price_per_barrel_iqd: "" })}>
                                فرۆشتن لە حەمبارەوە
                              </button>
                            )
                          ) : (
                            <span className="muted" style={{ fontSize: "0.8rem" }}>فرۆشراوە</span>
                          )}
                        </td>
                        <td>{s.sold_at ? s.sold_at.slice(0, 10) : ""}</td>
                      </tr>
                    ))}
                    {gasStorage.length === 0 && (
                      <tr><td colSpan={13} className="muted" style={{ textAlign: "center", padding: "2rem" }}>حەمبار بەتاڵە — هیچ تۆمارێک نییە.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {/* ═══════ TAB: ڕاپۆرتی هەناردە ═══════ */}
      {tab === "export_reports" ? (
        <div className="tab-panels">
          <section className="card" aria-labelledby="export-report-heading">
            <div className="section-head">
              <h2 id="export-report-heading">ڕاپۆرتی هەناردە</h2>
              <div className="filter-row">
                <label>لە <input type="date" value={exportReportFrom} onChange={e => setExportReportFrom(e.target.value)} /></label>
                <label>بۆ <input type="date" value={exportReportTo} onChange={e => setExportReportTo(e.target.value)} /></label>
                <button type="button" onClick={() => { setExportReportFrom(""); setExportReportTo(""); }}>سڕینەوەی فلتەر</button>
              </div>
            </div>
            {exportReportLoading ? <p className="muted">بارکردن...</p> : exportReport && (
              <>
                <div className="summary-cards export-summary">
                  <div className="s-card s-card-blue">
                    <span className="s-label">کۆی هەناردەکان</span>
                    <span className="s-val">{exportReport.total_count}</span>
                    <span className="s-sub">{Number(exportReport.total_barrels).toFixed(1)} بەرمیل | {Number(exportReport.total_liters).toLocaleString()} لیتر</span>
                  </div>
                  <div className="s-card s-card-green">
                    <span className="s-label">کۆی قازانج (هەناردە)</span>
                    <span className="s-val">{fmtMoney(exportReport.total_profit_iqd, "iqd")}</span>
                  </div>
                  <div className="s-card s-card-teal">
                    <span className="s-label">قازانجی حەمبار</span>
                    <span className="s-val">{fmtMoney(exportReport.storage_profit_iqd, "iqd")}</span>
                  </div>
                  <div className="s-card s-card-purple">
                    <span className="s-label">کۆی گشتی قازانج</span>
                    <span className="s-val">{fmtMoney(exportReport.grand_total_profit_iqd, "iqd")}</span>
                  </div>
                </div>

                <div className="summary-cards export-summary" style={{ marginTop: "1rem" }}>
                  <div className="s-card">
                    <span className="s-label">فرۆشراو</span>
                    <span className="s-val">{exportReport.sold_count}</span>
                  </div>
                  <div className="s-card">
                    <span className="s-label">لە فرۆشتندایە</span>
                    <span className="s-val">{exportReport.in_progress_count}</span>
                  </div>
                  <div className="s-card">
                    <span className="s-label">حەمبار کراوە</span>
                    <span className="s-val">{exportReport.stored_count}</span>
                  </div>
                  <div className="s-card s-card-amber">
                    <span className="s-label">ئامانجی بەردەست لە حەمبار</span>
                    <span className="s-val">{Number(exportReport.available_barrels).toFixed(1)} بەرمیل</span>
                    <span className="s-sub">{fmtMoney(exportReport.available_cost_iqd, "iqd")}</span>
                  </div>
                </div>

                <div className="summary-cards export-summary" style={{ marginTop: "1rem" }}>
                  <div className="s-card">
                    <span className="s-label">کۆی تێچوو (د.ع)</span>
                    <span className="s-val">{fmtMoney(exportReport.total_cost_iqd, "iqd")}</span>
                  </div>
                  <div className="s-card">
                    <span className="s-label">کۆی داهات (د.ع)</span>
                    <span className="s-val">{fmtMoney(exportReport.total_revenue_iqd, "iqd")}</span>
                  </div>
                  <div className="s-card">
                    <span className="s-label">داهاتی حەمبار (د.ع)</span>
                    <span className="s-val">{fmtMoney(exportReport.storage_revenue_iqd, "iqd")}</span>
                  </div>
                </div>

                {exportReport.top_receivers?.length > 0 && (
                  <div style={{ marginTop: "1.5rem" }}>
                    <h3>سەرەکیترین وەرگرەکان</h3>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>وەرگر</th><th>بەرمیل</th>
                            <th>تێچوو (د.ع)</th>
                            <th>داهات (د.ع)</th>
                            <th>قازانج (د.ع)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exportReport.top_receivers.map(r => (
                            <tr key={r.receiver_name}>
                              <td><strong>{r.receiver_name}</strong></td>
                              <td>{Number(r.total_barrels).toFixed(1)}</td>
                              <td>{r.total_cost_iqd > 0 ? fmtMoney(r.total_cost_iqd, "iqd") : "—"}</td>
                              <td>{r.total_revenue_iqd > 0 ? fmtMoney(r.total_revenue_iqd, "iqd") : "—"}</td>
                              <td>{r.total_profit_iqd !== 0 ? <span className={r.total_profit_iqd >= 0 ? "profit-pos" : "profit-neg"}>{fmtMoney(r.total_profit_iqd, "iqd")}</span> : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      ) : null}

      {/* ═══════ TAB: بەڕێوەبردنی بەکارهێنەران (تەنها ئادمین) ═══════ */}
      {tab === "users" && user?.role === "admin" ? (
        <div className="tab-panels">
          <section className="card" aria-labelledby="users-heading">
            <div className="section-head">
              <h2 id="users-heading">بەڕێوەبردنی بەکارهێنەران</h2>
              <div className="filter-row">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setShowAddUserForm(!showAddUserForm);
                    setNewUserForm({ username: "", password: "", displayName: "", role: "user" });
                    setUsersErr("");
                  }}
                >
                  {showAddUserForm ? "داخستنی فۆرم" : "➕ زیادکردنی بەکارهێنەر"}
                </button>
                <button type="button" className="ghost" onClick={loadManagedUsers}>
                  نوێکردنەوە
                </button>
              </div>
            </div>

            {usersErr ? <div className="banner err">{usersErr}</div> : null}
            {usersInfo ? <div className="banner ok">{usersInfo}</div> : null}

            {showAddUserForm ? (
              <div className="card-nested user-add-form">
                <h4 style={{ marginTop: 0, marginBottom: "1rem" }}>➕ زیادکردنی بەکارهێنەری نوێ</h4>
                <form onSubmit={addManagedUser} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", alignItems: "end" }}>
                  <label style={{ display: "flex", flexDirection: "column", fontSize: "0.85rem", gap: "0.25rem", color: "var(--text)" }}>
                    ناوی بەکارهێنەر
                    <input
                      value={newUserForm.username}
                      onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                      placeholder="بۆ نموونە: ali"
                      required
                      autoComplete="off"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", fontSize: "0.85rem", gap: "0.25rem", color: "var(--text)" }}>
                    وشەی نهێنی
                    <input
                      type="password"
                      value={newUserForm.password}
                      onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                      placeholder="وشەی نهێنی بنووسە"
                      required
                      autoComplete="new-password"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", fontSize: "0.85rem", gap: "0.25rem", color: "var(--text)" }}>
                    ناوی نیشاندان
                    <input
                      value={newUserForm.displayName}
                      onChange={(e) => setNewUserForm({ ...newUserForm, displayName: e.target.value })}
                      placeholder="بۆ نموونە: عەلی ئەحمەد"
                      required
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", fontSize: "0.85rem", gap: "0.25rem", color: "var(--text)" }}>
                    ڕۆڵ
                    <select
                      value={newUserForm.role}
                      onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                    >
                      <option value="admin">ئادمین (هەموو بەشەکان)</option>
                      <option value="user">بەکارهێنەر (مامەڵەکان)</option>
                      <option value="tire">بەکارهێنەر (تایە)</option>
                    </select>
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="submit" className="primary" style={{ minHeight: "2.2rem", flex: 1 }}>
                      پاشەکەوتکردن
                    </button>
                    <button type="button" className="ghost" style={{ minHeight: "2.2rem" }} onClick={() => {
                      setShowAddUserForm(false);
                      setNewUserForm({ username: "", password: "", displayName: "", role: "user" });
                      setUsersErr("");
                    }}>
                      پاشگەزبوونەوە
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            <div className="table-wrap" style={{ marginTop: "1rem" }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>ناوی بەکارهێنەر</th>
                    <th>ناوی نیشاندان</th>
                    <th>ڕۆڵ</th>
                    <th>جۆر</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {managedUsers.map((u) => (
                    <tr key={u.username}>
                      <td><strong>{u.username}</strong></td>
                      <td>{u.displayName}</td>
                      <td>
                        <span className={`role-badge role-${u.role}`}>
                          {u.role === "admin" ? "ئادمین" : u.role === "user" ? "مامەڵەکان" : "تایە"}
                        </span>
                      </td>
                      <td>
                        <span className={`system-badge ${u.isSystem ? "system" : "custom"}`}>
                          {u.isSystem ? "سیستەمی" : "داتابەیسی"}
                        </span>
                      </td>
                      <td>
                        {!u.isSystem ? (
                          <button type="button" className="danger link" onClick={() => deleteManagedUser(u.username)}>
                            سڕینەوە
                          </button>
                        ) : (
                          <span className="muted" style={{ fontSize: "0.78rem" }}>ناسڕدرێتەوە</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {managedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                        هیچ بەکارهێنەرێک نەدۆزرایەوە.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {/* یارمەتی ڕۆڵەکان */}
          <section className="card" style={{ background: "var(--bg)", borderStyle: "dashed" }}>
            <h3 style={{ margin: "0 0 0.75rem" }}>ڕێنمایی ڕۆڵەکان</h3>
            <div className="roles-guide">
              <div className="role-guide-item">
                <span className="role-badge role-admin">ئادمین</span>
                <span>هەموو بەشەکان دەبینێت و دەتوانێت بەکارهێنەر زیاد بکات و بسڕێتەوە</span>
              </div>
              <div className="role-guide-item">
                <span className="role-badge role-user">مامەڵەکان</span>
                <span>مامەڵەی ڕۆژانە، قەرزداران، مسروفات، ڕاپۆرت</span>
              </div>
              <div className="role-guide-item">
                <span className="role-badge role-tire">تایە</span>
                <span>مخزنی تایە، فرۆشتنی تایە، قەرزدارانی تایە، ڕاپۆرتی تایە</span>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
