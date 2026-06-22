"""Tracks cash, open positions, and closed trades across a multi-ticker run.

One shared cash pool across the whole universe, so the simulator can't
double-spend the same capital on simultaneous signals from different tickers
(see spec's error-handling section).
"""

from dataclasses import dataclass, field

import pandas as pd


@dataclass
class Position:
    ticker: str
    entry_date: pd.Timestamp
    entry_price: float
    shares: float


@dataclass
class Trade:
    ticker: str
    entry_date: pd.Timestamp
    entry_price: float
    exit_date: pd.Timestamp
    exit_price: float
    shares: float

    @property
    def pnl(self) -> float:
        return (self.exit_price - self.entry_price) * self.shares

    @property
    def return_pct(self) -> float:
        return (self.exit_price / self.entry_price) - 1


@dataclass
class Portfolio:
    starting_cash: float
    cash: float = field(init=False)
    open_positions: dict[str, Position] = field(default_factory=dict)
    closed_trades: list[Trade] = field(default_factory=list)
    commission: float = 0.0

    def __post_init__(self):
        self.cash = self.starting_cash

    def can_open(self, size: float) -> bool:
        return self.cash >= size + self.commission

    def open_position(self, ticker: str, date: pd.Timestamp, price: float, size: float) -> bool:
        """Open a position sized at `size` dollars. Returns False (no-op) if
        there isn't enough cash, instead of raising — callers log a warning
        and move on (see spec's error-handling section)."""
        if ticker in self.open_positions:
            return False
        if not self.can_open(size):
            return False
        shares = size / price
        self.cash -= size + self.commission
        self.open_positions[ticker] = Position(ticker, date, price, shares)
        return True

    def close_position(self, ticker: str, date: pd.Timestamp, price: float) -> Trade | None:
        position = self.open_positions.pop(ticker, None)
        if position is None:
            return None
        proceeds = position.shares * price
        self.cash += proceeds - self.commission
        trade = Trade(
            ticker=ticker,
            entry_date=position.entry_date,
            entry_price=position.entry_price,
            exit_date=date,
            exit_price=price,
            shares=position.shares,
        )
        self.closed_trades.append(trade)
        return trade

    def mark_to_market(self, prices: dict[str, float]) -> float:
        """Total equity (cash + open positions valued at `prices`)."""
        equity = self.cash
        for ticker, position in self.open_positions.items():
            price = prices.get(ticker, position.entry_price)
            equity += position.shares * price
        return equity
