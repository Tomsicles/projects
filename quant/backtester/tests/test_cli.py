"""Unit tests for backtester.cli.build_strategy's KAMA wiring. Argument parsing
itself (parse_args) is exercised implicitly through this — build_strategy is
what parse_args' output flows into."""

from backtester.cli import build_strategy
from backtester.strategies.kama_momentum import KamaMomentumStrategy


def test_build_strategy_kama_uses_defaults():
    strat = build_strategy("kama")
    assert isinstance(strat, KamaMomentumStrategy)
    assert strat.period == 10
    assert strat.fast == 2
    assert strat.slow == 30


def test_build_strategy_kama_uses_provided_params():
    strat = build_strategy("kama", kama_period=20, kama_fast=3, kama_slow=15)
    assert strat.period == 20
    assert strat.fast == 3
    assert strat.slow == 15
