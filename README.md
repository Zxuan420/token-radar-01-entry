# Token Radar 01 — Entry Module

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Zxuan420/token-radar-01-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Zxuan420/token-radar-01-entry/reward.svg)](https://make.fun/bounty/token-radar-01/reward?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar 01 is an autonomous evaluation engine and dashboard generator designed to uncover and rank high-potential pre-token decentralized protocols across multiple blockchain ecosystems. Built specifically for Node 22 using standard library modules only, it processes sealed DefiLlama snapshots deterministically without external network requests.

## The Radar-2 Valuation Model

Implied value is computed using a multi-factor formula that accounts for total value locked (TVL), 7-day growth trajectory, protocol maturity (age since listing), multi-chain deployment breadth, and category-specific utility weighting:

- **Base Valuation:** `tvl_usd * 0.25`
- **Growth Multiplier:** `1 + (clamp(change_7d, -60, 120) / 100) * 0.5`
- **Maturity Multiplier:** `0.6 + (min(age_days, 1095) / 1095) * 0.4` (defaulting to 365 days if unknown)
- **Chain Multiplier:** `1.0 + min(0.25, max(0, chains.length - 1) * 0.05)`
- **Category Multiplier:** Custom multipliers ranging from 1.0 to 1.15 based on core protocol vertical (Lending, CDP, Staking, DEX, Derivatives, etc.)
- **Final Implied Value:** `max(1, round(base * growthMult * maturityMult * chainMult * catMult))`

## Repository Structure

- `main.ts`: CLI entrypoint handling snapshot ingestion, model scoring, artifact compilation, asset copying, and dossier creation.
- `lib/model.ts`: Core valuation formulas, filtering logic, and rich multi-step farm action generators tailored by protocol category.
- `dashboard/`: Static web application (HTML, CSS, JS) featuring advanced filtering, sorting, model inspection drawers, and CSV data export.
- `vendor/makefun-board.ts`: Sealed verification library for generating standardized evaluation dossiers.
- `screenshots/`: Visual verification artifacts (board overview, protocol detail view, filtered view).

## Running the Radar

To execute the radar engine and generate output artifacts in a local directory:

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

## Verification & Compliance

Outputs are fully deterministic: running the engine twice against the same snapshot produces identical byte output (`diff -r` test passes). All constraints including zero network requests, exact board length (226 rows), and strict rank ordering are enforced by automated gate validation checks.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
