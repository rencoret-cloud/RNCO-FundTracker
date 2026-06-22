/**
 * BR FundTracker — data update script
 * -------------------------------------------------------------------------
 * Pulls daily valor-cuota history for Chilean, CMF-regulated mutual funds
 * from Fintual's public REST API (https://fintual.cl/api), which mirrors
 * official CMF data and needs no API key. Writes the result to
 * data/funds.json, which the static front-end reads directly — no backend,
 * no Firebase, no Blaze. Run by the GitHub Actions workflow once a day.
 *
 * Coverage limits: only Chilean CMF-regulated funds show up here.
 * International / private-banking funds (BFG, JPM Global Income, Santander
 * Private Banking Global, GO Acciones Globales ESG) are not CMF-regulated
 * Chilean funds and are skipped — they stay on sample data for now.
 * -------------------------------------------------------------------------
 */
import { writeFile, readFile } from "fs/promises";

const API_BASE = "https://fintual.cl/api";
const DATA_PATH = new URL("../data/funds.json", import.meta.url);

const FUND_SOURCES = {
  "lv-agresiva": { managerHint: "LARRAIN VIAL", nameHint: "CUENTA ACTIVA AGRESIVA", serieHint: "A" },
  "lv-moderada": { managerHint: "LARRAIN VIAL", nameHint: "CUENTA ACTIVA MODERADA", serieHint: "A" },
  "lv-conservadora": { managerHint: "LARRAIN VIAL", nameHint: "CUENTA ACTIVA CONSERVADORA", serieHint: "A" },
  "lv-ahorro-capital-a": { managerHint: "LARRAIN VIAL", nameHint: "AHORRO CAPITAL", serieHint: "A" },
  "itau-dinamico": { managerHint: "ITAU", nameHint: "DINAMICO", serieHint: "" },
  "itau-gestionado-agresivo-f1": { managerHint: "ITAU", nameHint: "GESTIONADO AGRESIVO", serieHint: "F1" },
  "banchile-horizonte": { managerHint: "BANCHILE", nameHint: "HORIZONTE", serieHint: "L" },
  // Confirmed CMF-regulated (RUN 8908-7) — despite being a "private banking" label,
  // this is a Chilean mutual fund and should be resolvable via Fintual/CMF data.
  "santander-pb-agresivo": { managerHint: "SANTANDER", nameHint: "PRIVATE BANKING AGRESIVO", serieHint: "GLOBAL" },
  // Confirmed CMF-regulated (RUN 8090-K).
  "santander-go-ejecutiva": { managerHint: "SANTANDER", nameHint: "GO ACCIONES GLOBALES", serieHint: "EJECU" },
  "santander-go-inversionista": { managerHint: "SANTANDER", nameHint: "GO ACCIONES GLOBALES", serieHint: "INVERSIONISTA" },
};

// Genuinely not CMF-regulated Chilean funds (Luxembourg-domiciled, sold via
// private banking) — no free public data source found. Left on sample data
// until a manual-entry flow or a paid data source (Morningstar/Bloomberg) is set up.
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

async function resolveRealAssetId(source, cacheMap, fundId) {
  if (cacheMap[fundId]?.realAssetId) return cacheMap[fundId].realAssetId;

  const providers = await fetchJson(`${API_BASE}/asset_providers`);
  const provider = providers.data.find((p) =>
    normalize(p.attributes.name).includes(normalize(source.managerHint))
  );
  if (!provider) throw new Error(`No se encontró administradora para "${source.managerHint}"`);

  const conceptualAssets = await fetchJson(`${API_BASE}/asset_providers/${provider.id}/conceptual_assets`);
  const fund = conceptualAssets.data.find((a) =>
    normalize(a.attributes.name).includes(normalize(source.nameHint))
  );
  if (!fund) throw new Error(`No se encontró fondo "${source.nameHint}" en ${source.managerHint}`);

  const realAssets = await fetchJson(`${API_BASE}/conceptual_assets/${fund.id}/real_assets`);
  let serie = realAssets.data.find((r) =>
    normalize(r.attributes.symbol).endsWith(`-${normalize(source.serieHint)}`)
  );
  if (!serie) serie = realAssets.data[0];
  if (!serie) throw new Error(`Sin series disponibles para "${source.nameHint}"`);

  cacheMap[fundId] = { realAssetId: serie.id, symbol: serie.attributes.symbol };
  return serie.id;
}

async function loadExisting() {
  try {
    const raw = await readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function main() {
  const existing = await loadExisting();
  const mappingsCache = existing.__mappings || {};
  const out = { __mappings: mappingsCache, __generatedAt: new Date().toISOString() };

  for (const [fundId, source] of Object.entries(FUND_SOURCES)) {
    try {
      const realAssetId = await resolveRealAssetId(source, mappingsCache, fundId);
      const prevSeries = existing[fundId]?.series || [];
      const lastDate = prevSeries.length ? prevSeries[prevSeries.length - 1].date : null;
      const fromDate = lastDate
        ? new Date(new Date(lastDate).getTime() + 86400000).toISOString().slice(0, 10)
        : new Date(Date.now() - 3 * 365 * 86400000).toISOString().slice(0, 10);
      const toDate = new Date().toISOString().slice(0, 10);

      let newPoints = [];
      if (fromDate <= toDate) {
        const daysResp = await fetchJson(
          `${API_BASE}/real_assets/${realAssetId}/days?from_date=${fromDate}&to_date=${toDate}`
        );
        newPoints = (daysResp.data || [])
          .map((d) => ({ date: d.attributes.date, value: d.attributes.price }))
          .filter((p) => p.date && typeof p.value === "number");
      }

      const merged = [...prevSeries, ...newPoints].reduce((acc, p) => {
        acc[p.date] = p;
        return acc;
      }, {});
      const series = Object.values(merged).sort((a, b) => (a.date > b.date ? 1 : -1));

      out[fundId] = { series, lastUpdated: new Date().toISOString(), source: "fintual/cmf" };
      console.log(`✓ ${fundId}: +${newPoints.length} puntos nuevos (total ${series.length})`);
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
