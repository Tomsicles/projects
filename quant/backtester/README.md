# SGX Backtester

Backtests trading strategies across a multi-stock SGX universe. First of four
planned pieces in the broader project — see `CONTEXT.md` for the why, and
`../docs/superpowers/specs/2026-06-22-sgx-backtester-core-design.md` (under `quant/`)
for the full design.

## Install

```
pip install -r backtester/requirements.txt
```

Requires Python 3.11+.

## Run

Guided interactive mode (recommended for first use):

```
python -m backtester.run_backtest
```

Walks through picking tickers (from a built-in STI watchlist, or your own
`.SI` tickers), date range, bar interval, strategy + params, starting capital,
and $ per trade.

Flag mode (for scripting/power users):

```
python -m backtester.run_backtest --tickers D05.SI,O39.SI --strategy sma \
    --fast 20 --slow 50 --start 2023-01-01 --end 2024-01-01 \
    --capital 100000 --size 10000
```

`--strategy rsi` uses `--period`, `--oversold`, `--overbought` instead of
`--fast`/`--slow`.

Either way, output goes to:

- Console: summary table (return, Sharpe, max drawdown, win rate, per-ticker P&L)
- `backtester/output/equity_curve.png`
- `backtester/output/trades.csv`

## Test

```
pytest backtester/tests/
```

Single test:

```
pytest backtester/tests/test_simulator.py::test_simulator_closes_open_position_at_end_of_run
```

Tests use synthetic price series and a mocked data source — no live network
calls or moomoo/yfinance dependency required to run them.

## Data source

Price data comes from `yfinance` today (`backtester/data/yfinance_source.py`),
cached as parquet under `backtester/data/cache/` (gitignored). The engine and
strategies only depend on the `DataSource` interface in
`backtester/data/source.py`, so the moomoo OpenAPI source planned in the design
spec can be swapped in later without touching engine or strategy code.

## Adding a strategy

Implement `backtester/strategies/base.py`'s `Strategy` interface in a new file:
a `generate_signals(df) -> pd.Series` returning 1 (long) / 0 (flat) per bar.
No changes needed elsewhere — this is also how future hybrid/custom indicators
will plug in.
