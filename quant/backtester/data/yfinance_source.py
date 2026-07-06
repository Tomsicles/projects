"""yfinance-backed DataSource, with a local parquet cache.

Caches each (ticker, interval) pair to its own parquet file under
backtester/data/cache/ so repeated backtests don't re-hit the network. Small
gaps in the underlying data are forward-filled; larger gaps are left as a
warning for the caller to deal with (the simulator skips tickers it can't use).
"""

import logging
import re
from pathlib import Path

import pandas as pd
import yfinance as yf

from backtester.data.source import OHLCV_COLUMNS, DataSource

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).parent / "cache"
MAX_FORWARD_FILL_GAP = 3  # bars


def _cache_path(ticker: str, interval: str) -> Path:
    safe_ticker = re.sub(r"[^A-Za-z0-9_.-]", "_", ticker)
    return CACHE_DIR / f"{safe_ticker}__{interval}.parquet"


class YFinanceDataSource(DataSource):
    """Fetches SGX (and other) tickers via yfinance, with parquet caching."""

    def __init__(self, cache_dir: Path | None = None, use_cache: bool = True):
        self.cache_dir = cache_dir or CACHE_DIR
        self.use_cache = use_cache
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def get_bars(
        self,
        ticker: str,
        start: str,
        end: str,
        interval: str = "1d",
    ) -> pd.DataFrame:
        cache_file = self.cache_dir / _cache_path(ticker, interval).name

        if self.use_cache and cache_file.exists():
            cached = pd.read_parquet(cache_file)
            cached.index = pd.to_datetime(cached.index)
            in_range = cached.loc[start:end]
            if not in_range.empty:
                return self._clean(in_range)

        df = yf.download(
            ticker,
            start=start,
            end=end,
            interval=interval,
            progress=False,
            auto_adjust=True,
        )

        if df.empty:
            logger.warning("No data returned for %s (%s, %s to %s)", ticker, interval, start, end)
            return pd.DataFrame(columns=OHLCV_COLUMNS)

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df.columns = [str(c).lower() for c in df.columns]
        df = df[[c for c in OHLCV_COLUMNS if c in df.columns]]

        if self.use_cache:
            df.to_parquet(cache_file)

        return self._clean(df.loc[start:end])

    @staticmethod
    def _clean(df: pd.DataFrame) -> pd.DataFrame:
        df = df.sort_index()
        # Forward-fill short runs of missing values (e.g. a provider hiccup on
        # one field) but cap it so we don't paper over genuinely missing data.
        filled = df.ffill(limit=MAX_FORWARD_FILL_GAP)
        return filled.dropna(subset=["close"])
