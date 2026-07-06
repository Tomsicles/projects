"""Renders a backtest result: console summary table, equity PNG, trades CSV."""

import csv
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # headless-safe; CLI saves a PNG rather than showing a window
import matplotlib.pyplot as plt
from rich.console import Console
from rich.table import Table

from backtester.engine.simulator import BacktestResult
from backtester.reporting.metrics import Metrics, compute_metrics

console = Console()


def print_summary(result: BacktestResult, metrics: Metrics | None = None) -> Metrics:
    metrics = metrics or compute_metrics(result)

    table = Table(title="Backtest Summary")
    table.add_column("Metric")
    table.add_column("Value", justify="right")
    table.add_row("Total return", f"{metrics.total_return_pct:.2f}%")
    table.add_row("Sharpe ratio", f"{metrics.sharpe:.2f}")
    table.add_row("Max drawdown", f"{metrics.max_drawdown_pct:.2f}%")
    table.add_row("Win rate", f"{metrics.win_rate_pct:.2f}%")
    table.add_row("Number of trades", str(metrics.num_trades))
    console.print(table)

    if metrics.per_ticker_pnl:
        per_ticker = Table(title="Per-Ticker P&L")
        per_ticker.add_column("Ticker")
        per_ticker.add_column("P&L", justify="right")
        for ticker, pnl in sorted(metrics.per_ticker_pnl.items(), key=lambda kv: -kv[1]):
            per_ticker.add_row(ticker, f"{pnl:,.2f}")
        console.print(per_ticker)

    if result.skipped_tickers:
        console.print(f"[yellow]Skipped tickers (no data or strategy error): "
                       f"{', '.join(result.skipped_tickers)}[/yellow]")

    return metrics


def save_equity_curve(result: BacktestResult, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "equity_curve.png"

    fig, ax = plt.subplots(figsize=(10, 5))
    result.equity_curve.dropna().plot(ax=ax)
    ax.set_title("Equity Curve")
    ax.set_xlabel("Date")
    ax.set_ylabel("Equity")
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)
    return path


def save_trades_csv(result: BacktestResult, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "trades.csv"

    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["ticker", "entry_date", "entry_price", "exit_date", "exit_price", "shares", "pnl", "return_pct"])
        for trade in result.trades:
            writer.writerow([
                trade.ticker, trade.entry_date, trade.entry_price,
                trade.exit_date, trade.exit_price, trade.shares,
                f"{trade.pnl:.2f}", f"{trade.return_pct * 100:.2f}",
            ])
    return path
