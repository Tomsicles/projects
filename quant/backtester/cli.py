"""Friendly CLI: guided interactive prompts when run with no args, flags for
power users.

  python -m backtester.run_backtest
  python -m backtester.run_backtest --tickers D05.SI,O39.SI --strategy sma \\
      --fast 20 --slow 50 --start 2023-01-01 --end 2024-01-01 \\
      --capital 100000 --size 10000
"""

import argparse
import sys
from pathlib import Path

import questionary

from backtester.data.yfinance_source import YFinanceDataSource
from backtester.engine.simulator import run_backtest
from backtester.reporting.metrics import compute_metrics
from backtester.reporting.report import print_summary, save_equity_curve, save_trades_csv
from backtester.strategies.kama_momentum import KamaMomentumStrategy
from backtester.strategies.rsi_threshold import RsiThresholdStrategy
from backtester.strategies.sma_crossover import SmaCrossoverStrategy
from backtester.universe import STI_WATCHLIST, is_valid_si_ticker

OUTPUT_DIR = Path(__file__).parent / "output"

STRATEGY_CHOICES = {"sma": "SMA crossover", "rsi": "RSI threshold", "kama": "KAMA momentum"}
INTERVAL_CHOICES = {
    "1d": "Daily (recommended, full history)",
    "1h": "1 hour (yfinance limits history to ~2 years)",
    "15m": "15 min (yfinance limits history to ~60 days)",
    "5m": "5 min (yfinance limits history to ~60 days)",
}


def build_strategy(name: str, **params):
    if name == "sma":
        return SmaCrossoverStrategy(
            fast=int(params.get("fast", 20)),
            slow=int(params.get("slow", 50)),
        )
    if name == "rsi":
        return RsiThresholdStrategy(
            period=int(params.get("period", 14)),
            oversold=float(params.get("oversold", 30)),
            overbought=float(params.get("overbought", 70)),
        )
    if name == "kama":
        return KamaMomentumStrategy(
            period=int(params.get("kama_period", 10)),
            fast=int(params.get("kama_fast", 2)),
            slow=int(params.get("kama_slow", 30)),
        )
    raise ValueError(f"Unknown strategy: {name}")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SGX backtester")
    parser.add_argument("--tickers", help="comma-separated .SI tickers, e.g. D05.SI,O39.SI")
    parser.add_argument("--strategy", choices=STRATEGY_CHOICES, help="strategy to run")
    parser.add_argument("--start", help="start date YYYY-MM-DD")
    parser.add_argument("--end", help="end date YYYY-MM-DD")
    parser.add_argument("--interval", default="1d", choices=INTERVAL_CHOICES)
    parser.add_argument("--capital", type=float, default=100_000)
    parser.add_argument("--size", type=float, default=10_000, help="fixed $ per trade")
    parser.add_argument("--fast", type=int, default=20, help="SMA fast period")
    parser.add_argument("--slow", type=int, default=50, help="SMA slow period")
    parser.add_argument("--period", type=int, default=14, help="RSI period")
    parser.add_argument("--oversold", type=float, default=30)
    parser.add_argument("--overbought", type=float, default=70)
    parser.add_argument("--kama-period", type=int, default=10, help="KAMA efficiency-ratio period")
    parser.add_argument("--kama-fast", type=int, default=2, help="KAMA fast EMA period bound")
    parser.add_argument("--kama-slow", type=int, default=30, help="KAMA slow EMA period bound")
    parser.add_argument("--no-cache", action="store_true", help="bypass the local data cache")
    return parser.parse_args(argv)


def run_guided_prompts() -> dict:
    print("SGX Backtester — guided setup. Press Ctrl+C anytime to cancel.\n")

    watchlist_choices = [f"{t} — {name}" for t, name in STI_WATCHLIST.items()]
    picked = questionary.checkbox(
        "Pick tickers from the STI watchlist (space to select, enter to confirm):",
        choices=watchlist_choices,
    ).ask()
    if picked is None:
        sys.exit(1)
    tickers = [p.split(" — ")[0] for p in picked]

    custom = questionary.text(
        "Add any custom .SI tickers? (comma-separated, or leave blank):"
    ).ask()
    if custom:
        for t in (t.strip().upper() for t in custom.split(",") if t.strip()):
            if not is_valid_si_ticker(t):
                print(f"Skipping '{t}': doesn't look like a valid .SI ticker.")
                continue
            tickers.append(t)

    if not tickers:
        print("No tickers selected — nothing to backtest.")
        sys.exit(1)

    start = questionary.text("Start date (YYYY-MM-DD):", default="2022-01-01").ask()
    end = questionary.text("End date (YYYY-MM-DD):", default="2024-01-01").ask()
    interval = questionary.select(
        "Bar interval:",
        choices=[f"{k} — {v}" for k, v in INTERVAL_CHOICES.items()],
    ).ask()
    interval = interval.split(" — ")[0]

    strategy_label = questionary.select(
        "Strategy:", choices=[f"{k} — {v}" for k, v in STRATEGY_CHOICES.items()]
    ).ask()
    strategy_key = strategy_label.split(" — ")[0]

    params = {}
    if strategy_key == "sma":
        params["fast"] = questionary.text("Fast SMA period:", default="20").ask()
        params["slow"] = questionary.text("Slow SMA period:", default="50").ask()
    elif strategy_key == "rsi":
        params["period"] = questionary.text("RSI period:", default="14").ask()
        params["oversold"] = questionary.text("Oversold threshold (enter long below this):", default="30").ask()
        params["overbought"] = questionary.text("Overbought threshold (exit above this):", default="70").ask()
    else:
        params["kama_period"] = questionary.text("KAMA period:", default="10").ask()
        params["kama_fast"] = questionary.text("KAMA fast bound:", default="2").ask()
        params["kama_slow"] = questionary.text("KAMA slow bound:", default="30").ask()

    capital = questionary.text("Starting capital ($):", default="100000").ask()
    size = questionary.text("Fixed $ per trade:", default="10000").ask()

    return {
        "tickers": tickers,
        "strategy": strategy_key,
        "start": start,
        "end": end,
        "interval": interval,
        "capital": float(capital),
        "size": float(size),
        **params,
    }


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv

    if argv:
        args = parse_args(argv)
        if not (args.tickers and args.strategy and args.start and args.end):
            print("--tickers, --strategy, --start and --end are required when using flags.")
            return 1
        config = {
            "tickers": [t.strip().upper() for t in args.tickers.split(",") if t.strip()],
            "strategy": args.strategy,
            "start": args.start,
            "end": args.end,
            "interval": args.interval,
            "capital": args.capital,
            "size": args.size,
            "fast": args.fast,
            "slow": args.slow,
            "period": args.period,
            "oversold": args.oversold,
            "overbought": args.overbought,
            "kama_period": args.kama_period,
            "kama_fast": args.kama_fast,
            "kama_slow": args.kama_slow,
        }
        use_cache = not args.no_cache
    else:
        config = run_guided_prompts()
        use_cache = True

    strategy = build_strategy(config["strategy"], **config)

    source = YFinanceDataSource(use_cache=use_cache)
    bars = {}
    for ticker in config["tickers"]:
        print(f"Fetching {ticker}...")
        bars[ticker] = source.get_bars(ticker, config["start"], config["end"], config["interval"])

    result = run_backtest(
        bars=bars,
        strategy=strategy,
        starting_cash=config["capital"],
        size_per_trade=config["size"],
    )

    metrics = compute_metrics(result)
    print_summary(result, metrics)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    png_path = save_equity_curve(result, OUTPUT_DIR)
    csv_path = save_trades_csv(result, OUTPUT_DIR)
    print(f"\nSaved equity curve to {png_path}")
    print(f"Saved trades to {csv_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
