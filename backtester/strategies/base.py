"""Strategy interface.

A strategy turns a price DataFrame into a position-state series. The engine
reacts to transitions in that series (0 -> 1 opens a long, 1 -> 0 closes it);
it doesn't know or care how the series was computed. New strategies (including
future hybrid/custom indicators, per the project roadmap) are added by
implementing this interface in a new file — no engine changes required.
"""

from abc import ABC, abstractmethod

import pandas as pd


class Strategy(ABC):
    """Long-only position-state strategy."""

    name: str = "strategy"

    @abstractmethod
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        """Return a position-state Series aligned to `df.index`.

        Values are 1 (long) or 0 (flat). `df` has columns
        ["open", "high", "low", "close", "volume"].
        """
        raise NotImplementedError
