// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the watchlist floor: the early rows (260 early rows + 40 watchlist = 300 rows total)
// the radar exists to find. A protocol is pre-token when its index entry records no token (no market cap,
// no CoinGecko id, no symbol); live-token protocols are kept apart in a dedicated view.
//
// Implied value (radar-2 model) is derived from snapshot figures:
//
//   base       = tvl_usd x BASE_MULTIPLE
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   chainMult  = 1.0 + min(0.25, max(0, chains.length - 1) x 0.05)
//   catMult    = category-based utility multiplier (1.15 for lending/staking/cdp, 1.10 for dexs/derivatives, 1.05 for bridge, 1.0 otherwise)
//   implied    = max(1, round(base x growthMult x maturityMult x chainMult x catMult))

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_bonus_per_chain: number;
  chain_bonus_cap: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_bonus_per_chain: 0.05,
  chain_bonus_cap: 0.25,
};

export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL (260 early + 40 watchlist = 300 rows). */
export const EARLY_ROWS = 260;

export const LIVE_ROWS = 24;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

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
  watchlist: boolean;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    category_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

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
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  category_multiplier: number;
  watchlist: boolean;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

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
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

function categoryMultiplier(category: string | null): number {
  if (!category) return 1.0;
  const c = category.toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('staking') || c.includes('restak')) return 1.15;
  if (c.includes('dex') || c.includes('yield') || c.includes('derivative') || c.includes('perpetual') || c.includes('options')) return 1.10;
  if (c.includes('bridge') || c.includes('cross chain')) return 1.05;
  return 1.0;
}

export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; catMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = 1.0 + Math.min(model.chain_bonus_cap, Math.max(0, protocol.chains.length - 1) * model.chain_bonus_per_chain);
  const catMult = categoryMultiplier(protocol.category);
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult * catMult));
  return { implied, growthPct, growthMult, maturityMult, chainMult, catMult, age };
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const watchlistSet = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, chainMult, catMult, age } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, growthPct, growthMult, maturityMult, chainMult, catMult, age };
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
    watchlist: watchlistSet.has(s.p.slug),
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      category_multiplier: round4(s.catMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function dexSteps(p: SnapshotProtocol, capital: number, chain: string, hold: number): FarmStep[] {
  return [
    {
      text: `Prepare a dedicated non-custodial EVM wallet initialized exclusively with native gas token and capital allocated for liquidity provision on ${p.name}.`,
      cost: 'under $3 gas initialization fee',
      time: '5 minutes setup',
    },
    {
      text: `Acquire balanced amounts of token pairs matching the target pool on ${chain}, then deposit $${capital} into ${p.name}'s automated market maker pools.`,
      cost: `$${capital} principal + $8 estimated pool deposit gas fee`,
      time: '15 minutes transaction',
    },
    {
      text: `Stake the received LP (liquidity provider) tokens into the active farming contract on ${p.name} to start accumulating incentive rewards.`,
      cost: 'about $4 gas fee for staking transaction',
      time: '10 minutes execution',
    },
    {
      text: `Monitor impermanent loss and pool depth bi-weekly, harvesting accrued yield rewards and compounding them back into the liquidity position.`,
      cost: '$2 to $3 per harvest gas fee',
      time: '10 minutes bi-weekly',
    },
    {
      text: `Maintain the liquidity position across ${p.name} for at least ${hold} consecutive days to satisfy multi-epoch airdrop qualification criteria.`,
      cost: `$${capital} total capital locked in liquidity`,
      time: `${hold} days retention period`,
    },
    {
      text: `Unstake LP tokens and withdraw underlying assets through the official interface without interacting with unverified external contracts.`,
      cost: 'about $5 total withdrawal and swap gas',
      time: '10 minutes finalization',
    },
  ];
}

function lendingSteps(p: SnapshotProtocol, capital: number, chain: string, hold: number): FarmStep[] {
  return [
    {
      text: `Set up a secure hardware-backed or isolated burner wallet containing native gas assets and stablecoins destined for lending markets on ${p.name}.`,
      cost: 'under $3 initialization gas cost',
      time: '5 minutes setup',
    },
    {
      text: `Deposit $${capital} of high-quality collateral (USDC or ETH) into ${p.name} money markets on ${chain} to earn baseline supply interest.`,
      cost: `$${capital} capital + $7 gas fee for deposit approval`,
      time: '15 minutes deposit',
    },
    {
      text: `Borrow a conservative amount (under 40% LTV) of secondary assets against your collateral on ${p.name} to establish active borrower standing.`,
      cost: 'about $5 borrowing transaction gas fee',
      time: '10 minutes execution',
    },
    {
      text: `Maintain health factor above 2.0 at all times by monitoring collateral price volatility and repaying borrowed debt incrementally if needed.`,
      cost: '$2 monitoring gas per adjustment',
      time: '5 minutes weekly check',
    },
    {
      text: `Keep the lending and borrowing positions open on ${p.name} continuously for at least ${hold} days across multiple snapshot periods.`,
      cost: `$${capital} collateral locked in protocol`,
      time: `${hold} days retention span`,
    },
    {
      text: `Repay outstanding borrowed debt in full, claim supplied principal with accrued interest, and verify zero remaining liabilities.`,
      cost: 'about $6 repayment and withdrawal gas',
      time: '10 minutes settlement',
    },
  ];
}

function bridgeSteps(p: SnapshotProtocol, capital: number, chain: string, hold: number): FarmStep[] {
  const destChain = chain.toLowerCase().includes('arbitrum') ? 'Optimism' : 'Arbitrum';
  return [
    {
      text: `Fund a clean wallet with $${capital} in stablecoins and enough native tokens on ${chain} to cover cross-chain transaction routing fees.`,
      cost: 'under $3 starting gas fee',
      time: '5 minutes setup',
    },
    {
      text: `Execute a cross-chain transfer of $${capital} through ${p.name} from ${chain} to ${destChain} utilizing their official messaging router.`,
      cost: `$${capital} transferred + $12 cross-chain bridge fee`,
      time: '20 minutes finality wait',
    },
    {
      text: `Perform at least one complementary token swap on the destination chain using ${p.name} liquidity to ensure complete feature interaction.`,
      cost: 'about $4 destination swap gas fee',
      time: '10 minutes execution',
    },
    {
      text: `Bridge a portion of the funds back to the origin chain after holding for a few days to demonstrate bidirectional protocol utilization.`,
      cost: 'about $10 return bridge and gas fee',
      time: '15 minutes routing',
    },
    {
      text: `Retain transaction hashes and activity logs securely for ${hold} days in case retroactive governance distributions review history.`,
      cost: 'no monetary cost',
      time: '5 minutes documentation',
    },
  ];
}

function yieldSteps(p: SnapshotProtocol, capital: number, chain: string, hold: number): FarmStep[] {
  return [
    {
      text: `Initialize an isolated wallet with native chain gas and stablecoin or liquid asset capital designated for automated strategies on ${p.name}.`,
      cost: 'under $3 gas initialization',
      time: '5 minutes setup',
    },
    {
      text: `Deposit $${capital} into an optimized compounding vault or strategy managed by ${p.name} on ${chain} to receive receipt share tokens.`,
      cost: `$${capital} principal + $8 vault deposit gas`,
      time: '15 minutes deposit',
    },
    {
      text: `Verify that strategy compound triggers and fee tiers operate correctly by inspecting vault performance metrics on-chain.`,
      cost: 'about $2 inspection gas',
      time: '10 minutes review',
    },
    {
      text: `Hold vault receipt shares in your wallet continuously for at least ${hold} days without withdrawing principal.`,
      cost: `$${capital} locked in yield strategy`,
      time: `${hold} days holding period`,
    },
    {
      text: `Withdraw principal and accumulated yield shares through ${p.name} vault interface and verify token return accuracy.`,
      cost: 'about $6 withdrawal gas fee',
      time: '10 minutes settlement',
    },
  ];
}

function derivativesSteps(p: SnapshotProtocol, capital: number, chain: string, hold: number): FarmStep[] {
  return [
    {
      text: `Fund a dedicated trading wallet with margin collateral and gas assets on ${chain} designated for perpetual or options trading on ${p.name}.`,
      cost: 'under $3 initialization gas',
      time: '5 minutes setup',
    },
    {
      text: `Deposit $${capital} of margin collateral into ${p.name} margin account contract and open a modest leveraged position (2x to 3x).`,
      cost: `$${capital} margin + $7 position opening gas`,
      time: '15 minutes execution',
    },
    {
      text: `Manage margin health actively, collecting trading rewards or rebates if offered by ${p.name} governance incentive programs.`,
      cost: '$3 funding and management gas',
      time: '10 minutes weekly check',
    },
    {
      text: `Keep trading activity active on ${p.name} across at least ${hold} days with regular volume milestones.`,
      cost: `$${capital} margin collateral maintained`,
      time: `${hold} days trading duration`,
    },
    {
      text: `Close open perpetual positions, withdraw remaining margin capital from ${p.name}, and verify settlement balances.`,
      cost: 'about $5 position closure gas',
      time: '10 minutes settlement',
    },
  ];
}

function cdpSteps(p: SnapshotProtocol, capital: number, chain: string, hold: number): FarmStep[] {
  return [
    {
      text: `Prepare a secure non-custodial wallet with ETH or liquid collateral and native gas tokens for minting operations on ${p.name}.`,
      cost: 'under $3 initialization gas',
      time: '5 minutes setup',
    },
    {
      text: `Deposit $${capital} worth of collateral into a new vault on ${p.name} on ${chain} and mint synthetic stablecoins conservatively.`,
      cost: `$${capital} collateral + $9 minting gas fee`,
      time: '15 minutes vault creation',
    },
    {
      text: `Stake the minted synthetic stablecoins in ${p.name} stability modules or secondary yield pools to earn protocol emission rewards.`,
      cost: 'about $4 staking transaction gas',
      time: '10 minutes execution',
    },
    {
      text: `Maintain vault collateralization ratio well above liquidation thresholds for at least ${hold} days across market cycles.`,
      cost: '$2 monitoring gas per adjustment',
      time: `${hold} days retention span`,
    },
    {
      text: `Unstake synthetic tokens, repay minted debt plus stability fees, and withdraw original collateral from ${p.name}.`,
      cost: 'about $8 debt repayment and withdrawal gas',
      time: '15 minutes closure',
    },
  ];
}

function restakingSteps(p: SnapshotProtocol, capital: number, chain: string, hold: number): FarmStep[] {
  return [
    {
      text: `Initialize a clean participant wallet with liquid staked tokens or native staking assets and gas funds for ${p.name}.`,
      cost: 'under $3 initialization gas',
      time: '5 minutes setup',
    },
    {
      text: `Deposit $${capital} of liquid staked assets into ${p.name} restaking contracts on ${chain} to secure active validation services.`,
      cost: `$${capital} restaked assets + $8 deposit gas`,
      time: '15 minutes restaking',
    },
    {
      text: `Delegate restaked shares to active node operators supporting decentralized verification networks within ${p.name} ecosystem.`,
      cost: 'about $4 delegation gas fee',
      time: '10 minutes execution',
    },
    {
      text: `Hold restaked positions continuously for at least ${hold} days to accumulate points and protocol loyalty multiplier bonuses.`,
      cost: `$${capital} assets locked in restaking`,
      time: `${hold} days holding duration`,
    },
    {
      text: `Initiate unstaking requests through ${p.name} portal, wait out unbonding periods, and claim withdrawn principal securely.`,
      cost: 'about $7 unbonding withdrawal gas',
      time: '15 minutes request plus unbonding delay',
    },
  ];
}

function rwaSteps(p: SnapshotProtocol, capital: number, chain: string, hold: number): FarmStep[] {
  return [
    {
      text: `Complete necessary KYC or eligibility verification steps required by ${p.name} compliance framework using a secure wallet.`,
      cost: 'zero fees for compliance check',
      time: '20 minutes verification',
    },
    {
      text: `Fund wallet with $${capital} in approved stablecoins and network gas for subscription transactions on ${chain}.`,
      cost: 'under $3 gas preparation',
      time: '5 minutes setup',
    },
    {
      text: `Subscribe to tokenized yield-bearing real-world asset tranches through ${p.name} investment portal.`,
      cost: `$${capital} investment + $10 subscription gas`,
      time: '15 minutes transaction',
    },
    {
      text: `Hold tokenized RWA positions in your wallet continuously for at least ${hold} days while receiving yield distributions.`,
      cost: `$${capital} principal invested in RWA`,
      time: `${hold} days retention period`,
    },
    {
      text: `Redeem tokenized assets back into stablecoins through official ${p.name} redemption mechanism when maturity is reached.`,
      cost: 'about $8 redemption gas fee',
      time: '15 minutes settlement',
    },
  ];
}

function generalSteps(p: SnapshotProtocol, capital: number, chain: string, hold: number): FarmStep[] {
  return [
    {
      text: `Initialize a dedicated burner wallet holding only transaction gas and budgeted capital for interacting with ${p.name}.`,
      cost: 'under $3 gas initialization fee',
      time: '5 minutes setup',
    },
    {
      text: `Deposit $${capital} of capital into ${p.name} core smart contracts on ${chain} and complete initial onboarding actions.`,
      cost: `$${capital} capital + $7 estimated gas fee`,
      time: '15 minutes setup',
    },
    {
      text: `Perform recurring weekly interactions such as claiming rewards, voting on governance polls, or rebalancing positions.`,
      cost: 'about $3 in weekly gas fees',
      time: '10 minutes weekly',
    },
    {
      text: `Maintain active protocol interaction continuously for at least ${hold} days to satisfy snapshot epoch duration rules.`,
      cost: `$${capital} principal locked in protocol`,
      time: `${hold} days retention period`,
    },
    {
      text: `Verify eligibility strictly through official ${p.name} channels and audited links without clicking external promotional ads.`,
      cost: 'zero fees for checking',
      time: '10 minutes review',
    },
    {
      text: `Document wallet addresses, entry timestamps, transaction hashes, and exit plans thoroughly in a local activity log.`,
      cost: 'no monetary cost',
      time: '5 minutes logging',
    },
  ];
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const c = (p.category ?? '').toLowerCase();
  
  let rawSteps: FarmStep[];
  if (c.includes('dex') || c.includes('yield') || c.includes('liquidity')) {
    rawSteps = dexSteps(p, capital, chain, hold);
  } else if (c.includes('lend') || c.includes('collateral')) {
    rawSteps = lendingSteps(p, capital, chain, hold);
  } else if (c.includes('bridge') || c.includes('cross chain')) {
    rawSteps = bridgeSteps(p, capital, chain, hold);
  } else if (c.includes('vault') || c.includes('allocator') || c.includes('curator')) {
    rawSteps = yieldSteps(p, capital, chain, hold);
  } else if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    rawSteps = derivativesSteps(p, capital, chain, hold);
  } else if (c.includes('cdp') || c.includes('stable')) {
    rawSteps = cdpSteps(p, capital, chain, hold);
  } else if (c.includes('restak') || c.includes('staking')) {
    rawSteps = restakingSteps(p, capital, chain, hold);
  } else if (c.includes('rwa')) {
    rawSteps = rwaSteps(p, capital, chain, hold);
  } else {
    rawSteps = generalSteps(p, capital, chain, hold);
  }
  return rawSteps;
}

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

export function radarRow(row: BoardRow): RadarRow {
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
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    category_multiplier: row.model.category_multiplier,
    watchlist: row.watchlist,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
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
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

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

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
