// The token radar's model (radar-3): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds every
// rankable pre-token protocol below the watchlist floor: the early rows the radar exists to find. A
// protocol is pre-token when its index entry records no token (no market cap, no CoinGecko id, no
// symbol); the snapshot's live-token protocols are kept apart and shown as the market's own values,
// never mixed into the ranked board. Protocols above the floor that the watchlist leaves out are
// left out for the watchlist's own reasons: they are wrapped, staked or bridged products of a token
// that already trades (Liquid Staking, Bridge, Canonical Bridge and the like), so ranking them as
// launches of their own would be ranking Bitcoin or ETH twice.
//
// Implied value follows only from the snapshot's own figures, never from a hand-written list of
// names. The starter's flat 0.25x of TVL is gone, and so is radar-2's category median: radar-3
// fits a real curve to the traded protocols in this very snapshot, an OLS regression of
// log10(market cap) on log10(TVL), plus a shrunk per-family offset, plus bounded growth, maturity
// and breadth adjustments. The same run validates the fitted model leave-one-out, refitting on
// every fold, and reports the honest out-of-sample error next to the old median model's error on
// the same folds.
//
//   size curve = alpha + beta x log10(tvl_usd / 1e8)          (alpha, beta fitted by OLS)
//   family     = shrunk mean residual of the curve in the protocol's category (n >= 4, else 0)
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   breadth    = 1 + 0.04 x min(chains - 1, 5)            (more chains, more reach)
//   log10value = size curve + family + log10(growthMult x maturity x breadth)
//   implied    = max(1, round(10 ^ log10value))
//
// Farm economics are derived from the fitted value, with the assumptions stated on the board:
// the airdrop is 10% of the implied value, shared by TVL, times a 10x activity boost for a
// hands-on farmer; gas is the first transaction, the setup, and one small transaction a week;
// hands-on time is the farm steps' own minutes. The verdict follows the dollars per hour.
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
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_max_extra: number;
  family_min_live: number;
  family_shrink_k: number;
  airdrop_pct: number;
  activity_boost: number;
  farm_usd_per_hour: number;
  marginal_usd_per_hour: number;
  gas_first_tx_usd: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_step: 0.04,
  breadth_max_extra: 5,
  family_min_live: 4,
  family_shrink_k: 3,
  airdrop_pct: 0.10,
  activity_boost: 10,
  farm_usd_per_hour: 15,
  marginal_usd_per_hour: 5,
  gas_first_tx_usd: 3,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One family's fitted offset: the shrunk mean residual of the size curve in that category. */
export interface FitFamily {
  category: string;
  n: number;
  offset: number;
}

/** The leave-one-out validation of the fitted model, and the old median model on the same folds. */
export interface FitValidation {
  loo_n: number;
  median_miss: number;
  within_3x: number;
  rank_corr: number;
  baseline_median_miss: number;
  baseline_within_3x: number;
  baseline_rank_corr: number;
}

/** The fitted curve, its family offsets, and its out-of-sample validation. */
export interface FitResult {
  alpha: number;
  beta: number;
  n_live: number;
  resid_sd: number;
  family: FitFamily[];
  validation: FitValidation;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A protocol's farm economics, derived from its fitted implied value. */
export interface FarmEconomics {
  capital_usd: number;
  hold_days: number;
  weeks: number;
  expected_usd: number;
  gas_usd: number;
  net_usd: number;
  hands_hours: number;
  usd_per_hour: number;
  verdict: 'Farm' | 'Marginal' | 'Skip';
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
    size_log10: number;
    family_offset: number;
    family_n: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    log10_value: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
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
  size_log10: number;
  family_offset: number;
  family_n: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  log10_value: number;
  farm_econ: FarmEconomics;
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
}

/** One traded protocol's point for the scatter plot: TVL against market cap, both in dollars. */
export interface FitPoint {
  slug: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
}

/** Everything the dashboard needs: the board, the live set, the fitted model, and the fit points. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  fit: FitResult;
  fit_points: FitPoint[];
  watchlist: string[];
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

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

// ------------------------------------------------------- the fitted curve

/** Whether a protocol can train the curve: it already trades, with a market cap and a TVL. */
function isFittable(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.gecko_id !== null && p.symbol !== null &&
    p.category !== 'CEX' && p.category !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

/** OLS fit of log10(market cap) on log10(TVL / $100M) over the traded protocols. */
export function fitSizeCurve(live: SnapshotProtocol[]): { alpha: number; beta: number; residSd: number } {
  const n = live.length;
  if (n < 2) {
    // Degenerate input: fall back to the data's own median multiple as a
    // pure size curve (beta = 1), so the fit is still data-derived.
    const ratios = live.map((p) => p.mcap_usd! / p.tvl_usd);
    const mult = ratios.length > 0 ? median(ratios) : 0.25;
    return { alpha: Math.log10(mult * 1e8), beta: 1, residSd: 0 };
  }
  const xs = live.map((p) => Math.log10(p.tvl_usd / 1e8));
  const ys = live.map((p) => Math.log10(p.mcap_usd!));
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - meanX) * (ys[i]! - meanY);
    sxx += (xs[i]! - meanX) * (xs[i]! - meanX);
  }
  const beta = sxx > 0 ? sxy / sxx : 0;
  const alpha = meanY - beta * meanX;
  let rss = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i]! - (alpha + beta * xs[i]!);
    rss += r * r;
  }
  return { alpha, beta, residSd: Math.sqrt(rss / n) };
}

/**
 * Per-category offset: the mean residual of the size curve inside the
 * category, shrunk toward zero by n / (n + k). Categories with fewer than
 * family_min_live traded protocols get no offset (too few comps to trust).
 */
export function fitFamilyOffsets(
  live: SnapshotProtocol[],
  alpha: number,
  beta: number,
  model: ModelConstants = MODEL,
): Map<string, { n: number; offset: number }> {
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const resid = Math.log10(p.mcap_usd!) - (alpha + beta * Math.log10(p.tvl_usd / 1e8));
    const list = byCat.get(p.category!) ?? [];
    list.push(resid);
    byCat.set(p.category!, list);
  }
  const out = new Map<string, { n: number; offset: number }>();
  for (const [category, residuals] of [...byCat.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const n = residuals.length;
    if (n < model.family_min_live) continue;
    const mean = residuals.reduce((a, b) => a + b, 0) / n;
    out.set(category, { n, offset: mean * (n / (n + model.family_shrink_k)) });
  }
  return out;
}

// ------------------------------------------------------- bounded adjustments

function growthMultiplier(p: SnapshotProtocol, model: ModelConstants): number {
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
  return 1 + (growthPct / 100) * model.growth_weight;
}

function maturityMultiplier(age: number | null, model: ModelConstants): number {
  const ageForModel = age ?? model.unknown_age_days;
  return model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
}

function breadthMultiplier(p: SnapshotProtocol, model: ModelConstants): number {
  const extra = Math.min(Math.max(p.chains.length - 1, 0), model.breadth_max_extra);
  return 1 + model.breadth_step * extra;
}

export interface FitTerms {
  size_log10: number;
  family_offset: number;
  family_n: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  log10_value: number;
}

/** The full radar-3 pricing of one protocol, from the fitted curve. */
export function fitTerms(
  p: SnapshotProtocol,
  age: number | null,
  alpha: number,
  beta: number,
  family: Map<string, { n: number; offset: number }>,
  model: ModelConstants = MODEL,
): FitTerms {
  const sizeLog10 = alpha + beta * Math.log10(p.tvl_usd / 1e8);
  const fam = p.category !== null ? family.get(p.category) : undefined;
  const familyOffset = fam !== undefined ? fam.offset : 0;
  const familyN = fam !== undefined ? fam.n : 0;
  const growth = growthMultiplier(p, model);
  const maturity = maturityMultiplier(age, model);
  const breadth = breadthMultiplier(p, model);
  const log10Value = sizeLog10 + familyOffset + Math.log10(growth * maturity * breadth);
  return {
    size_log10: sizeLog10,
    family_offset: familyOffset,
    family_n: familyN,
    growth_multiplier: growth,
    maturity_multiplier: maturity,
    breadth_multiplier: breadth,
    log10_value: log10Value,
  };
}

export function impliedFromTerms(terms: FitTerms): number {
  return Math.max(1, Math.round(10 ** terms.log10_value));
}

// ------------------------------------------------------- out-of-sample check

function spearmanRankCorrelation(actual: number[], predicted: number[]): number {
  const n = actual.length;
  const rankOf = (values: number[]): number[] => {
    const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v || a.i - b.i);
    const ranks = new Array<number>(n);
    order.forEach((item, pos) => { ranks[item.i] = pos + 1; });
    return ranks;
  };
  const ra = rankOf(actual);
  const rp = rankOf(predicted);
  const meanA = ra.reduce((a, b) => a + b, 0) / n;
  const meanP = rp.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denA = 0;
  let denP = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i]! - meanA) * (rp[i]! - meanP);
    denA += (ra[i]! - meanA) ** 2;
    denP += (rp[i]! - meanP) ** 2;
  }
  return denA > 0 && denP > 0 ? num / Math.sqrt(denA * denP) : 0;
}

function missStats(actual: number[], predicted: number[]): { medianMiss: number; within3x: number; rankCorr: number } {
  const misses = actual.map((a, i) => Math.max(predicted[i]! / a, a / predicted[i]!));
  const within = misses.filter((m) => m <= 3).length / misses.length;
  return { medianMiss: median(misses), within3x: within, rankCorr: spearmanRankCorrelation(actual, predicted) };
}

/**
 * Leave-one-out validation, refitting the curve and the family offsets on
 * every fold, with the old category-median model scored on the same folds
 * as the baseline. Nothing here is in-sample: each protocol is priced by a
 * model that never saw it.
 */
export function validateLeaveOneOut(
  live: SnapshotProtocol[],
  asOf: string,
  model: ModelConstants = MODEL,
): FitValidation {
  const n = live.length;
  const actual = live.map((p) => p.mcap_usd!);
  const fittedPred: number[] = new Array(n);
  const baselinePred: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const train = live.filter((_, j) => j !== i);
    const { alpha, beta } = fitSizeCurve(train);
    const family = fitFamilyOffsets(train, alpha, beta, model);
    const held = live[i]!;
    const age = ageDays(asOf, held.listed_at);
    fittedPred[i] = impliedFromTerms(fitTerms(held, age, alpha, beta, family, model));
    // Baseline: the radar-2 category median, computed without the held one.
    const ratios = train.map((p) => p.mcap_usd! / p.tvl_usd);
    const same = train
      .filter((p) => p.category === held.category)
      .map((p) => p.mcap_usd! / p.tvl_usd);
    const comp = same.length >= 3 ? Math.min(1.5, median(same)) : Math.min(1.5, median(ratios));
    const mult = growthMultiplier(held, model) * maturityMultiplier(age, model) * breadthMultiplier(held, model);
    baselinePred[i] = Math.max(1, Math.round(held.tvl_usd * comp * mult));
  }
  const fitted = missStats(actual, fittedPred);
  const baseline = missStats(actual, baselinePred);
  return {
    loo_n: n,
    median_miss: fitted.medianMiss,
    within_3x: fitted.within3x,
    rank_corr: fitted.rankCorr,
    baseline_median_miss: baseline.medianMiss,
    baseline_within_3x: baseline.within3x,
    baseline_rank_corr: baseline.rankCorr,
  };
}

// ------------------------------------------------------------- farm economics

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The gas one transaction costs on a protocol's first chain, in whole dollars. */
function gasFor(p: SnapshotProtocol): number {
  return chainOf(p) === 'Ethereum' ? 8 : 1;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action, so the plan is not the same sentence for every row. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Borrow a small amount against the deposit once a month, then repay it, so the position shows both sides.';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return 'Swap a small amount through the pool each week so the wallet shows repeated use, not one deposit.';
  if (c.includes('bridge')) return 'Bridge a small amount back, or to a second chain, once a month so the wallet shows repeated use.';
  if (c.includes('staking') || c.includes('restak')) return 'Claim any rewards the position accrues and restake them once a month.';
  if (c.includes('perpetual') || c.includes('derivative')) return 'Open and close one small hedge each week and keep the margin topped up.';
  if (c.includes('prediction')) return 'Settle one small market position each week and keep the balance funded.';
  if (c.includes('curator') || c.includes('allocator')) return 'Top up the vault or move between its strategies once a month.';
  if (c.includes('stable')) return 'Mint or redeem a small amount of the stable asset once a month.';
  if (c.includes('rwa')) return 'Check the yield accrual once a month and compound it where the protocol allows.';
  if (c.includes('insurance')) return 'Review the cover once a month and renew or adjust it before it expires.';
  return 'Make one qualifying action each week, such as a deposit, a swap or a vote.';
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(p);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: `about $${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * Farm economics, derived from the fitted implied value. The airdrop is
 * assumed to be airdrop_pct of the implied value, shared by TVL, with an
 * activity boost for a hands-on farmer; gas is the cost of the first tx,
 * the setup, and one small tx a week; hands-on time is the steps' own
 * minutes. The verdict follows the $/hour.
 */
export function farmEconomics(
  p: SnapshotProtocol,
  impliedUsd: number,
  age: number | null,
  model: ModelConstants = MODEL,
): FarmEconomics {
  const capital = capitalFor(p);
  const holdDays = holdDaysFor(age);
  const weeks = Math.ceil(holdDays / 7);
  const gas = gasFor(p);
  const gasTotal = model.gas_first_tx_usd + gas + gas * weeks;
  const expected = impliedUsd * model.airdrop_pct * (capital / p.tvl_usd) * model.activity_boost;
  const net = expected - gasTotal;
  const handsHours = (35 + 10 * weeks) / 60;
  const usdPerHour = net / handsHours;
  const verdict =
    usdPerHour >= model.farm_usd_per_hour ? 'Farm'
    : usdPerHour >= model.marginal_usd_per_hour ? 'Marginal'
    : 'Skip';
  return {
    capital_usd: capital,
    hold_days: holdDays,
    weeks,
    expected_usd: expected,
    gas_usd: gasTotal,
    net_usd: net,
    hands_hours: handsHours,
    usd_per_hour: usdPerHour,
    verdict,
  };
}

// -------------------------------------------------------------------- board

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const live = snapshot.protocols.filter(isFittable).sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const { alpha, beta } = fitSizeCurve(live);
  const family = fitFamilyOffsets(live, alpha, beta, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen. Protocols above the floor that the watchlist
  // leaves out are wrapped, staked or bridged products of a token that already trades, so they stay
  // out: ranking them would be ranking Bitcoin or ETH twice.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const terms = fitTerms(p, age, alpha, beta, family, model);
    return { p, age, terms, implied: impliedFromTerms(terms) };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
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
      size_log10: round4(s.terms.size_log10),
      family_offset: round4(s.terms.family_offset),
      family_n: s.terms.family_n,
      growth_multiplier: round4(s.terms.growth_multiplier),
      maturity_multiplier: round4(s.terms.maturity_multiplier),
      breadth_multiplier: round4(s.terms.breadth_multiplier),
      log10_value: round4(s.terms.log10_value),
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
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
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, snapshot: Snapshot): RadarRow {
  const source = snapshot.protocols.find((p) => p.slug === row.slug)!;
  const econ = farmEconomics(source, row.implied_value_usd, row.age_days);
  return {
    rank: row.rank,
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
    size_log10: row.model.size_log10,
    family_offset: row.model.family_offset,
    family_n: row.model.family_n,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    log10_value: row.model.log10_value,
    farm_econ: {
      ...econ,
      expected_usd: Math.round(econ.expected_usd * 100) / 100,
      gas_usd: econ.gas_usd,
      net_usd: Math.round(econ.net_usd * 100) / 100,
      hands_hours: Math.round(econ.hands_hours * 100) / 100,
      usd_per_hour: Math.round(econ.usd_per_hour * 100) / 100,
    },
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const fittable = snapshot.protocols.filter(isFittable).sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const { alpha, beta, residSd } = fitSizeCurve(fittable);
  const familyMap = fitFamilyOffsets(fittable, alpha, beta, model);
  const family: FitFamily[] = [...familyMap.entries()]
    .map(([category, value]) => ({ category, n: value.n, offset: value.offset }))
    .sort((a, b) => (a.category < b.category ? -1 : 1));
  const validation = validateLeaveOneOut(fittable, snapshot.as_of, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    fit: {
      // Full precision on purpose: the dashboard recomputes every row from
      // these figures, and a rounded alpha or beta would move the implied
      // value by dollars. The validation numbers below are display-only,
      // so they are rounded.
      alpha,
      beta,
      n_live: fittable.length,
      resid_sd: Math.round(residSd * 1e4) / 1e4,
      family,
      validation: {
        loo_n: validation.loo_n,
        median_miss: Math.round(validation.median_miss * 100) / 100,
        within_3x: Math.round(validation.within_3x * 1000) / 1000,
        rank_corr: Math.round(validation.rank_corr * 100) / 100,
        baseline_median_miss: Math.round(validation.baseline_median_miss * 100) / 100,
        baseline_within_3x: Math.round(validation.baseline_within_3x * 1000) / 1000,
        baseline_rank_corr: Math.round(validation.baseline_rank_corr * 100) / 100,
      },
    },
    fit_points: fittable.map((p) => ({
      slug: p.slug,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
    })),
    watchlist: [...snapshot.watchlist],
    rows: board.map((row) => radarRow(row, snapshot)),
    live,
  };
  return { board, radar };
}

// -------------------------------------------------------------------- input

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
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
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
