"""SMA crossover strategy: long while the fast SMA is above the slow SMA."""

import pandas as pd

from backtester.strategies.base import Strategy


class SmaCrossoverStrategy(Strategy):
    name = "sma_crossover"

    def __init__(self, fast: int = 20, slow: int = 50):
        if fast >= slow:
            raise ValueError(f"fast period ({fast}) must be < slow period ({slow})")
        self.fast = fast
        self.slow = slow

    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        fast_sma = df["close"].rolling(self.fast).mean()
        slow_sma = df["close"].rolling(self.slow).mean()
        signal = (fast_sma > slow_sma).astype(int)
        # Until the slow SMA has enough history it's NaN-derived; treat as flat.
        signal[slow_sma.isna()] = 0
        return signal
