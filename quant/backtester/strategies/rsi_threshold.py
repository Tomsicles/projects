"""RSI threshold strategy: enter when oversold, exit when overbought.

Uses Wilder's RSI. Stays long from the bar RSI crosses below `oversold` until
it crosses above `overbought` (a simple state machine, not a recompute-each-bar
rule, so it doesn't flicker on every wiggle around a single threshold).
"""

import pandas as pd

from backtester.strategies.base import Strategy


def _rsi(close: pd.Series, period: int) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, float("nan"))
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)  # neutral while undefined (e.g. avg_loss == 0)


class RsiThresholdStrategy(Strategy):
    name = "rsi_threshold"

    def __init__(self, period: int = 14, oversold: float = 30, overbought: float = 70):
        if not (0 < oversold < overbought < 100):
            raise ValueError("require 0 < oversold < overbought < 100")
        self.period = period
        self.oversold = oversold
        self.overbought = overbought

    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        rsi = _rsi(df["close"], self.period)
        position = pd.Series(0, index=df.index, dtype=int)
        in_position = False
        for i, value in enumerate(rsi):
            if not in_position and value < self.oversold:
                in_position = True
            elif in_position and value > self.overbought:
                in_position = False
            position.iloc[i] = int(in_position)
        return position
