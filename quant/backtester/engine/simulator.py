"""Bar-by-bar multi-ticker backtest simulator.

Merges every ticker's bars into one chronological stream so the shared
Portfolio cash pool behaves realistically: a signal on ticker B can't spend
capital already committed to ticker A. Strategy errors on one ticker are
caught and logged; the rest of the universe keeps running (per spec).
"""

import logging
from dataclasses import dataclass, field

import pandas as pd

from backtester.engine.portfolio import Portfolio, Trade
from backtester.strategies.base import Strategy

logger = logging.getLogger(__name__)


@dataclass
class BacktestResult:
    portfolio: Portfolio
    equity_curve: pd.Series
    skipped_tickers: list[str] = field(default_factory=list)

    @property
    def trades(self) -> list[Trade]:
        return self.portfolio.closed_trades


def run_backtest(
    bars: dict[str, pd.DataFrame],
    strategy: Strategy,
    starting_cash: float = 100_000,
    size_per_trade: float = 10_000,
    commission: float = 0.0,
) -> BacktestResult:
    """Run `strategy` across every ticker in `bars` with shared cash.

    `bars` maps ticker -> OHLCV DataFrame (DatetimeIndex). Tickers whose
    strategy computation raises are logged and skipped; the rest still run.
    """
    portfolio = Portfolio(starting_cash=starting_cash, commission=commission)
    signals: dict[str, pd.Series] = {}
    skipped: list[str] = []

    for ticker, df in bars.items():
        if df.empty:
            logger.warning("Skipping %s: no data", ticker)
            skipped.append(ticker)
            continue
        try:
            signals[ticker] = strategy.generate_signals(df)
        except Exception:
            logger.exception("Strategy failed on %s, skipping ticker", ticker)
            skipped.append(ticker)

    # All timestamps across all usable tickers, in order.
    all_dates = sorted(set().union(*(bars[t].index for t in signals)))
    equity_curve = pd.Series(index=all_dates, dtype=float)

    prev_signal: dict[str, int] = {t: 0 for t in signals}

    for date in all_dates:
        prices_today: dict[str, float] = {}

        for ticker, sig in signals.items():
            df = bars[ticker]
            if date not in df.index:
                continue
            price = float(df.loc[date, "close"])
            prices_today[ticker] = price
            current_signal = int(sig.loc[date])
            previous = prev_signal[ticker]

            if previous == 0 and current_signal == 1:
                opened = portfolio.open_position(ticker, date, price, size_per_trade)
                if not opened:
                    logger.warning(
                        "Insufficient cash to open %s on %s (cash=%.2f, size=%.2f)",
                        ticker, date, portfolio.cash, size_per_trade,
                    )
            elif previous == 1 and current_signal == 0:
                portfolio.close_position(ticker, date, price)

            prev_signal[ticker] = current_signal

        equity_curve.loc[date] = portfolio.mark_to_market(prices_today)

    # Close anything still open at the end of the run, at the last known price.
    for ticker in list(portfolio.open_positions.keys()):
        df = bars[ticker]
        last_date = df.index[-1]
        last_price = float(df.loc[last_date, "close"])
        portfolio.close_position(ticker, last_date, last_price)

    return BacktestResult(portfolio=portfolio, equity_curve=equity_curve, skipped_tickers=skipped)
