# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/bsnpg/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/bsnpg/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar (radar-2): 226 pre-token DefiLlama protocols ranked by implied value, priced at each category's live median market-cap-to-TVL, with a concrete farm plan for every row. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## What it does

`main.ts` reads the sealed DefiLlama snapshot (`snapshot.json`), scores every pre-token protocol, and writes the ranked board to `board.json`, the dashboard's data to `data.js`, and `dossier.json` for the judge. The board covers all 40 watchlist protocols plus every rankable pre-token protocol below the $50M floor — 226 rows in all. Live-token protocols are set aside with their market caps, never mixed into the ranking.

## The model (radar-2)

Implied value is priced from the market itself, not a flat guess:

```
implied = round(tvl_usd x comp(category) x growth x maturity x breadth)
```

- **comp(category)** — the median market-cap-to-TVL of the live-token protocols in the same category, read from the snapshot (global median where a category has fewer than 3 live comps, capped at 1.5x). Lending is priced like lending trades; a DEX like DEXes trade.
- **growth** — `1 + clamp(change_7d, -60, 120) / 100 x 0.5`
- **maturity** — `0.6 + min(age_days, 1095) / 1095 x 0.4`, where age is the time since the protocol was first listed with no token (365 days when unlisted)
- **breadth** — `1 + 0.04 x min(chains - 1, 5)`

No protocol name is special-cased: one function scores every row. The dashboard recomputes each row from the same figures, so the page and `board.json` always agree. Farm plans are derived from each protocol's category, chains, TVL and age, with a cost and a time on every step.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

Node 22.18+ (standard library only, nothing to install). In the grader the snapshot is mounted at `/input/snapshot.json` and the output goes to `/output`. Open `out/dashboard/index.html` in a browser — the page renders with no network.

## Layout

- `main.ts` — entrypoint: reads the snapshot, writes `board.json`, `data.js`, `dossier.json`
- `lib/model.ts` — the radar-2 model, the board builder and the farm plans
- `vendor/makefun-board.ts` — make.fun's dossier library
- `dashboard/` — the static page (board, filters, detail view, model panel)
- `screenshots/` — the board, a detail view and a filtered view

---

<sub>Entered on [make.fun](https://make.fun/?ref=26zqsqqz&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
