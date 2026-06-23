/**
 * Renco FundTracker — data update script
 * -------------------------------------------------------------------------
 * Pulls daily valor-cuota history for Chilean, CMF-regulated mutual funds
 * from Fintual's public REST API (https://fintual.cl/api), which mirrors
 * official CMF data and needs no API key. Writes the result to
 * data/funds.json, which the static front-end reads directly — no backend,
 * no Firebase, no Blaze. Run by the GitHub Actions workflow once a day.
 *
 * Providers are pinned by exact Fintual asset_provider id rather than fuzzy
 * name matching — several banks have multiple entities in Fintual's catalog
 * (the AGF that runs mutual funds, plus separate bond-issuer / broker /
 * insurance entities with the same brand name), and a fuzzy match can lock
 * onto the wrong one silently. Run the script with DEBUG_PROVIDERS=1 to
 * print the full provider list again if a manager's id ever needs updating.
 *
 * Coverage limits: funds not domiciled/registered as Chilean CMF mutual
 * funds (BFG Global Dynamic, JPM Global Income — both Luxembourg-domiciled,
 * sold via private banking) have no public API and stay on sample data.
 * -------------------------------------------------------------------------
 */
import { writeFile, readFile } from "fs/promises";

const API_BASE = "https://fintual.cl/api";
const DATA_PATH = new URL("../data/funds.json", import.meta.url);

// Exact Fintual asset_provider ids (confirmed from a live /asset_providers dump).
const PROVIDERS = {
  LARRAINVIAL: 11, // "LARRAINVIAL ASSET MANAGEMENT ADMINISTRADORA GENERAL DE FONDOS S.A."
  ITAU: 14,        // "ITAU ADMINISTRADORA GENERAL DE FONDOS S.A."
  SANTANDER: 17,   // "SANTANDER ASSET MANAGEMENT S.A. ADMINISTRADORA GENERAL DE FONDOS"
  BANCHILE: 3,      // "BANCHILE ADMINISTRADORA GENERAL DE FONDOS S.A."
};

const FUND_SOURCES = {
  "lv-agresiva": { providerId: PROVIDERS.LARRAINVIAL, nameHint: "CUENTA ACTIVA AGRESIVA", serieHint: "A" },
  "lv-moderada": { providerId: PROVIDERS.LARRAINVIAL, nameHint: "CUENTA ACTIVA MODERADA", serieHint: "A" },
  "lv-conservadora": { providerId: PROVIDERS.LARRAINVIAL, nameHint: "CUENTA ACTIVA CONSERVADORA", serieHint: "A" },
  "lv-ahorro-capital-a": { providerId: PROVIDERS.LARRAINVIAL, nameHint: "AHORRO CAPITAL", serieHint: "A" },
  "itau-dinamico": { providerId: PROVIDERS.ITAU, nameHint: "DINAMICO", serieHint: "A" },
  // OJO: este fondo (id 8925) solo tiene series A / B / G en Fintual — no existe
  // una serie "F1" para él. Revisar con el banco si "F1" es en realidad otro
  // fondo CMF distinto ("Itaú Gestionado Agresivo F1" como fondo propio, no
  // como serie). Por ahora usa la serie A como mejor aproximación.
  "itau-gestionado-agresivo-f1": { providerId: PROVIDERS.ITAU, nameHint: "GESTIONADO AGRESIVO", serieHint: "A" },
  "banchile-horizonte": { providerId: PROVIDERS.BANCHILE, nameHint: "HORIZONTE", serieHint: "L" },
  "santander-pb-agresivo": { providerId: PROVIDERS.SANTANDER, nameHint: "PRIVATE BANKING AGRESIVO", serieHint: "GLOBAL" },
  "santander-go-ejecutiva": { providerId: PROVIDERS.SANTANDER, nameHint: "GO ACCIONES GLOBALES", serieHint: "EJECU" },
  "santander-go-inversionista": { providerId: PROVIDERS.SANTANDER, nameHint: "GO ACCIONES GLOBALES", serieHint: "INVER" },
};

// Genuinely not CMF-regulated Chilean funds — no free public data source
// found. Left on sample data until a manual-entry flow or a paid data
// source (Morningstar/Bloomberg) is set up.
const MANUAL_ONLY_FUND_IDS = [
  "bfg-global-dynamic",
  "jpm-global-income",
];

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function normalize(str) {
  return (str || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveCandidateSeries(source, fundId) {
  const conceptualAssets = await fetchJson(`${API_BASE}/asset_providers/${source.providerId}/conceptual_assets`);
  const fund = conceptualAssets.data.find((a) =>
    normalize(a.attributes.name).includes(normalize(source.nameHint))
  );
  if (!fund) {
    const available = conceptualAssets.data.map((a) => a.attributes.name).join(" | ");
    throw new Error(
      `No se encontró fondo "${source.nameHint}" en proveedor ${source.providerId}. Disponibles: ${available}`
    );
  }

  const realAssets = await fetchJson(`${API_BASE}/conceptual_assets/${fund.id}/real_assets`);
  if (!realAssets.data.length) throw new Error(`Sin series disponibles para "${source.nameHint}"`);

  const wantSerie = (source.serieHint || "").toUpperCase();
  const matchesHint = (r) => {
    const parts = r.attributes.symbol.toUpperCase().split("-");
    return parts.slice(3).join("-") === wantSerie;
  };
  // Try the hinted serie first, then fall back to every other serie of the
  // same fund (some series are registered in CMF/Fintual but have no NAV
  // history loaded — trying them in order finds one that actually has data).
  const ordered = [
    ...realAssets.data.filter(matchesHint),
    ...realAssets.data.filter((r) => !matchesHint(r)),
  ];

  if (process.env.DEBUG_PROVIDERS) {
    const allSymbols = realAssets.data.map((r) => r.attributes.symbol).join(", ");
    console.log(`   ↳ ${fundId}: fondo="${fund.attributes.name}" orden=[${ordered.map((r) => r.attributes.symbol).join(", ")}] disponibles=[${allSymbols}]`);
  }

  return ordered;
}

async function loadExisting() {
  try {
    const raw = await readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function maybeLogProviders() {
  if (!process.env.DEBUG_PROVIDERS) return;
  try {
    const providers = await fetchJson(`${API_BASE}/asset_providers`);
    console.log("=== Administradoras disponibles en Fintual ===");
    for (const p of providers.data) console.log(`[${p.id}] ${p.attributes.name}`);
    console.log("=== Fin lista administradoras ===");
  } catch (err) {
    console.error("No se pudo listar administradoras:", err.message);
  }
}

async function fetchDays(realAssetId, fromDate, toDate) {
  if (fromDate > toDate) return [];
  const daysResp = await fetchJson(
    `${API_BASE}/real_assets/${realAssetId}/days?from_date=${fromDate}&to_date=${toDate}`
  );
  return (daysResp.data || [])
    .map((d) => ({ date: d.attributes.date, value: d.attributes.price }))
    .filter((p) => p.date && typeof p.value === "number");
}

async function main() {
  const existing = await loadExisting();
  const mappingsCache = existing.__mappings || {};
  const out = { __mappings: mappingsCache, __generatedAt: new Date().toISOString() };

  await maybeLogProviders();

  for (const [fundId, source] of Object.entries(FUND_SOURCES)) {
    try {
      const prevSeries = existing[fundId]?.series || [];
      const lastDate = prevSeries.length ? prevSeries[prevSeries.length - 1].date : null;
      const fromDate = lastDate
        ? new Date(new Date(lastDate).getTime() + 86400000).toISOString().slice(0, 10)
        : new Date(Date.now() - 3 * 365 * 86400000).toISOString().slice(0, 10);
      const toDate = new Date().toISOString().slice(0, 10);

      // Reuse a previously-confirmed-working serie if we have one and we're
      // not in debug/re-discovery mode, instead of re-resolving every run.
      let newPoints = [];
      let usedSymbol = mappingsCache[fundId]?.symbol;
      if (!process.env.DEBUG_PROVIDERS && mappingsCache[fundId]?.realAssetId) {
        newPoints = await fetchDays(mappingsCache[fundId].realAssetId, fromDate, toDate);
      } else {
        const candidates = await resolveCandidateSeries(source, fundId);
        for (const candidate of candidates) {
          const points = await fetchDays(candidate.id, fromDate, toDate);
          // Accept this serie if it has new points, OR if we already have
          // prior history under it (so "up to date, 0 new" isn't mistaken
          // for "this serie has no data" on a later run).
          if (points.length > 0 || lastDate) {
            newPoints = points;
            usedSymbol = candidate.attributes.symbol;
            mappingsCache[fundId] = { realAssetId: candidate.id, symbol: candidate.attributes.symbol };
            break;
          }
        }
        if (!usedSymbol && candidates.length) {
          // Nothing had data on a first-ever run — keep the hinted/first
          // candidate on record so the log explains what was tried.
          usedSymbol = candidates[0].attributes.symbol;
          mappingsCache[fundId] = { realAssetId: candidates[0].id, symbol: candidates[0].attributes.symbol };
        }
      }

      const merged = [...prevSeries, ...newPoints].reduce((acc, p) => {
        acc[p.date] = p;
        return acc;
      }, {});
      const series = Object.values(merged).sort((a, b) => (a.date > b.date ? 1 : -1));

      out[fundId] = { series, lastUpdated: new Date().toISOString(), source: "fintual/cmf", symbol: usedSymbol };
      console.log(`✓ ${fundId}: +${newPoints.length} puntos nuevos (total ${series.length}) [serie ${usedSymbol}]`);
    } catch (err) {
      console.error(`✗ ${fundId}: ${err.message}`);
      if (existing[fundId]) out[fundId] = existing[fundId]; // keep last good data
    }
  }


  for (const fundId of MANUAL_ONLY_FUND_IDS) {
    if (existing[fundId]) out[fundId] = existing[fundId];
  }

  await writeFile(DATA_PATH, JSON.stringify(out, null, 2));
  console.log("Listo: data/funds.json actualizado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
