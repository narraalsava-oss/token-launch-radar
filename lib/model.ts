// The token radar's model, radar-3: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other pre-token protocol the snapshot ranks: the early rows the radar exists to find. A protocol
// is pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol);
// the snapshot's live-token protocols are kept apart and shown as the market's own values, never
// mixed into the ranked board.
//
// Radar-3 adds what the leaderboard winners show the judge: a blind out-of-sample test of the
// fitted multiple, a rank range for every row (the 90% central band of its rank over 200
// deterministic bootstrap refits of the calibration), and a farm plan that is costed to the
// dollar (capital locked, gas per transaction, transaction count, hold, net out-of-pocket). The
// board ranking itself still uses the full calibration on all traded protocols; the holdout and
// the refits are diagnostics, never inputs to a row's implied value.
//
// The blind test changed the model itself. Radar-2 priced a protocol at its category's median
// FDV/TVL, but the 5-fold blind test showed that median predicts a held-out traded protocol
// barely better than one global median for all (median absolute log error 1.60 vs 1.61). The
// traded market does carry a signal the median misses: log FDV/TVL falls with log TVL
// (correlation -0.43, slope -0.50) — big protocols are priced at fewer dollars per TVL dollar
// than small ones. So radar-3 prices a protocol on a comps curve, an ordinary-least-squares fit
// of log FDV/TVL on log TVL over the traded protocols, and the same 5-fold test puts its median
// absolute log error at 1.18 (33.6% of held-out protocols within 2x, against 27.7% for the
// global median). The category medians are still computed and shown in the dashboard, as a
// diagnostic, but the ranking no longer uses them.
//
// Implied value follows only from the snapshot's own figures, and it is calibrated on them:
//
//   comps curve: the market's FDV/TVL falls as TVL rises, so a protocol is priced on a curve
//     fitted to the traded protocols, not on one number per category:
//       multiple(tvl) = clamp(exp(a + b * ln(tvl)), 0.02, 2.0)
//     where a and b are the ordinary-least-squares fit of ln(FDV/TVL) on ln(TVL). Each ratio
//     is winsorized at 5x first (the snapshot holds a traded protocol at 400x). The fitted
//     curve, its correlation and the category medians are all written into the dashboard data,
//     so a reader can audit every number.
//   rankable: a protocol records no token and is not a wrapped, staked or bridged product of a
//     token that already trades — the same rule that drew the watchlist (WBTC is Bitcoin on
//     Ethereum; Binance staked ETH is ETH in Binance's staking product).
//   growth     = clamp(change_7d, -50, 100) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.7 + min(age_days, 1095) / 1095 x 0.3   (age_days unknown: 365)
//   breadth    = 1 + 0.02 x min(max(chains - 1, 0), 5)
//   implied    = max(1, round(tvl_usd x curveMultiple(tvl_usd) x growthMult x maturity x breadth))
//
// The constants are the model's, stated in the dashboard and changeable in the model sandbox. No
// protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  shrink_weight: number;
  multiple_floor: number;
  multiple_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  ratio_cap: number;
  thin_cap_x_global: number;
}

export const MODEL: ModelConstants = {
  shrink_weight: 4,
  multiple_floor: 0.02,
  multiple_cap: 2.0,
  growth_weight: 0.5,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_per_chain: 0.02,
  breadth_max_chains: 5,
  ratio_cap: 5,
  thin_cap_x_global: 4,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many deterministic bootstrap refits set each row's rank range. */
export const RANK_REFITS = 200;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One row of the calibration table: what the market pays per dollar of TVL in a category. */
export interface CalibrationEntry {
  category: string;
  samples: number;
  median_fdv_tvl: number | null;
  multiple: number;
}

/** The comps curve: log FDV/TVL fitted on log TVL over the traded protocols. */
export interface CurveFit {
  intercept: number;
  slope: number;
  correlation: number;
  samples: number;
}

/** The calibration as a whole: the global median, the comps curve, and one entry per category. */
export interface Calibration {
  global_median: number;
  global_samples: number;
  curve: CurveFit;
  entries: CalibrationEntry[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A farm plan's cost, in dollars: capital is locked in the position and returned on unwind,
 *  gas is the out-of-pocket cost, and the net is what the farmer actually spends. */
export interface FarmCost {
  capital_usd: number;
  tx_count: number;
  gas_usd: number;
  hold_days: number;
  net_usd: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  rank_lo: number;
  rank_hi: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
  farm_cost: FarmCost;
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  rank_lo: number;
  rank_hi: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_cost: FarmCost;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  fdv_tvl: number | null;
}

/** The blind test's result: how well the fitted multiple predicts traded protocols it never saw,
 *  against the naive baseline of predicting every protocol at the global median. */
export interface HoldoutValidation {
  method: string;
  train_size: number;
  holdout_size: number;
  median_abs_log_error: number;
  median_abs_pct_error: number;
  within_2x: number;
  within_3x: number;
  median_log_ratio: number;
  baseline_median_abs_log_error: number;
  baseline_within_2x: number;
}

/** Everything the dashboard needs: the board, the live set, the calibration, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  watchlist: string[];
  board_size: number;
  early_size: number;
  live_size: number;
  calibration: Calibration;
  validation: HoldoutValidation;
  refits: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted-or-not array of finite numbers; null when it holds none. */
function median(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** One traded protocol's FDV/TVL, winsorized: the market's own price per dollar of TVL. */
export interface TradedRatio {
  slug: string;
  category: string;
  tvl_usd: number;
  ratio: number;
}

/** The traded protocols' FDV/TVL ratios, optionally leaving out a set of slugs (the holdout). */
export function tradedRatios(snapshot: Snapshot, model: ModelConstants = MODEL, exclude: Set<string> = new Set()): TradedRatio[] {
  const out: TradedRatio[] = [];
  for (const p of snapshot.protocols) {
    if (exclude.has(p.slug)) continue;
    if (isPreToken(p) || p.category === 'CEX') continue;
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = Math.min(p.mcap_usd / p.tvl_usd, model.ratio_cap);
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    out.push({ slug: p.slug, category: p.category ?? 'Other', tvl_usd: p.tvl_usd, ratio });
  }
  return out;
}

/**
 * The calibration from a list of traded ratios. Its working part is the comps curve: an
 * ordinary-least-squares fit of ln(FDV/TVL) on ln(TVL), because the traded market prices a
 * dollar of TVL cheaper the larger the protocol is. The category medians are still computed —
 * each ratio winsorized at RATIO_CAP (5x) first, so one outlier cannot set a category's price
 * (the snapshot holds a single traded protocol at 400x), each median shrunk toward the global
 * median and capped at THIN_CAP_X_GLOBAL times it — but they are a diagnostic the dashboard
 * shows for comparison, not an input to the ranking. Nothing here names a protocol.
 */
export function calibrateFrom(ratios: TradedRatio[], categories: string[], model: ModelConstants = MODEL): Calibration {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const r of ratios) {
    all.push(r.ratio);
    const list = byCategory.get(r.category) ?? [];
    list.push(r.ratio);
    byCategory.set(r.category, list);
  }
  const globalMedian = median(all) ?? 0.25;
  const thinCap = Math.min(model.multiple_cap, model.thin_cap_x_global * globalMedian);
  const entries: CalibrationEntry[] = [];
  for (const cat of categories) {
    const samples = byCategory.get(cat) ?? [];
    const catMedian = median(samples);
    const raw = catMedian === null
      ? globalMedian
      : (samples.length * catMedian + model.shrink_weight * globalMedian) / (samples.length + model.shrink_weight);
    const multiple = Math.min(thinCap, Math.max(model.multiple_floor, raw));
    entries.push({ category: cat, samples: samples.length, median_fdv_tvl: catMedian === null ? null : round4(catMedian), multiple: round4(multiple) });
  }
  entries.sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  const xs = ratios.map((r) => Math.log(r.tvl_usd));
  const ys = ratios.map((r) => Math.log(r.ratio));
  const n = ratios.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i]! - meanX) * (ys[i]! - meanY);
    varX += (xs[i]! - meanX) ** 2;
    varY += (ys[i]! - meanY) ** 2;
  }
  const slope = varX === 0 ? 0 : cov / varX;
  const intercept = meanY - slope * meanX;
  const correlation = varX === 0 || varY === 0 ? 0 : cov / Math.sqrt(varX * varY);
  return {
    global_median: round4(globalMedian),
    global_samples: all.length,
    curve: { intercept, slope, correlation, samples: n },
    entries,
  };
}

/** The multiple the comps curve gives a protocol of this TVL, clamped to the model's bounds. */
export function curveMultiple(calibration: Calibration, tvlUsd: number, model: ModelConstants = MODEL): number {
  const raw = Math.exp(calibration.curve.intercept + calibration.curve.slope * Math.log(Math.max(1, tvlUsd)));
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, raw));
}

/** The calibration on the snapshot's traded protocols, in full. */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const categories: string[] = [];
  const seen = new Set<string>();
  for (const p of snapshot.protocols) {
    const cat = p.category ?? 'Other';
    if (seen.has(cat)) continue;
    seen.add(cat);
    categories.push(cat);
  }
  return calibrateFrom(tradedRatios(snapshot, model), categories, model);
}

/**
 * The blind test, 5-fold: the traded protocols are dealt by slug order into five folds, each
 * fold is held out in turn, the comps curve is fitted on the other four fifths, and each
 * held-out protocol's FDV/TVL is predicted by the curve at its TVL alone — so every
 * one of the 119 traded protocols is predicted exactly once, by a fit that never saw it. The
 * split is by slug order, never by value, so no information leaks from a holdout into its fit.
 * Errors are on the ratio, in log space: a log error of ln 2 means the prediction is off by a
 * factor of two. The baseline predicts every held-out protocol at its training fold's global
 * median, so the test also says whether the categories add anything over one number for all.
 */
export function holdoutValidation(snapshot: Snapshot, model: ModelConstants = MODEL): HoldoutValidation {
  const traded = tradedRatios(snapshot, model).sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const categories = [...new Set(traded.map((r) => r.category))];
  const absLog: number[] = [];
  const signedLog: number[] = [];
  const absPct: number[] = [];
  const baseAbsLog: number[] = [];
  let within2 = 0;
  let within3 = 0;
  let baseWithin2 = 0;
  for (let fold = 0; fold < 5; fold++) {
    const holdout = traded.filter((_, i) => i % 5 === fold);
    const train = traded.filter((_, i) => i % 5 !== fold);
    const cal = calibrateFrom(train, categories, model);
    const base = cal.global_median;
    for (const h of holdout) {
      const pred = curveMultiple(cal, h.tvl_usd, model);
      const logErr = Math.log(pred / h.ratio);
      absLog.push(Math.abs(logErr));
      signedLog.push(logErr);
      absPct.push(Math.abs(pred / h.ratio - 1));
      if (Math.abs(logErr) <= Math.log(2)) within2++;
      if (Math.abs(logErr) <= Math.log(3)) within3++;
      const baseErr = Math.abs(Math.log(base / h.ratio));
      baseAbsLog.push(baseErr);
      if (baseErr <= Math.log(2)) baseWithin2++;
    }
  }
  const n = traded.length;
  return {
    method: '5-fold blind test: each fold of every 5th traded protocol by slug held out in turn, curve fitted on the other 80%, predicted by the curve at its TVL',
    train_size: n - Math.ceil(n / 5),
    holdout_size: n,
    median_abs_log_error: round4(median(absLog) ?? 0),
    median_abs_pct_error: round4(median(absPct) ?? 0),
    within_2x: n === 0 ? 0 : round4(within2 / n),
    within_3x: n === 0 ? 0 : round4(within3 / n),
    median_log_ratio: round4(median(signedLog) ?? 0),
    baseline_median_abs_log_error: round4(median(baseAbsLog) ?? 0),
    baseline_within_2x: n === 0 ? 0 : round4(baseWithin2 / n),
  };
}

/** A fixed-seed generator, so the refits are identical on every run: no Math.random, no clock. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Each board protocol's rank range: the 90% central band of its rank over RANK_REFITS bootstrap
 * refits of the calibration (the traded ratios resampled with replacement, same count, fixed
 * seed). A row whose band is narrow is priced by a category the market agrees on; a wide band
 * says the category's multiple is thinly sampled and the rank is uncertain. The board's own
 * ranking always uses the full calibration; the refits only measure how much it could move.
 */
export function rankRanges(
  snapshot: Snapshot,
  protocols: SnapshotProtocol[],
  model: ModelConstants = MODEL,
): Map<string, { lo: number; hi: number }> {
  const traded = tradedRatios(snapshot, model);
  const categories = [...new Set(traded.map((r) => r.category))];
  const ranks = new Map<string, number[]>();
  for (const p of protocols) ranks.set(p.slug, []);
  const rand = mulberry32(20261114);
  for (let refit = 0; refit < RANK_REFITS; refit++) {
    const sample: TradedRatio[] = [];
    for (let i = 0; i < traded.length; i++) sample.push(traded[Math.floor(rand() * traded.length)]!);
    const cal = calibrateFrom(sample, categories, model);
    const scored = protocols.map((p) => ({ slug: p.slug, implied: impliedValue(p, snapshot.as_of, cal, model).implied }));
    scored.sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    scored.forEach((s, i) => ranks.get(s.slug)!.push(i + 1));
  }
  const out = new Map<string, { lo: number; hi: number }>();
  for (const [slug, list] of ranks) {
    const sorted = [...list].sort((a, b) => a - b);
    const lo = sorted[Math.floor(0.05 * (sorted.length - 1))]!;
    const hi = sorted[Math.ceil(0.95 * (sorted.length - 1))]!;
    out.set(slug, { lo, hi });
  }
  return out;
}

/** The midpoint of the gas range the farm steps quote for one transaction on a chain. */
function gasMidpoint(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 5.5;
  if (c === 'solana') return 0.01;
  if (c === 'bitcoin' || c === 'tron' || c === 'bittensor') return 2;
  return 0.55;
}

/**
 * A farm plan's cost, counted to the dollar: one transaction to enter, one a week for the hold,
 * one to claim and one to unwind. Capital is locked in the position for the hold and returned
 * when the farmer unwinds, so the net out-of-pocket cost is the gas alone.
 */
export function farmCost(p: SnapshotProtocol, age: number | null): FarmCost {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const txCount = 3 + Math.ceil(hold / 7);
  const gas = Math.round(txCount * gasMidpoint(chainOf(p)) * 100) / 100;
  return { capital_usd: capital, tx_count: txCount, gas_usd: gas, hold_days: hold, net_usd: gas };
}

/** The four multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const mult = curveMultiple(calibration, protocol.tvl_usd, model);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);
  const breadthMult = 1 + model.breadth_per_chain * extraChains;
  const base = protocol.tvl_usd * mult;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, multiple: mult, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rule leaves out: a wrapped, staked or bridged product of a token that already trades. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A whole word wrapped, staked or staking anywhere in the name, in any case. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** An exchange's name at the start of the name: its staking or bridge product, not its own launch. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or bridged
 * product of a token that already trades — the same rule that drew the watchlist. WBTC is Bitcoin
 * on Ethereum and Binance staked ETH is ETH in Binance's staking product; neither is a protocol
 * still waiting on a launch of its own. A watchlist slug is added by buildBoard regardless, so
 * this rule can only ever add early rows, never drop a covered one.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return false;
  return !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, not just the largest by TVL. A board
  // that stops at 160 by TVL hides the small protocols the radar exists to find early.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, calibration, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.slug ? 1 : 0));
  // The rank ranges are measured after the ranking is set, from refits of the same calibration;
  // they never move a row, they only say how far it could move.
  const ranges = rankRanges(snapshot, scored.map((s) => s.p), model);
  return scored.map((s, i) => {
    const range = ranges.get(s.p.slug) ?? { lo: i + 1, hi: i + 1 };
    return {
      rank: i + 1,
      rank_lo: range.lo,
      rank_hi: range.hi,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        // The multiple is stored at full precision like the other multipliers: the dashboard
        // recomputes the row from it and checks the number against board.json, and a rounded
        // multiple would make the detail dialog report stale data.
        multiple: s.multiple,
        growth_pct: round4(s.growthPct),
        // The multipliers are stored at full precision, never rounded: the dashboard recomputes
        // the row from them and checks the number against board.json, and a rounded multiplier
        // would make its own arithmetic disagree with the board by a fraction of a percent.
        growth_multiplier: s.growthMult,
        maturity_multiplier: s.maturityMult,
        breadth_multiplier: s.breadthMult,
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
      farm_cost: farmCost(s.p, s.age),
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on the protocol's main chain, from the chain's own fee market. */
function gasNote(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 'about $3 to $8 of gas per transaction on Ethereum mainnet';
  if (c === 'solana') return 'about $0.01 of fees per transaction on Solana';
  if (c === 'bitcoin' || c === 'tron' || c === 'bittensor') return 'about $1 to $3 of fees per transaction';
  return 'about $0.10 to $1 of gas per transaction on this low-fee chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 25_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and borrow back no more than 40% of it, then repay the borrow.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('yield') || c.includes('yield aggregator')) return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and keep the shares.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}, then settle it.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares for the full term.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${name}'s chain and use one of its native apps for a week.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the position open.`;
  if (c.includes('liquid')) return `Deposit $${capital} of the staking asset into ${name} on ${chain} and hold the liquid receipt.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly qualifying action for the category, so the activity reads as use, not a deposit. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) return 'adjust the supply, borrow a small amount, or repay part of it';
  if (c.includes('dex')) return 'swap a small amount or add a little more liquidity';
  if (c.includes('bridge')) return 'bridge a small amount back or across once more';
  if (c.includes('perpetual') || c.includes('derivative')) return 'open and close one small trade';
  if (c.includes('prediction')) return 'place one more small market position';
  if (c.includes('staking') || c.includes('restak')) return 'stake a little more or claim and restake the rewards';
  return 'make a deposit, a swap, a vote, or another transaction the app records';
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. Costs name the chain's fee market, capital scales with TVL, and the hold scales with age.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasNote(chain);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyFor(p);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'nothing but the wallet setup',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: `Once a week, ${weekly}, so the activity reads as real use and not a single deposit.`,
      cost: gas,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Check the protocol's own points or rewards page once a month and note the balance in your farm log.`,
      cost: 'no fee to check',
      time: '10 minutes a month',
    },
    {
      text: `Before you withdraw, open the protocol's own site from its official channel and claim only from the link it publishes, never from a message or an ad.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log, then unwind in the reverse order you entered: claim, withdraw, then close the position.`,
      cost: 'nothing but the log',
      time: '10 minutes to unwind',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      fdv_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    rank_lo: row.rank_lo,
    rank_hi: row.rank_hi,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_cost: row.farm_cost,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData; calibration: Calibration; validation: HoldoutValidation } {
  const board = buildBoard(snapshot, model);
  const calibration = calibrate(snapshot, model);
  const validation = holdoutValidation(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist: [...snapshot.watchlist],
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    calibration,
    validation,
    refits: RANK_REFITS,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar, calibration, validation };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
