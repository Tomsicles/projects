import pandas as pd

from backtester.strategies.rsi_threshold import RsiThresholdStrategy
from backtester.strategies.sma_crossover import SmaCrossoverStrategy


def _df(closes: list[float]) -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=len(closes), freq="D")
    return pd.DataFrame({
        "open": closes, "high": closes, "low": closes, "close": closes,
        "volume": [1000] * len(closes),
    }, index=idx)


def test_sma_crossover_rejects_fast_ge_slow():
    try:
        SmaCrossoverStrategy(fast=10, slow=10)
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_sma_crossover_flat_before_enough_history():
    df = _df([10, 11, 12])  # far fewer bars than slow=50 default
    strat = SmaCrossoverStrategy(fast=2, slow=3)
    signals = strat.generate_signals(df)
    # First 2 bars: slow SMA undefined -> flat.
    assert signals.iloc[0] == 0
    assert signals.iloc[1] == 0


def test_sma_crossover_goes_long_when_fast_above_slow():
    # Steadily rising prices -> fast SMA pulls above slow SMA once both defined.
    closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    strat = SmaCrossoverStrategy(fast=2, slow=4)
    signals = strat.generate_signals(_df(closes))
    assert signals.iloc[-1] == 1


def test_rsi_threshold_enters_on_oversold_exits_on_overbought():
    # Sharp drop (oversold) then sharp recovery (overbought).
    closes = [100] * 5 + [90, 80, 70, 60, 50] + [60, 70, 80, 90, 100, 110, 120]
    strat = RsiThresholdStrategy(period=5, oversold=30, overbought=70)
    signals = strat.generate_signals(_df(closes))
    # Should be flat at the very start, and should have gone long at some point
    # during the drop, then flat again after the strong recovery.
    assert signals.iloc[0] == 0
    assert signals.max() == 1
    assert signals.iloc[-1] == 0


def test_rsi_threshold_rejects_bad_thresholds():
    try:
        RsiThresholdStrategy(oversold=80, overbought=20)
        assert False, "expected ValueError"
    except ValueError:
        pass
