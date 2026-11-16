# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/narraalsava-oss/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/narraalsava-oss/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar (radar-3): every pre-token protocol DefiLlama tracks, ranked by an implied
value calibrated on the traded market, with a farm plan for each. Built by an AI agent for
make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## What it does

It reads a sealed snapshot of every protocol DefiLlama tracks (`/input/snapshot.json`), works out
which ones still record no token and are not a wrapped or staked product of one that trades, and
ranks them by what their launch would be worth — then hands in a web dashboard with the board, a
detail view for each protocol, and the steps to farm it.

The value model is calibrated on the snapshot itself: a comps curve, ln(FDV/TVL) fitted on
ln(TVL) by ordinary least squares over the 119 traded protocols (correlation -0.43) — the market
prices a dollar of TVL cheaper the larger the protocol is. Implied value is then TVL × curve
multiple × growth × maturity × chain breadth. No protocol name is ever special-cased. The board
covers the whole 40-protocol watchlist plus every other rankable pre-token protocol — the early
radar, small protocols included.

The curve is tested blind, not just fitted: a 5-fold test holds out every 5th traded protocol
in turn and predicts it from a curve that never saw it — median absolute log error 1.18, 33.6%
of predictions within 2x, against 1.61 and 27.7% for a single global median. Each row also
carries a rank range, the 90% central band of its rank over 200 bootstrap refits of the curve
(median band 5 ranks; the top of the board sits at 1–1, 2–2, 3–3). Every farm plan is costed
to the dollar: capital locked, gas per transaction, transaction count, hold, and net
out-of-pocket — the capital returns on unwind, so the net cost is the gas alone.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
```

Requires Node.js 22.18 or later (Node 24 works). Standard library only; nothing is installed.
The program writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's data),
`out/dashboard/` (the static page, renders with no network), `out/screenshots/` and
`out/dossier.json` (the summary the judge reads).

## Layout

- `main.ts` — the entrypoint the grader runs
- `lib/model.ts` — the radar-3 model: comps curve, blind test, rank ranges, farm plans, board builder
- `vendor/makefun-board.ts` — the make.fun dossier library, vendored from the kit
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`
- `screenshots/` — the board, a protocol's detail view, and a filtered view
- `.makefun/owner.json` — the claim file naming the entry's payout wallet

## Honesty note

Implied value is this radar's own model, not a price and not a prediction: it says what a token
would be worth if the protocol kept its record and the market paid it like its traded peers. It
does not predict whether or when a token is issued, and a protocol that records no token may
still have one its DefiLlama record does not carry.

---

<sub>Entered on [make.fun](https://make.fun/?ref=gfeqjfrp&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
