"""Performance metrics computed from a BacktestResult."""

from dataclasses import dataclass

import numpy as np
import pandas as pd

from backtester.engine.simulator import BacktestResult

TRADING_DAYS_PER_YEAR = 252


@dataclass
class Metrics:
    total_return_pct: float
    sharpe: float
    max_drawdown_pct: float
    win_rate_pct: float
    num_trades: int
    per_ticker_pnl: dict[str, float]


def compute_metrics(result: BacktestResult, risk_free_rate: float = 0.0) -> Metrics:
    equity = result.equity_curve.dropna()
    trades = result.trades

    if equity.empty or len(equity) < 2:
        total_return_pct = 0.0
        sharpe = 0.0
        max_drawdown_pct = 0.0
    else:
        total_return_pct = (equity.iloc[-1] / equity.iloc[0] - 1) * 100

        daily_returns = equity.pct_change().dropna()
        excess = daily_returns - risk_free_rate / TRADING_DAYS_PER_YEAR
        sharpe = (
            (excess.mean() / excess.std()) * np.sqrt(TRADING_DAYS_PER_YEAR)
            if excess.std() > 0
            else 0.0
        )

        running_max = equity.cummax()
        drawdown = (equity - running_max) / running_max
        max_drawdown_pct = drawdown.min() * 100

    wins = [t for t in trades if t.pnl > 0]
    win_rate_pct = (len(wins) / len(trades) * 100) if trades else 0.0

    per_ticker_pnl: dict[str, float] = {}
    for trade in trades:
        per_ticker_pnl[trade.ticker] = per_ticker_pnl.get(trade.ticker, 0.0) + trade.pnl

    return Metrics(
        total_return_pct=total_return_pct,
        sharpe=float(sharpe),
        max_drawdown_pct=float(max_drawdown_pct),
        win_rate_pct=win_rate_pct,
        num_trades=len(trades),
        per_ticker_pnl=per_ticker_pnl,
    )
