"""Abstract interface for OHLCV price data sources.

Engine and strategies only ever talk to this interface, never to a concrete
data provider. That keeps the moomoo OpenAPI source (planned, not yet built —
see ../docs/superpowers/specs/2026-06-22-sgx-backtester-core-design.md) a drop-in
replacement for the yfinance source used today.
"""

from abc import ABC, abstractmethod

import pandas as pd

OHLCV_COLUMNS = ["open", "high", "low", "close", "volume"]


class DataSource(ABC):
    """Fetches OHLCV bars for a single ticker over a date range."""

    @abstractmethod
    def get_bars(
        self,
        ticker: str,
        start: str,
        end: str,
        interval: str = "1d",
    ) -> pd.DataFrame:
        """Return OHLCV bars for `ticker` between `start` and `end`.

        Returns a DataFrame with a DatetimeIndex and columns
        `["open", "high", "low", "close", "volume"]`, sorted ascending by date.
        Raises if the source is unreachable. Returns an empty DataFrame (not an
        error) if the ticker has no data for the requested range.
        """
        raise NotImplementedError
