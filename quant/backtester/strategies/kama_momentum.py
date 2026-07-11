"""KAMA momentum strategy: long while Kaufman's Adaptive Moving Average (KAMA)
is rising, flat while it's falling or undefined (warm-up).

See ../../docs/superpowers/specs/2026-07-11-hybrid-kama-momentum-design.md for
the full design and formula derivation.
"""

import pandas as pd

from backtester.strategies.base import Strategy


def _kama(close: pd.Series, period: int, fast: int, slow: int) -> pd.Series:
    change = close.diff(period).abs()
    volatility = close.diff().abs().rolling(period).sum()
    efficiency_ratio = (change / volatility.replace(0, float("nan"))).fillna(0)

    fast_sc = 2 / (fast + 1)
    slow_sc = 2 / (slow + 1)
    smoothing = (efficiency_ratio * (fast_sc - slow_sc) + slow_sc) ** 2

    kama = pd.Series(float("nan"), index=close.index, dtype=float)
    if len(close) <= period:
        return kama

    kama.iloc[period] = close.iloc[period]
    for i in range(period + 1, len(close)):
        prev = kama.iloc[i - 1]
        kama.iloc[i] = prev + smoothing.iloc[i] * (close.iloc[i] - prev)
    return kama


class KamaMomentumStrategy(Strategy):
    """Long-only strategy: long while KAMA is rising, flat otherwise."""

    name = "kama_momentum"

    def __init__(self, period: int = 10, fast: int = 2, slow: int = 30):
        if period < 1:
            raise ValueError(f"period ({period}) must be >= 1")
        if fast >= slow:
            raise ValueError(f"fast period ({fast}) must be < slow period ({slow})")
        self.period = period
        self.fast = fast
        self.slow = slow

    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        kama = _kama(df["close"], self.period, self.fast, self.slow)
        rising = kama.diff() > 0
        return rising.fillna(False).astype(int)
