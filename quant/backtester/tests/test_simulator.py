import pandas as pd
import pytest

from backtester.engine.portfolio import Portfolio
from backtester.engine.simulator import run_backtest
from backtester.strategies.base import Strategy


def _df(closes: list[float], start="2024-01-01") -> pd.DataFrame:
    idx = pd.date_range(start, periods=len(closes), freq="D")
    return pd.DataFrame({
        "open": closes, "high": closes, "low": closes, "close": closes,
        "volume": [1000] * len(closes),
    }, index=idx)


class _FixedSignal(Strategy):
    name = "fixed"

    def __init__(self, signal_values: list[int]):
        self.signal_values = signal_values

    def generate_signals(self, df):
        return pd.Series(self.signal_values, index=df.index)


class _AlwaysFails(Strategy):
    name = "broken"

    def generate_signals(self, df):
        raise RuntimeError("boom")


# --- Portfolio sizing math ---

def test_portfolio_open_position_sizing():
    p = Portfolio(starting_cash=10_000)
    opened = p.open_position("ABC", pd.Timestamp("2024-01-01"), price=10.0, size=1_000)
    assert opened
    assert p.cash == 9_000
    assert p.open_positions["ABC"].shares == 100  # 1000 / 10.0


def test_portfolio_close_position_records_trade_pnl():
    p = Portfolio(starting_cash=10_000)
    p.open_position("ABC", pd.Timestamp("2024-01-01"), price=10.0, size=1_000)
    trade = p.close_position("ABC", pd.Timestamp("2024-01-02"), price=12.0)
    assert trade.pnl == pytest.approx(200.0)  # 100 shares * (12-10)
    assert p.cash == pytest.approx(9_000 + 1_200)


def test_portfolio_insufficient_cash_skips_open():
    p = Portfolio(starting_cash=500)
    opened = p.open_position("ABC", pd.Timestamp("2024-01-01"), price=10.0, size=1_000)
    assert not opened
    assert p.cash == 500
    assert "ABC" not in p.open_positions


# --- Simulator: cash-constraint skip logic ---

def test_simulator_skips_trade_when_cash_insufficient():
    bars = {
        "A": _df([10, 10, 10]),
        "B": _df([10, 10, 10]),
    }
    # Both go long on bar 1; cash only covers one $10,000 entry.
    strategy_a = _FixedSignal([1, 1, 0])
    result_a_only = run_backtest({"A": bars["A"]}, strategy_a, starting_cash=10_000, size_per_trade=10_000)
    assert len(result_a_only.trades) == 1


def test_simulator_multi_ticker_chronological_shared_cash():
    bars = {
        "A": _df([10, 10, 10, 10]),
        "B": _df([10, 10, 10, 10]),
    }
    signal = _FixedSignal([1, 1, 1, 0])
    result = run_backtest(bars, signal, starting_cash=15_000, size_per_trade=10_000)
    # Only one of A/B should have been able to open (cash covers just one $10k entry).
    assert len(result.trades) == 1


def test_simulator_skips_ticker_on_strategy_error():
    bars = {
        "GOOD": _df([10, 11, 12]),
        "BAD": _df([10, 11, 12]),
    }

    class Mixed(Strategy):
        name = "mixed"

        def generate_signals(self, df):
            if df is bars["BAD"]:
                raise RuntimeError("boom")
            return pd.Series([1, 1, 0], index=df.index)

    result = run_backtest(bars, Mixed(), starting_cash=10_000, size_per_trade=1_000)
    assert "BAD" in result.skipped_tickers
    assert len(result.trades) == 1


def test_simulator_closes_open_position_at_end_of_run():
    bars = {"A": _df([10, 11, 12])}
    signal = _FixedSignal([1, 1, 1])  # never exits on its own
    result = run_backtest(bars, signal, starting_cash=10_000, size_per_trade=1_000)
    assert len(result.trades) == 1
    assert result.trades[0].exit_price == 12
