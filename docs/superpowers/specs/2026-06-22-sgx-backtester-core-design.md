# SGX Backtester — Core Engine Design

Status: approved
Date: 2026-06-22

## Context

This is the first of several planned subsystems for a broader SGX trading-research
toolkit. The full vision includes:

1. **Backtester core engine** (this spec)
2. Hybrid/custom indicator design (future spec)
3. News search → stock impact analysis (future spec)
4. "Opposite stock" finder — inverse-correlated pair for hedge/buy-the-dip plays (future spec)

Items 2-4 are independent subsystems and will each get their own design spec. They
plug into the backtester core as additional strategies/signals once it exists.

## Goals

- Build a from-scratch Python backtesting engine for SGX stocks, supporting both
  daily and intraday bar granularity.
- Support multi-stock universes per run (not just single-ticker), with realistic
  shared-cash accounting (can't double-spend the same capital across simultaneous
  signals on different tickers).
- Pluggable strategy interface so future hybrid/custom indicators (subsystem 2) can
  be added without touching the engine.
- MVP ships with 2 baseline strategies (SMA crossover, RSI threshold) to prove the
  engine end-to-end.
- Data sourced from the moomoo (Futu) OpenAPI via the OpenD gateway. Moomoo account
  + OpenD setup is a prerequisite/dependency for this project but is out of scope
  for this spec (no API access exists yet as of this writing).

## Non-goals (for this spec)

- Hybrid/custom indicator design — separate future spec.
- News search and sentiment signals — separate future spec.
- Inverse-correlation "opposite stock" finder — separate future spec.
- Live/paper trading execution — backtesting only.
- Portfolio optimization across strategies — single strategy per run for now.

## Architecture

Four loosely-coupled layers:

- **Data layer** — pulls OHLCV bars (daily + intraday) from the moomoo OpenAPI,
  caches locally (parquet) so backtests don't re-fetch every run.
- **Strategy/indicator layer** — pluggable interface: any strategy is a function
  `generate_signals(df) -> entries/exits`. MVP ships SMA-crossover and RSI-threshold.
  Future hybrid indicators are just new strategies implementing the same interface.
- **Backtest engine** — given `{ticker universe, date range, strategy, fixed $ per
  trade}`, simulates trades bar-by-bar across the whole universe and tracks
  positions/P&L per ticker.
- **Results/reporting layer** — aggregates trades into equity curve, win rate, max
  drawdown, per-ticker breakdown; exports to CSV/plot.

The engine only consumes a standard OHLCV DataFrame — it has no knowledge of
moomoo specifics, so the data source can be swapped later without touching the
engine or strategies.

## Components

```
backtester/
  data/
    moomoo_client.py      # OpenD gateway wrapper, fetch + cache OHLCV
    cache/                # parquet files per ticker+timeframe
  strategies/
    base.py               # Strategy interface: generate_signals(df) -> entries/exits
    sma_crossover.py
    rsi_threshold.py
  engine/
    simulator.py          # bar-by-bar loop, position tracking, fixed-$ sizing
    portfolio.py          # tracks open positions, cash, P&L per ticker
  reporting/
    metrics.py            # sharpe, win rate, max drawdown, equity curve
    report.py             # csv/plot export
  run_backtest.py         # CLI entrypoint: ticker list, date range, strategy, params
```

Each strategy is an isolated file implementing the same interface, so strategies
can be swapped or added without touching the engine.

## Data flow

```
run_backtest.py
  → moomoo_client: fetch bars for ticker list (daily + intraday), cache to parquet
  → for each ticker: load cached df → strategy.generate_signals(df) → entries/exits
  → simulator: walk bars chronologically across all tickers, on signal open/close
    position @ fixed $ size, log trade
  → portfolio: tracks cash + per-ticker running P&L
  → metrics: compute equity curve, sharpe, max drawdown, win rate, per-ticker breakdown
  → report: print summary table + save equity curve plot + trades CSV
```

Multi-ticker bars are merged into a single chronological event stream so capital
is shared realistically across the whole universe.

## Error handling

- moomoo OpenD gateway down/unreachable → clear error, abort fetch; don't silently
  fall back to stale cache unless `--allow-stale` flag is passed.
- Missing bars / gaps in data → forward-fill small gaps (≤3 bars); otherwise skip
  the ticker for that period with a logged warning.
- Insufficient cash for a signal (fixed-$ sizing exceeds remaining capital) → skip
  the trade, log a warning, don't crash the run.
- Strategy throws on a ticker → catch, log, skip that ticker, continue with the
  rest of the universe.

## Testing

- Unit tests per strategy (SMA crossover, RSI threshold) against synthetic price
  series with hand-computed expected signals.
- Unit tests for the simulator: fixed-$ sizing math, cash-constraint skip logic,
  multi-ticker chronological ordering.
- Unit tests for metrics (Sharpe, drawdown, win rate) against known trade logs
  with hand-computed expected values.
- Integration test: small synthetic universe (2-3 fake tickers, a few weeks of
  fabricated bars) run end-to-end through the CLI; assert report output shape.
  No live moomoo calls in tests — mock the client.

## Dependencies / open items

- Moomoo account + OpenD gateway setup is required before the data layer can be
  implemented against a real source; not covered by this spec.
- Position sizing for MVP is fixed-$ per trade (e.g. configurable constant); %-of-
  portfolio sizing may be considered later but is out of scope here.

## Workflow note

Per user instruction: use Opus for the planning/outline phase (writing-plans) and
Sonnet for execution of the implementation plan.
