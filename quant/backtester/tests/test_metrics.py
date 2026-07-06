import pandas as pd
import pytest

from backtester.engine.portfolio import Portfolio, Trade
from backtester.engine.simulator import BacktestResult
from backtester.reporting.metrics import compute_metrics


def _result(equity_values: list[float], trades: list[Trade]) -> BacktestResult:
    idx = pd.date_range("2024-01-01", periods=len(equity_values), freq="D")
    equity_curve = pd.Series(equity_values, index=idx)
    portfolio = Portfolio(starting_cash=equity_values[0])
    portfolio.closed_trades = trades
    return BacktestResult(portfolio=portfolio, equity_curve=equity_curve)


def test_total_return_pct():
    result = _result([100_000, 110_000], trades=[])
    metrics = compute_metrics(result)
    assert metrics.total_return_pct == pytest.approx(10.0)


def test_max_drawdown_pct():
    # Peaks at 120k, troughs at 90k -> drawdown of -25% from peak.
    result = _result([100_000, 120_000, 90_000, 100_000], trades=[])
    metrics = compute_metrics(result)
    assert metrics.max_drawdown_pct == pytest.approx(-25.0)


def test_win_rate_and_num_trades():
    trades = [
        Trade("A", pd.Timestamp("2024-01-01"), 10, pd.Timestamp("2024-01-02"), 12, shares=100),  # win
        Trade("B", pd.Timestamp("2024-01-01"), 10, pd.Timestamp("2024-01-02"), 8, shares=100),   # loss
    ]
    result = _result([100_000, 100_000], trades=trades)
    metrics = compute_metrics(result)
    assert metrics.num_trades == 2
    assert metrics.win_rate_pct == pytest.approx(50.0)


def test_per_ticker_pnl_aggregates_multiple_trades():
    trades = [
        Trade("A", pd.Timestamp("2024-01-01"), 10, pd.Timestamp("2024-01-02"), 12, shares=100),
        Trade("A", pd.Timestamp("2024-01-03"), 10, pd.Timestamp("2024-01-04"), 9, shares=100),
    ]
    result = _result([100_000, 100_000], trades=trades)
    metrics = compute_metrics(result)
    assert metrics.per_ticker_pnl["A"] == pytest.approx(200 - 100)


def test_empty_result_has_zeroed_metrics():
    result = _result([100_000], trades=[])
    metrics = compute_metrics(result)
    assert metrics.total_return_pct == 0.0
    assert metrics.num_trades == 0
    assert metrics.win_rate_pct == 0.0
