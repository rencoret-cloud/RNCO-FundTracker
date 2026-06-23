import { useState, useEffect, useMemo, Fragment } from "react";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, GitCompareArrows, PieChart, X, Plus } from "lucide-react";

// ---------------------------------------------------------------------------
// Live data comes from data/funds.json, a plain static file in this same
// site, refreshed once a day by the GitHub Actions workflow
// (.github/workflows/update-data.yml) which pulls from the public Fintual
// API (CMF-sourced). No backend, no Firebase, no Blaze required — just a
// scheduled GitHub job that overwrites this JSON and GitHub Pages
// auto-republishing on every commit.
// ---------------------------------------------------------------------------
async function fetchLiveData() {
  const res = await fetch("./data/funds.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const out = {};
  Object.entries(json).forEach(([fundId, val]) => {
    if (fundId.startsWith("__")) return;
    if (Array.isArray(val?.series) && val.series.length) out[fundId] = val.series;
  });
  return out;
}


// ---------------------------------------------------------------------------
// FUND LIST — placeholder daily valor-cuota series per fund, plus a sample
// portfolio composition (asset allocation + top holdings) per fund.
// Replace generateSampleSeries()/generateComposition() with real CMF /
// manager data later (this mirrors the style of topfunds.cl).
// risk: 1 (very conservative) .. 5 (aggressive) — drives sample composition.
// ---------------------------------------------------------------------------
const FUND_DEFS = [
  { id: "lv-agresiva", name: "Cuenta Activa Agresiva", manager: "LarrainVial", serie: "A", seed: 42, drift: 0.00035, vol: 0.0060, risk: 5, live: true },
  { id: "santander-pb-agresivo", name: "Private Banking Agresivo (Global)", manager: "Santander", serie: "—", seed: 17, drift: 0.00032, vol: 0.0065, risk: 5, live: true },
  { id: "bfg-global-dynamic", name: "Global Dynamic Equity Fund", manager: "BFG", serie: "C", seed: 88, drift: 0.00030, vol: 0.0070, risk: 5, live: false },
  { id: "lv-moderada", name: "Cuenta Activa Moderada", manager: "LarrainVial", serie: "A", seed: 5, drift: 0.00022, vol: 0.0040, risk: 3, live: true },
  { id: "jpm-global-income", name: "Global Income", manager: "JPMorgan", serie: "A", seed: 61, drift: 0.00018, vol: 0.0030, risk: 2, live: false },
  { id: "itau-dinamico", name: "Dinámico", manager: "Itaú", serie: "Simple", seed: 23, drift: 0.00026, vol: 0.0050, risk: 3, live: true },
  { id: "lv-conservadora", name: "Cuenta Activa Conservadora", manager: "LarrainVial", serie: "A", seed: 9, drift: 0.00014, vol: 0.0018, risk: 2, live: true },
  { id: "lv-ahorro-capital-a", name: "Ahorro Capital", manager: "LarrainVial", serie: "A", seed: 31, drift: 0.00010, vol: 0.0010, risk: 1, live: true },
  { id: "santander-go-ejecutiva", name: "GO Acciones Globales ESG", manager: "Santander", serie: "Ejecutiva", seed: 74, drift: 0.00029, vol: 0.0062, risk: 5, live: true },
  { id: "itau-gestionado-agresivo-f1", name: "Gestionado Agresivo", manager: "Itaú", serie: "F1", seed: 50, drift: 0.00033, vol: 0.0068, risk: 5, live: true },
  { id: "banchile-horizonte", name: "Horizonte", manager: "Banchile", serie: "L", seed: 12, drift: 0.00024, vol: 0.0045, risk: 3, live: true },
  { id: "santander-go-inversionista", name: "GO Acciones Globales ESG", manager: "Santander", serie: "Inversionista", seed: 67, drift: 0.00028, vol: 0.0061, risk: 5, live: true },
  // ---- Nuevos solicitados ----
  { id: "santander-renta-largo-plazo", name: "Renta Largo Plazo", manager: "Santander", serie: "Universal", seed: 91, drift: 0.00015, vol: 0.0022, risk: 2, live: true },
  { id: "lv-agresiva-q", name: "Cuenta Activa Agresiva", manager: "LarrainVial", serie: "Q", seed: 43, drift: 0.00035, vol: 0.0060, risk: 5, live: true },
  { id: "lv-conservadora-q", name: "Cuenta Activa Conservadora", manager: "LarrainVial", serie: "Q", seed: 10, drift: 0.00014, vol: 0.0018, risk: 2, live: true },
  { id: "lv-ahorro-capital-f", name: "Ahorro Capital", manager: "LarrainVial", serie: "F", seed: 32, drift: 0.00010, vol: 0.0010, risk: 1, live: true },
  { id: "itau-gestionado-moderado-f3", name: "Gestionado Moderado", manager: "Itaú", serie: "F3", seed: 51, drift: 0.00022, vol: 0.0040, risk: 3, live: false },
  { id: "itau-gestionado-moderado-f1", name: "Gestionado Moderado", manager: "Itaú", serie: "F1", seed: 52, drift: 0.00022, vol: 0.0040, risk: 3, live: false },
  { id: "itau-gestionado-conservador-f1", name: "Gestionado Conservador", manager: "Itaú", serie: "F1", seed: 53, drift: 0.00014, vol: 0.0018, risk: 2, live: false },
  { id: "itau-gestionado-agresivo-f2", name: "Gestionado Agresivo", manager: "Itaú", serie: "F2", seed: 54, drift: 0.00033, vol: 0.0068, risk: 5, live: false },
  { id: "itau-gestionado-conservador-f2", name: "Gestionado Conservador", manager: "Itaú", serie: "F2", seed: 55, drift: 0.00014, vol: 0.0018, risk: 2, live: false },
  { id: "bfg-fixed-income-global-a", name: "Fixed Income Global Opportunities Fund", manager: "BFG", serie: "A", seed: 89, drift: 0.00016, vol: 0.0025, risk: 2, live: false },
  { id: "bfg-fixed-income-global-c", name: "Fixed Income Global Opportunities Fund", manager: "BFG", serie: "C", seed: 90, drift: 0.00016, vol: 0.0025, risk: 2, live: false },
];

const CATEGORY_LABELS = {
  rvIntl: "Renta Variable Internacional",
  rvLocal: "Renta Variable Local",
  rfIntl: "Renta Fija Internacional",
  rfLocal: "Renta Fija Local",
  caja: "Caja / Otros",
};
const CATEGORY_COLORS = {
  rvIntl: "#d4a843",
  rvLocal: "#6fcf97",
  rfIntl: "#5b8def",
  rfLocal: "#9b8cf0",
  caja: "#5c6573",
};
const HOLDING_POOLS = {
  rvIntl: ["Apple Inc.", "Microsoft Corp.", "NVIDIA Corp.", "Amazon.com Inc.", "Alphabet Inc.", "iShares MSCI World ETF", "Vanguard S&P 500 ETF"],
  rvLocal: ["Banco de Chile", "SQM-B", "Falabella", "Copec", "Cencosud", "Banco Santander Chile"],
  rfIntl: ["US Treasury Bond 10Y", "iShares Core US Aggregate Bond ETF", "Bonos Corporativos Grado Inversión USD", "Deuda Emergente Diversificada"],
  rfLocal: ["Bono Tesorería Chile (BTU)", "Bono Bancario Local", "Depósito a Plazo Local", "Bono Corporativo Local AA"],
  caja: ["Caja y equivalentes"],
};
const RISK_BASE = {
  1: { rvIntl: 2, rvLocal: 3, rfIntl: 25, rfLocal: 55, caja: 15 },
  2: { rvIntl: 10, rvLocal: 10, rfIntl: 30, rfLocal: 40, caja: 10 },
  3: { rvIntl: 30, rvLocal: 25, rfIntl: 20, rfLocal: 20, caja: 5 },
  4: { rvIntl: 50, rvLocal: 25, rfIntl: 10, rfLocal: 10, caja: 5 },
  5: { rvIntl: 75, rvLocal: 15, rfIntl: 5, rfLocal: 3, caja: 2 },
};

function makeRand(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateComposition(seed, risk) {
  const rand = makeRand(seed);
  const base = RISK_BASE[risk] || RISK_BASE[3];
  const cats = Object.entries(base).map(([k, v]) => [k, Math.max(0.5, v + (rand() - 0.5) * 6)]);
  const total = cats.reduce((a, [, v]) => a + v, 0);
  const allocation = cats.map(([k, v]) => ({ key: k, label: CATEGORY_LABELS[k], color: CATEGORY_COLORS[k], pct: Math.round((v / total) * 1000) / 10 }));
  const sorted = [...allocation].sort((a, b) => b.pct - a.pct);
  const holdings = [];
  sorted.slice(0, 3).forEach((cat, idx) => {
    const pool = HOLDING_POOLS[cat.key];
    const count = idx === 0 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const name = pool[Math.floor(rand() * pool.length)];
      if (holdings.find((h) => h.name === name)) continue;
      const frac = idx === 0 ? (i === 0 ? 0.4 : 0.22) : 0.3;
      const pct = Math.round(cat.pct * frac * 10) / 10;
      if (pct > 0.1) holdings.push({ name, pct, category: cat.label, color: cat.color });
    }
  });
  holdings.sort((a, b) => b.pct - a.pct);
  return { allocation, holdings };
}

function generateSampleSeries({ seed, drift, vol }) {
  const days = 365 * 3 + 60;
  const start = new Date();
  start.setDate(start.getDate() - days);
  let value = 1000;
  const rand = makeRand(seed);
  const out = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const cyclical = Math.sin(i / 95 + seed) * 0.0009;
    const shock = (rand() - 0.5) * vol;
    value = value * (1 + drift + cyclical + shock);
    out.push({ date: d.toISOString().slice(0, 10), value: Math.round(value * 100) / 100 });
  }
  return out;
}

const FUNDS_BASE = FUND_DEFS.map((f) => ({
  ...f,
  sampleSeries: generateSampleSeries(f),
  composition: generateComposition(f.seed + 1, f.risk),
}));

const PERIODS = [
  { key: "1D", label: "Diario", days: 1 },
  { key: "1W", label: "Semanal", days: 7 },
  { key: "1M", label: "Mensual", days: 30 },
  { key: "3M", label: "Trimestral", days: 91 },
  { key: "6M", label: "Semestral", days: 182 },
  { key: "1Y", label: "1 año", days: 365 },
  { key: "2Y", label: "2 años", days: 730 },
  { key: "3Y", label: "3 años", days: 1095 },
  { key: "ALL", label: "Histórico", days: null },
];
const SUMMARY_PERIOD_KEYS = ["1D", "1M", "3M", "1Y", "3Y", "ALL"];
const COMPARE_COLORS = ["#d4a843", "#6fcf97", "#5b8def", "#e07a5f", "#b48cf0"];

// ---------------------------------------------------------------------------
// Economic indicator ribbon — live data from mindicador.cl, a free public
// API (no key) that mirrors Banco Central de Chile figures. CORS-open, so
// this fetches straight from the browser, no backend involved.
// DAP 12M isn't available from any free public API (it's a bank-commercial
// rate, not an official single published figure) — left as "—" rather than
// inventing a number.
// ---------------------------------------------------------------------------
function fmtCLP(n, decimals = 2) {
  if (typeof n !== "number") return "—";
  return n.toLocaleString("es-CL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

async function fetchEconIndicators() {
  const main = await fetch("https://mindicador.cl/api").then((r) => r.json());
  // Trailing-12-month IPC needs the monthly series, not just the latest value.
  const thisYear = new Date().getFullYear();
  const [serieThisYear, serieLastYear] = await Promise.all([
    fetch(`https://mindicador.cl/api/ipc/${thisYear}`).then((r) => r.json()).catch(() => null),
    fetch(`https://mindicador.cl/api/ipc/${thisYear - 1}`).then((r) => r.json()).catch(() => null),
  ]);
  const combined = [...(serieLastYear?.serie || []), ...(serieThisYear?.serie || [])]
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const last12 = combined.slice(-12);
  const ipc12m = last12.length === 12
    ? (last12.reduce((acc, p) => acc * (1 + p.valor / 100), 1) - 1) * 100
    : null;
  // El snapshot principal (main.ipc) puede quedar pegado en un valor viejo si
  // mindicador.cl tiene un problema de caché/actualización en ese endpoint en
  // particular. La serie histórica mensual (combined) se actualiza por separado,
  // así que se usa el último punto de ahí en vez de main.ipc.
  const lastIpcPoint = combined.length ? combined[combined.length - 1] : null;

  const fecha = (d) => new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });

  return [
    { label: "UF · hoy", value: `$${fmtCLP(main.uf?.valor)}`, asOf: fecha(main.uf?.fecha) },
    { label: "UTM · mes", value: `$${fmtCLP(main.utm?.valor, 0)}`, asOf: fecha(main.utm?.fecha) },
    { label: "USD/CLP", value: `$${fmtCLP(main.dolar?.valor)}`, asOf: fecha(main.dolar?.fecha) },
    { label: "IPC · mes", value: typeof lastIpcPoint?.valor === "number" ? `${lastIpcPoint.valor > 0 ? "+" : ""}${lastIpcPoint.valor.toFixed(1)}%` : "—", asOf: lastIpcPoint ? fecha(lastIpcPoint.fecha) : "—" },
    { label: "IPC 12M", value: ipc12m !== null ? `${ipc12m > 0 ? "+" : ""}${ipc12m.toFixed(1)}%` : "—", asOf: "trailing 12m" },
    { label: "TPM", value: typeof main.tpm?.valor === "number" ? `${main.tpm.valor.toFixed(2)}%` : "—", asOf: fecha(main.tpm?.fecha) },
    // No hay una tasa "DAP 12M" oficial única (cada banco fija la suya) —
    // se usa la TPM del Banco Central como aproximación de referencia.
    { label: "DAP 12M*", value: typeof main.tpm?.valor === "number" ? `${main.tpm.valor.toFixed(2)}%` : "—", asOf: "aprox. = TPM" },
  ];
}

const ECON_INDICATORS_FALLBACK = [
  { label: "UF · hoy", value: "—", asOf: "" },
  { label: "UTM · mes", value: "—", asOf: "" },
  { label: "USD/CLP", value: "—", asOf: "" },
  { label: "IPC · mes", value: "—", asOf: "" },
  { label: "IPC 12M", value: "—", asOf: "" },
  { label: "TPM", value: "—", asOf: "" },
  { label: "DAP 12M*", value: "—", asOf: "aprox. = TPM" },
];

function findValueOnOrBefore(series, targetDate) {
  for (let i = series.length - 1; i >= 0; i--) {
    if (new Date(series[i].date) <= targetDate) return series[i];
  }
  return series[0];
}

function filterSeriesForDays(series, days) {
  if (days === null) return series;
  const latestDate = new Date(series[series.length - 1].date);
  const target = new Date(latestDate);
  target.setDate(target.getDate() - days);
  return series.filter((pt) => new Date(pt.date) >= target);
}

function computeReturn(series, days) {
  const latest = series[series.length - 1];
  if (!latest) return null;
  let basePoint;
  if (days === null) {
    basePoint = series[0];
  } else {
    const target = new Date(latest.date);
    target.setDate(target.getDate() - days);
    basePoint = findValueOnOrBefore(series, target);
  }
  if (!basePoint || basePoint.value === 0) return null;
  const pct = ((latest.value - basePoint.value) / basePoint.value) * 100;
  return { pct, from: basePoint, to: latest };
}

function fmtPct(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtValue(v) {
  return v.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildComparisonData(funds, days) {
  const filtered = funds.map((f) => filterSeriesForDays(f.series, days));
  const allDates = Array.from(new Set(filtered.flatMap((s) => s.map((p) => p.date)))).sort();
  return allDates.map((date) => {
    const row = { date };
    filtered.forEach((s, idx) => {
      if (!s.length) return;
      const base = s[0].value;
      const point = findValueOnOrBefore(s, new Date(date));
      row[funds[idx].id] = point ? Math.round((point.value / base) * 1000) / 10 : null;
    });
    return row;
  });
}

export default function FundTracker() {
  const [mode, setMode] = useState("detail"); // detail | compare | mix
  const [activeFundId, setActiveFundId] = useState(FUNDS_BASE[0].id);
  const [activePeriod, setActivePeriod] = useState("1Y");
  const [comparePeriod, setComparePeriod] = useState("1Y");
  const [compareIds, setCompareIds] = useState([FUNDS_BASE[0].id, FUNDS_BASE[6].id]);
  const [mixRows, setMixRows] = useState([
    { fundId: FUNDS_BASE[0].id, pct: 60 },
    { fundId: FUNDS_BASE[6].id, pct: 40 },
  ]);

  const [liveData, setLiveData] = useState({});
  const [liveStatus, setLiveStatus] = useState("loading"); // loading | ok | error

  const [econIndicators, setEconIndicators] = useState(ECON_INDICATORS_FALLBACK);
  const [econStatus, setEconStatus] = useState("loading"); // loading | ok | error

  useEffect(() => {
    fetchLiveData()
      .then((data) => {
        setLiveData(data);
        setLiveStatus("ok");
      })
      .catch((err) => {
        console.warn("No se pudo leer data/funds.json:", err.message);
        setLiveStatus("error");
      });
  }, []);

  useEffect(() => {
    fetchEconIndicators()
      .then((data) => {
        setEconIndicators(data);
        setEconStatus("ok");
      })
      .catch((err) => {
        console.warn("No se pudo leer mindicador.cl:", err.message);
        setEconStatus("error");
      });
  }, []);

  const FUNDS = useMemo(
    () =>
      FUNDS_BASE.map((f) => {
        const live = f.live && liveData[f.id];
        return { ...f, series: live || f.sampleSeries, isLive: !!live };
      }),
    [liveData]
  );

  const fundsWithReturns = useMemo(
    () =>
      FUNDS.map((f) => ({
        ...f,
        returns: PERIODS.reduce((acc, p) => {
          acc[p.key] = computeReturn(f.series, p.days);
          return acc;
        }, {}),
      })),
    [FUNDS]
  );

  const alerts = useMemo(() => {
    const out = [];
    fundsWithReturns.forEach((f) => {
      const d1 = f.returns["1D"]?.pct;
      const m1 = f.returns["1M"]?.pct;
      if (typeof d1 === "number" && Math.abs(d1) >= 2) {
        out.push({ key: `${f.id}-1D`, fundName: f.name, manager: f.manager, period: "1D", pct: d1 });
      }
      if (typeof m1 === "number" && Math.abs(m1) >= 5) {
        out.push({ key: `${f.id}-1M`, fundName: f.name, manager: f.manager, period: "1M", pct: m1 });
      }
    });
    return out;
  }, [fundsWithReturns]);

  const groupedByManager = useMemo(() => {
    const order = [];
    const groups = {};
    fundsWithReturns.forEach((f) => {
      if (!groups[f.manager]) { groups[f.manager] = []; order.push(f.manager); }
      groups[f.manager].push(f);
    });
    return order.map((manager) => ({ manager, funds: groups[manager] }));
  }, [fundsWithReturns]);

  const byId = (id) => fundsWithReturns.find((f) => f.id === id);
  const activeFund = byId(activeFundId);
  const latest = activeFund.series[activeFund.series.length - 1];

  const chartSeries = useMemo(() => filterSeriesForDays(activeFund.series, PERIODS.find((p) => p.key === activePeriod).days), [activePeriod, activeFund]);
  const activeResult = activeFund.returns[activePeriod];
  const isUp = activeResult && activeResult.pct >= 0;

  // ---- compare mode ----
  const compareFunds = compareIds.map(byId).filter(Boolean);
  const compareData = useMemo(
    () => buildComparisonData(compareFunds, PERIODS.find((p) => p.key === comparePeriod).days),
    [compareIds, comparePeriod]
  );
  function toggleCompare(id) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  }

  // ---- mix mode ----
  const mixTotal = mixRows.reduce((a, r) => a + (Number(r.pct) || 0), 0);
  function updateMixRow(idx, patch) {
    setMixRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addMixRow() {
    if (mixRows.length >= 8) return;
    const used = new Set(mixRows.map((r) => r.fundId));
    const next = FUNDS.find((f) => !used.has(f.id)) || FUNDS[0];
    setMixRows((prev) => [...prev, { fundId: next.id, pct: 0 }]);
  }
  function removeMixRow(idx) {
    setMixRows((prev) => prev.filter((_, i) => i !== idx));
  }
  const mixReturns = useMemo(() => {
    if (mixTotal <= 0) return {};
    const out = {};
    PERIODS.forEach((p) => {
      let weighted = 0;
      let weightSum = 0;
      mixRows.forEach((r) => {
        const w = Number(r.pct) || 0;
        if (w <= 0) return;
        const ret = byId(r.fundId)?.returns?.[p.key]?.pct;
        if (ret === null || ret === undefined) return;
        weighted += ret * w;
        weightSum += w;
      });
      out[p.key] = weightSum > 0 ? weighted / weightSum : null;
    });
    return out;
  }, [mixRows]);
  const mixAllocation = useMemo(() => {
    if (mixTotal <= 0) return [];
    const totals = {};
    mixRows.forEach((r) => {
      const w = Number(r.pct) || 0;
      if (w <= 0) return;
      const fund = byId(r.fundId);
      fund.composition.allocation.forEach((a) => {
        totals[a.key] = (totals[a.key] || 0) + (a.pct * w) / mixTotal;
      });
    });
    return Object.entries(totals).map(([key, pct]) => ({ key, label: CATEGORY_LABELS[key], color: CATEGORY_COLORS[key], pct: Math.round(pct * 10) / 10 }));
  }, [mixRows]);

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .ft-card { animation: fadeUp 0.45s ease both; }
        .ft-pill { transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease; }
        .ft-pill:focus-visible, .ft-row:focus-visible, .ft-checkrow:focus-visible { outline: 2px solid #d4a843; outline-offset: 2px; }
        .ft-row { cursor: pointer; transition: background 0.15s ease; }
        .ft-row:hover { background: #1c232c; }
        .ft-checkrow { cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; }
        .ft-checkrow:hover { background: #1c232c; }
        .ft-iconbtn:hover { background: #1c232c; }
        input[type="number"] { font-family: inherit; }
        @media (prefers-reduced-motion: reduce) { .ft-card { animation: none; } }
        ::-webkit-scrollbar { height: 6px; }
        ::-webkit-scrollbar-thumb { background: #2b3340; border-radius: 4px; }
      `}</style>

      <div style={styles.shell}>
        {/* Header with icon */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, animation: "fadeUp 0.45s ease both" }}>
          <div style={styles.logoMark}>
            <img src="icons/icon-192.png" alt="RNCO" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div>
            <h1 style={styles.title}>
              <span style={styles.logoBR}>RNCO</span> <span style={styles.logoWord}>FundTracker</span>
            </h1>
            <div style={styles.subtitle}>
              {FUNDS.length} fondos · {fundsWithReturns.filter((f) => f.isLive).length} con datos en vivo (CMF)
              {liveStatus === "loading" && " · cargando…"}
            </div>
          </div>
        </div>

        {/* Economic indicator ribbon */}
        <div style={styles.ribbon} className="ft-card">
          {econIndicators.map((ind) => (
            <div key={ind.label} style={styles.ribbonItem}>
              <div style={styles.ribbonLabel}>{ind.label}</div>
              <div style={styles.ribbonValue}>{ind.value}</div>
              <div style={styles.ribbonAsOf}>{ind.asOf}</div>
            </div>
          ))}
        </div>
        <div style={styles.ribbonNote}>
          {econStatus === "ok" && "Fuente: mindicador.cl (Banco Central de Chile). *DAP 12M no tiene tasa única publicada — se usa la TPM como aproximación."}
          {econStatus === "loading" && "Cargando indicadores…"}
          {econStatus === "error" && "No se pudo conectar a mindicador.cl — mostrando valores vacíos."}
        </div>

        {/* Alertas de variación: ±2% día vs. el día anterior, ±5% mes vs. hace 30 días */}
        {alerts.length > 0 && (
          <div style={styles.alertsBox} className="ft-card">
            {alerts.map((a) => (
              <div key={a.key} style={styles.alertRow}>
                {a.pct > 0 ? <TrendingUp size={15} color="#6fcf97" /> : <TrendingDown size={15} color="#e07a5f" />}
                <span style={styles.alertText}>
                  <strong>{a.fundName}</strong> {a.pct > 0 ? "subió" : "bajó"}{" "}
                  <strong style={{ color: a.pct > 0 ? "#6fcf97" : "#e07a5f" }}>{fmtPct(a.pct)}</strong>{" "}
                  {a.period === "1D" ? "respecto al día anterior" : "en el último mes"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Mode buttons */}
        <div style={styles.modeRow} className="ft-card">
          <button style={{ ...styles.modeBtn, ...(mode === "detail" ? styles.modeBtnActive : {}) }} onClick={() => setMode("detail")}>
            Detalle por fondo
          </button>
          <button style={{ ...styles.modeBtn, ...(mode === "compare" ? styles.modeBtnActive : {}) }} onClick={() => setMode("compare")}>
            <GitCompareArrows size={15} /> Comparar fondos
          </button>
          <button style={{ ...styles.modeBtn, ...(mode === "mix" ? styles.modeBtnActive : {}) }} onClick={() => setMode("mix")}>
            <PieChart size={15} /> Crear mi mix
          </button>
        </div>

        {/* Summary table — always visible */}
        <div style={styles.tableCard} className="ft-card">
          <div style={styles.tableHeader}>Resumen</div>
          <div style={styles.tableScroll}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, textAlign: "left", minWidth: 220 }}>Fondo</th>
                  {SUMMARY_PERIOD_KEYS.map((k) => (
                    <th key={k} style={styles.th}>{PERIODS.find((p) => p.key === k).label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedByManager.map((group) => (
                  <Fragment key={group.manager}>
                    <tr>
                      <td colSpan={SUMMARY_PERIOD_KEYS.length + 1} style={styles.managerHeaderCell}>{group.manager}</td>
                    </tr>
                    {group.funds.map((f) => (
                      <tr
                        key={f.id}
                        className="ft-row"
                        tabIndex={0}
                        onClick={() => { setActiveFundId(f.id); setMode("detail"); }}
                        onKeyDown={(e) => e.key === "Enter" && (setActiveFundId(f.id), setMode("detail"))}
                        style={{
                          background: f.id === activeFundId && mode === "detail" ? "#1c232c" : "transparent",
                          borderLeft: f.id === activeFundId && mode === "detail" ? "2px solid #d4a843" : "2px solid transparent",
                        }}
                      >
                        <td style={{ ...styles.td, fontFamily: "inherit" }}>
                          <div style={{ fontWeight: 600, color: "#e7e9ec" }}>{f.name}</div>
                          <div style={{ fontSize: 11, color: "#6b7684" }}>
                            Serie {f.serie} <span style={{ color: f.isLive ? "#6fcf97" : "#5c6573" }}>{f.isLive ? "● en vivo" : "○ muestra"}</span>
                          </div>
                        </td>
                        {SUMMARY_PERIOD_KEYS.map((k) => {
                          const pct = f.returns[k]?.pct;
                          const up = pct !== undefined && pct !== null && pct >= 0;
                          return (
                            <td key={k} style={{ ...styles.td, color: pct == null ? "#6b7684" : up ? "#6fcf97" : "#e07a5f" }}>
                              {fmtPct(pct)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {mode === "detail" && (
          <>
            {/* Fund tabs, grouped by manager */}
            <div style={{ marginBottom: 18 }} className="ft-card">
              {groupedByManager.map((group) => (
                <div key={group.manager} style={{ marginBottom: 8 }}>
                  <div style={styles.tabGroupLabel}>{group.manager}</div>
                  <div style={styles.pillRow}>
                    {group.funds.map((f) => {
                      const active = f.id === activeFundId;
                      return (
                        <button
                          key={f.id}
                          className="ft-pill"
                          onClick={() => setActiveFundId(f.id)}
                          style={{ ...styles.pill, background: active ? "#d4a843" : "transparent", color: active ? "#161b22" : "#9aa5b1", borderColor: active ? "#d4a843" : "#2b3340" }}
                        >
                          {f.name} <span style={{ opacity: 0.7 }}>({f.serie})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Detail header */}
            <div style={{ ...styles.headerRow, animation: "fadeUp 0.45s ease both" }}>
              <div>
                <div style={styles.eyebrow}>{activeFund.manager} · Serie {activeFund.serie}</div>
                <h2 style={styles.title2}>{activeFund.name}</h2>
              </div>
              <div style={styles.valueBlock}>
                <div style={styles.valueNumber}>{fmtValue(latest.value)}</div>
                <div style={styles.valueLabel}>valor cuota · {fmtDate(latest.date)}</div>
                <div style={{ ...styles.dataBadge, color: activeFund.isLive ? "#6fcf97" : "#9aa5b1", borderColor: activeFund.isLive ? "#2f4f3d" : "#2b3340" }}>
                  {activeFund.isLive ? "● En vivo (CMF)" : "○ Muestra"}
                </div>
              </div>
            </div>

            {/* Period pills */}
            <div style={styles.pillRow} className="ft-card">
              {PERIODS.map((p) => {
                const active = p.key === activePeriod;
                return (
                  <button key={p.key} className="ft-pill" onClick={() => setActivePeriod(p.key)} style={{ ...styles.pill, background: active ? "#d4a843" : "transparent", color: active ? "#161b22" : "#9aa5b1", borderColor: active ? "#d4a843" : "#2b3340" }}>
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Headline return */}
            <div style={styles.heroRow} className="ft-card">
              <div style={{ ...styles.heroPct, color: isUp ? "#6fcf97" : "#e07a5f" }}>
                {isUp ? <TrendingUp size={26} /> : <TrendingDown size={26} />}
                {fmtPct(activeResult?.pct)}
              </div>
              <div style={styles.heroSub}>
                {activeResult ? <>desde {fmtDate(activeResult.from.date)} ({fmtValue(activeResult.from.value)}) hasta {fmtDate(activeResult.to.date)}</> : "sin datos suficientes"}
              </div>
            </div>

            {/* Chart */}
            <div style={styles.chartCard} className="ft-card">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartSeries} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d4a843" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#d4a843" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#232a33" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => fmtDate(d)} tick={{ fill: "#6b7684", fontSize: 11 }} axisLine={{ stroke: "#2b3340" }} tickLine={false} minTickGap={50} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: "#6b7684", fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip contentStyle={{ background: "#1b212a", border: "1px solid #2b3340", borderRadius: 8 }} labelStyle={{ color: "#9aa5b1" }} itemStyle={{ color: "#d4a843" }} formatter={(v) => [fmtValue(v), "Valor cuota"]} labelFormatter={(d) => fmtDate(d)} />
                  <Area type="monotone" dataKey="value" stroke="#d4a843" strokeWidth={2} fill="url(#fillValue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Returns table */}
            <div style={styles.tableCard} className="ft-card">
              <div style={styles.tableHeader}>Rentabilidad por periodo · {activeFund.name}</div>
              <div style={styles.tableScroll}>
                <table style={styles.table}>
                  <thead><tr>{PERIODS.map((p) => (<th key={p.key} style={styles.th}>{p.label}</th>))}</tr></thead>
                  <tbody>
                    <tr>
                      {PERIODS.map((p) => {
                        const pct = activeFund.returns[p.key]?.pct;
                        const up = pct !== undefined && pct !== null && pct >= 0;
                        return (
                          <td key={p.key} style={{ ...styles.td, color: pct == null ? "#6b7684" : up ? "#6fcf97" : "#e07a5f", fontWeight: p.key === activePeriod ? 700 : 500 }}>
                            {fmtPct(pct)}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Composition panel */}
            <CompositionPanel composition={activeFund.composition} title={`Composición · ${activeFund.name}`} />
          </>
        )}

        {mode === "compare" && (
          <div className="ft-card">
            <div style={styles.tableCard}>
              <div style={styles.tableHeader}>Elige entre 2 y 5 fondos para comparar</div>
              <div style={styles.checkGrid}>
                {fundsWithReturns.map((f) => {
                  const checked = compareIds.includes(f.id);
                  const disabled = !checked && compareIds.length >= 5;
                  return (
                    <label key={f.id} className="ft-checkrow" tabIndex={0} style={{ ...styles.checkRow, borderColor: checked ? "#d4a843" : "#2b3340", opacity: disabled ? 0.4 : 1 }}>
                      <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleCompare(f.id)} style={{ accentColor: "#d4a843" }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{f.name}</div>
                        <div style={{ fontSize: 11, color: "#6b7684" }}>{f.manager} · Serie {f.serie}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: "#6b7684", marginTop: 10 }}>{compareIds.length}/5 seleccionados {compareIds.length < 2 ? "· elige al menos 2" : ""}</div>
            </div>

            {compareFunds.length >= 2 && (
              <>
                <div style={styles.pillRow}>
                  {PERIODS.map((p) => (
                    <button key={p.key} className="ft-pill" onClick={() => setComparePeriod(p.key)} style={{ ...styles.pill, background: comparePeriod === p.key ? "#d4a843" : "transparent", color: comparePeriod === p.key ? "#161b22" : "#9aa5b1", borderColor: comparePeriod === p.key ? "#d4a843" : "#2b3340" }}>
                      {p.label}
                    </button>
                  ))}
                </div>

                <div style={styles.chartCard}>
                  <div style={{ fontSize: 11, color: "#6b7684", marginBottom: 8 }}>Base 100 al inicio del periodo seleccionado</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={compareData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#232a33" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(d) => fmtDate(d)} tick={{ fill: "#6b7684", fontSize: 11 }} axisLine={{ stroke: "#2b3340" }} tickLine={false} minTickGap={50} />
                      <YAxis domain={["auto", "auto"]} tick={{ fill: "#6b7684", fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                      <Tooltip contentStyle={{ background: "#1b212a", border: "1px solid #2b3340", borderRadius: 8 }} labelFormatter={(d) => fmtDate(d)} formatter={(v, key) => [v, byId(key)?.name]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} formatter={(key) => byId(key)?.name} />
                      {compareFunds.map((f, idx) => (
                        <Line key={f.id} type="monotone" dataKey={f.id} stroke={COMPARE_COLORS[idx % COMPARE_COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={styles.tableCard}>
                  <div style={styles.tableHeader}>Rentabilidad por periodo</div>
                  <div style={styles.tableScroll}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={{ ...styles.th, textAlign: "left", minWidth: 200 }}>Fondo</th>
                          {PERIODS.map((p) => (<th key={p.key} style={styles.th}>{p.label}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {compareFunds.map((f, idx) => (
                          <tr key={f.id}>
                            <td style={{ ...styles.td, fontFamily: "inherit" }}>
                              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: COMPARE_COLORS[idx % COMPARE_COLORS.length], marginRight: 6 }} />
                              <span style={{ fontWeight: 600 }}>{f.name}</span> <span style={{ color: "#6b7684", fontSize: 11 }}>({f.serie})</span>
                            </td>
                            {PERIODS.map((p) => {
                              const pct = f.returns[p.key]?.pct;
                              const up = pct !== undefined && pct !== null && pct >= 0;
                              return <td key={p.key} style={{ ...styles.td, color: pct == null ? "#6b7684" : up ? "#6fcf97" : "#e07a5f" }}>{fmtPct(pct)}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {mode === "mix" && (
          <div className="ft-card">
            <div style={styles.tableCard}>
              <div style={styles.tableHeader}>Construye tu mix</div>
              {mixRows.map((row, idx) => (
                <div key={idx} style={styles.mixRow}>
                  <select value={row.fundId} onChange={(e) => updateMixRow(idx, { fundId: e.target.value })} style={styles.select}>
                    {FUNDS.map((f) => (<option key={f.id} value={f.id}>{f.name} ({f.manager} · {f.serie})</option>))}
                  </select>
                  <div style={styles.pctInputWrap}>
                    <input type="number" min="0" max="100" value={row.pct} onChange={(e) => updateMixRow(idx, { pct: e.target.value })} style={styles.pctInput} />
                    <span style={{ color: "#6b7684" }}>%</span>
                  </div>
                  <button className="ft-iconbtn" onClick={() => removeMixRow(idx)} style={styles.iconBtnSmall} aria-label="Quitar"><X size={16} /></button>
                </div>
              ))}
              <button className="ft-iconbtn" onClick={addMixRow} style={styles.addRowBtn}><Plus size={15} /> Agregar fondo</button>
              <div style={{ marginTop: 12, fontSize: 13, color: mixTotal === 100 ? "#6fcf97" : "#e07a5f", fontWeight: 600 }}>
                Total asignado: {mixTotal.toFixed(1)}% {mixTotal !== 100 && "(ajusta para que sume 100%)"}
              </div>
            </div>

            <div style={styles.tableCard}>
              <div style={styles.tableHeader}>Rentabilidad estimada del mix</div>
              <div style={styles.tableScroll}>
                <table style={styles.table}>
                  <thead><tr>{PERIODS.map((p) => (<th key={p.key} style={styles.th}>{p.label}</th>))}</tr></thead>
                  <tbody>
                    <tr>
                      {PERIODS.map((p) => {
                        const pct = mixReturns[p.key];
                        const up = pct !== undefined && pct !== null && pct >= 0;
                        return <td key={p.key} style={{ ...styles.td, color: pct == null ? "#6b7684" : up ? "#6fcf97" : "#e07a5f", fontWeight: 700 }}>{fmtPct(pct)}</td>;
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 11, color: "#6b7684", marginTop: 8 }}>Promedio ponderado por % asignado, calculado fondo por fondo en base a los datos de muestra.</div>
            </div>

            {mixAllocation.length > 0 && (
              <CompositionPanel composition={{ allocation: mixAllocation, holdings: [] }} title="Composición combinada del mix" hideHoldings />
            )}
          </div>
        )}

        <div style={styles.footnote}>
          Datos de muestra generados localmente — aún no conectado a CMF ni a los sitios de cada administradora. La rentabilidad pasada no garantiza resultados futuros.
        </div>
      </div>
    </div>
  );
}

function CompositionPanel({ composition, title, hideHoldings }) {
  const { allocation, holdings } = composition;
  const sorted = [...allocation].sort((a, b) => b.pct - a.pct);
  return (
    <div style={styles.tableCard} className="ft-card">
      <div style={styles.tableHeader}>{title}</div>
      <div style={styles.allocationBar}>
        {sorted.map((a) => (
          <div key={a.key} style={{ width: `${a.pct}%`, background: a.color, height: "100%" }} title={`${a.label}: ${a.pct}%`} />
        ))}
      </div>
      <div style={styles.legendGrid}>
        {sorted.map((a) => (
          <div key={a.key} style={styles.legendItem}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: a.color, display: "inline-block" }} />
            <span style={{ color: "#9aa5b1" }}>{a.label}</span>
            <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{a.pct}%</span>
          </div>
        ))}
      </div>
      {!hideHoldings && holdings.length > 0 && (
        <>
          <div style={{ ...styles.tableHeader, marginTop: 16, fontSize: 12 }}>Principales posiciones (muestra)</div>
          {holdings.map((h) => (
            <div key={h.name} style={styles.holdingRow}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: h.color, display: "inline-block" }} />
              <span style={{ flex: 1 }}>{h.name}</span>
              <span style={{ fontSize: 11, color: "#6b7684" }}>{h.category}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, minWidth: 48, textAlign: "right" }}>{h.pct}%</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#11151b", color: "#e7e9ec", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", padding: "calc(env(safe-area-inset-top, 0px) + 20px) 16px calc(env(safe-area-inset-bottom, 0px) + 48px)", boxSizing: "border-box" },
  shell: { maxWidth: 860, margin: "0 auto" },
  iconBadge: { width: 42, height: 42, borderRadius: 12, background: "#d4a843", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  logoMark: {
    width: 46,
    height: 46,
    borderRadius: 13,
    background: "#0a0a0a",
    border: "1px solid #232a33",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    padding: 4,
    boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
  },
  logoBR: {
    fontFamily: "'Inter', -apple-system, sans-serif",
    color: "#6fcf97",
    fontWeight: 800,
    letterSpacing: "-0.02em",
  },
  logoWord: { color: "#e7e9ec", fontWeight: 700 },
  alertsBox: { display: "flex", flexDirection: "column", gap: 6, background: "#1a1410", border: "1px solid #3a2f1f", borderRadius: 12, padding: "10px 14px", marginBottom: 14 },
  alertRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 },
  alertText: { color: "#dbe0e6" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, borderBottom: "1px solid #232a33", paddingBottom: 18, marginBottom: 18 },
  eyebrow: { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#d4a843", fontWeight: 600, marginBottom: 6 },
  title: { fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" },
  title2: { fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" },
  subtitle: { fontSize: 13, color: "#6b7684", marginTop: 2 },
  valueBlock: { textAlign: "right" },
  valueNumber: { fontSize: 26, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" },
  valueLabel: { fontSize: 11, color: "#6b7684", marginTop: 2 },
  dataBadge: { fontSize: 10.5, fontWeight: 600, border: "1px solid #2b3340", borderRadius: 12, padding: "2px 8px", display: "inline-block", marginTop: 6 },
  ribbon: { display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, marginBottom: 6 },
  ribbonItem: { flex: "0 0 auto", background: "#161b22", border: "1px solid #232a33", borderRadius: 10, padding: "8px 14px", minWidth: 110 },
  ribbonLabel: { fontSize: 10.5, color: "#6b7684", textTransform: "uppercase", letterSpacing: "0.03em" },
  ribbonValue: { fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", marginTop: 2, color: "#d4a843" },
  ribbonAsOf: { fontSize: 10, color: "#4d5560", marginTop: 1 },
  ribbonNote: { fontSize: 10.5, color: "#4d5560", marginBottom: 18 },
  modeRow: { display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" },
  modeBtn: { display: "flex", alignItems: "center", gap: 6, border: "1px solid #2b3340", background: "transparent", color: "#9aa5b1", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  modeBtnActive: { background: "#1c232c", color: "#d4a843", borderColor: "#d4a843" },
  pillRow: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 18 },
  tabGroupLabel: { fontSize: 10.5, color: "#6b7684", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 4 },
  pill: { flex: "0 0 auto", border: "1px solid #2b3340", borderRadius: 20, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  heroRow: { marginBottom: 14 },
  heroPct: { fontSize: 32, fontWeight: 800, display: "flex", alignItems: "center", gap: 8, fontFamily: "'JetBrains Mono', monospace" },
  heroSub: { fontSize: 12.5, color: "#6b7684", marginTop: 4 },
  chartCard: { background: "#161b22", border: "1px solid #232a33", borderRadius: 14, padding: "14px 10px 6px", marginBottom: 18 },
  tableCard: { background: "#161b22", border: "1px solid #232a33", borderRadius: 14, padding: "14px 16px", marginBottom: 18 },
  tableHeader: { fontSize: 13, fontWeight: 700, color: "#9aa5b1", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" },
  tableScroll: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 640 },
  th: { fontSize: 11, color: "#6b7684", textTransform: "uppercase", letterSpacing: "0.03em", textAlign: "left", padding: "0 14px 8px 0", fontWeight: 600 },
  managerHeaderCell: { fontSize: 11, color: "#d4a843", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, padding: "14px 0 6px", borderTop: "1px solid #232a33" },
  td: { fontSize: 14, padding: "8px 14px 8px 0", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", borderTop: "1px solid #1f262f" },
  footnote: { fontSize: 11, color: "#4d5560", textAlign: "center", lineHeight: 1.5, marginTop: 8 },
  checkGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 },
  checkRow: { display: "flex", alignItems: "center", gap: 10, border: "1px solid #2b3340", borderRadius: 10, padding: "9px 12px", cursor: "pointer" },
  mixRow: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 },
  select: { flex: "1 1 180px", minWidth: 0, background: "#11151b", color: "#e7e9ec", border: "1px solid #2b3340", borderRadius: 8, padding: "8px 10px", fontSize: 13 },
  pctInputWrap: { display: "flex", alignItems: "center", gap: 4, background: "#11151b", border: "1px solid #2b3340", borderRadius: 8, padding: "4px 8px", flex: "0 0 auto" },
  pctInput: { width: 44, background: "transparent", border: "none", color: "#e7e9ec", fontSize: 13, outline: "none" },
  iconBtnSmall: { background: "transparent", border: "1px solid #2b3340", borderRadius: 8, color: "#9aa5b1", padding: 6, cursor: "pointer", display: "flex", flex: "0 0 auto" },
  addRowBtn: { display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px dashed #2b3340", borderRadius: 10, color: "#d4a843", padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 4 },
  allocationBar: { display: "flex", width: "100%", height: 14, borderRadius: 7, overflow: "hidden", marginBottom: 12 },
  legendGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "6px 16px" },
  legendItem: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 },
  holdingRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "6px 0", borderTop: "1px solid #1f262f" },
};

// ---------------------------------------------------------------------------
// Mount into #root — this is the only addition needed to run this component
// as a plain static page (no build step), loaded via the importmap in
// index.html and transpiled in-browser by Babel Standalone.
// ---------------------------------------------------------------------------
import { createRoot } from "react-dom/client";
createRoot(document.getElementById("root")).render(<FundTracker />);

