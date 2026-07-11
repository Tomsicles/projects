"""End-to-end test: fake tickers, mocked data source, through the real
strategy -> simulator -> metrics -> report pipeline. No live network calls."""

from pathlib import Path

import pandas as pd
import pytest

from backtester.engine.simulator import run_backtest
from backtester.reporting.metrics import compute_metrics
from backtester.reporting.report import save_equity_curve, save_trades_csv
from backtester.strategies.kama_momentum import KamaMomentumStrategy
from backtester.strategies.sma_crossover import SmaCrossoverStrategy


def _fake_bars(ticker_trend: dict[str, list[float]]) -> dict[str, pd.DataFrame]:
    bars = {}
    for ticker, closes in ticker_trend.items():
        idx = pd.date_range("2024-01-01", periods=len(closes), freq="D")
        bars[ticker] = pd.DataFrame({
            "open": closes, "high": closes, "low": closes, "close": closes,
            "volume": [1000] * len(closes),
        }, index=idx)
    return bars


def test_end_to_end_pipeline_produces_expected_report_shape(tmp_path: Path):
    # FAKE_UP trends upward (SMA crossover should go long and stay long).
    # FAKE_FLAT stays flat (should never trigger a crossover).
    bars = _fake_bars({
        "FAKE_UP.SI": [10 + i * 0.5 for i in range(40)],
        "FAKE_FLAT.SI": [10.0] * 40,
    })

    strategy = SmaCrossoverStrategy(fast=3, slow=10)
    result = run_backtest(bars, strategy, starting_cash=100_000, size_per_trade=10_000)
    metrics = compute_metrics(result)

    assert result.skipped_tickers == []
    assert metrics.num_trades >= 1
    assert "FAKE_UP.SI" in metrics.per_ticker_pnl or metrics.num_trades == 0

    png_path = save_equity_curve(result, tmp_path)
    csv_path = save_trades_csv(result, tmp_path)
    assert png_path.exists()
    assert csv_path.exists()
    assert csv_path.read_text().splitlines()[0].startswith("ticker,")


def test_end_to_end_pipeline_with_kama_strategy(tmp_path: Path):
    bars = _fake_bars({"FAKE_UP.SI": [10 + i * 0.5 for i in range(40)]})

    strategy = KamaMomentumStrategy(period=5, fast=2, slow=10)
    result = run_backtest(bars, strategy, starting_cash=100_000, size_per_trade=10_000)
    metrics = compute_metrics(result)

    assert result.skipped_tickers == []
    assert metrics.num_trades >= 1

    png_path = save_equity_curve(result, tmp_path)
    csv_path = save_trades_csv(result, tmp_path)
    assert png_path.exists()
    assert csv_path.exists()
