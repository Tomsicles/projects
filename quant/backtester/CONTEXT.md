# CONTEXT.md

Background and rationale for the `backtester/` subproject. See
`../docs/superpowers/specs/2026-06-22-sgx-backtester-core-design.md` for the full
technical design — this file covers the "why," not the "how."

## Why this exists

The original idea was broader than a backtester alone: combine/hybridize
indicators (or invent new ones), factor in news that moves a stock, and find a
stock's inverse-correlated counterpart to buy when its pair crashes. All of that
needs a way to test strategies against historical SGX data before trusting them
— that's this subproject.

This is deliberately scoped as the **first of four** pieces:

1. **Backtester core engine** (this folder) — built first, everything else plugs
   into it.
2. Hybrid/custom indicator design — future subproject.
3. News search → stock impact analysis — future subproject.
4. Inverse-correlated "opposite stock" finder — future subproject.

Building the core engine first means strategies 2-4 each become a pluggable
strategy/signal tested through the same engine, instead of three one-off scripts
with no shared way to evaluate whether they actually work.

## What success looks like

- Can run a strategy across a multi-stock SGX universe (not just one ticker at a
  time) and get back trustworthy P&L, win rate, drawdown, and equity curve.
- Adding a new strategy (including future hybrid indicators) means writing one
  new file against the existing strategy interface — no engine changes required.
- The engine doesn't care where price data comes from, so swapping the data
  source later (e.g. away from moomoo) doesn't touch engine or strategy code.
