# KAMA Momentum Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `KamaMomentumStrategy`, a new pluggable backtester strategy driven by
Kaufman's Adaptive Moving Average (KAMA), and wire it into the CLI.

**Architecture:** Pure addition behind the existing `Strategy` interface
(`backtester/strategies/base.py`) — no engine changes. One new strategy file
implementing `generate_signals(df) -> pd.Series`, plus CLI wiring in `cli.py` so
`--strategy kama` works the same way `--strategy sma`/`--strategy rsi` already do.

**Tech Stack:** Python 3.11+, pandas, pytest (matches existing `backtester/` stack).

## Global Constraints

- Follow the design spec exactly:
  `quant/docs/superpowers/specs/2026-07-11-hybrid-kama-momentum-design.md`.
- No changes to `backtester/engine/` or `backtester/reporting/` — this strategy
  must work purely through the existing `Strategy` interface.
- Parameter validation (`period < 1`, `fast >= slow`) raises `ValueError` at
  `__init__` time, not during `generate_signals` — matches
  `SmaCrossoverStrategy`/`RsiThresholdStrategy` convention.
- Defaults: `period=10`, `fast=2`, `slow=30` (Kaufman's classic values).
- All tests run via `pytest backtester/tests/` from the repo root
  (`C:\Users\Admin\OneDrive\Documents\GitHub\projects`).

---

### Task 1: KAMA momentum strategy + unit tests

**Files:**
- Create: `quant/backtester/strategies/kama_momentum.py`
- Modify: `quant/backtester/tests/test_strategies.py`

**Interfaces:**
- Consumes: `backtester.strategies.base.Strategy` (existing ABC, `generate_signals(df: pd.DataFrame) -> pd.Series`).
- Produces: `KamaMomentumStrategy(period: int = 10, fast: int = 2, slow: int = 30)` with
  `.period`, `.fast`, `.slow` attributes and `.generate_signals(df)` — consumed by
  Task 2 (`cli.py`) and Task 3 (integration test).

- [ ] **Step 1: Write the failing tests**

Append to `quant/backtester/tests/test_strategies.py` (add the import at the top
alongside the existing two, then the five test functions at the bottom):

```python
from backtester.strategies.kama_momentum import KamaMomentumStrategy
```

```python
def test_kama_momentum_rejects_period_lt_1():
    try:
        KamaMomentumStrategy(period=0)
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_kama_momentum_rejects_fast_ge_slow():
    try:
        KamaMomentumStrategy(fast=30, slow=2)
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_kama_momentum_flat_before_enough_history():
    df = _df([10, 11, 12])  # fewer bars than period=5
    strat = KamaMomentumStrategy(period=5, fast=2, slow=4)
    signals = strat.generate_signals(df)
    assert (signals == 0).all()


def test_kama_momentum_goes_long_on_steady_uptrend():
    closes = list(range(10, 40))  # 30 bars, strictly rising by 1 each bar
    strat = KamaMomentumStrategy(period=5, fast=2, slow=10)
    signals = strat.generate_signals(_df(closes))
    assert signals.iloc[-1] == 1


def test_kama_momentum_goes_flat_after_sustained_reversal():
    # Rising for 13 bars, then a sustained 15-bar decline.
    closes = [10] * 3 + list(range(11, 21)) + list(range(19, 4, -1))
    strat = KamaMomentumStrategy(period=5, fast=2, slow=10)
    signals = strat.generate_signals(_df(closes))
    assert signals.max() == 1  # went long at some point during the rise
    assert signals.iloc[-1] == 0  # flat again after the sustained decline
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest backtester/tests/test_strategies.py -v -k kama_momentum`
Expected: 5 errors/failures, each with `ModuleNotFoundError: No module named
'backtester.strategies.kama_momentum'`.

- [ ] **Step 3: Write the implementation**

Create `quant/backtester/strategies/kama_momentum.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest backtester/tests/test_strategies.py -v`
Expected: all tests PASS (existing SMA/RSI tests plus the 5 new KAMA ones).

- [ ] **Step 5: Commit**

```bash
git add quant/backtester/strategies/kama_momentum.py quant/backtester/tests/test_strategies.py
git commit -m "feat(quant): add KAMA momentum strategy"
```

---

### Task 2: Wire KAMA into the CLI

**Files:**
- Modify: `quant/backtester/cli.py`
- Create: `quant/backtester/tests/test_cli.py`

**Interfaces:**
- Consumes: `KamaMomentumStrategy(period, fast, slow)` from Task 1.
- Produces: `build_strategy("kama", kama_period=.., kama_fast=.., kama_slow=..)` and
  CLI flags `--strategy kama --kama-period N --kama-fast N --kama-slow N` — used by
  end users, no other task depends on these names.

- [ ] **Step 1: Write the failing test**

Create `quant/backtester/tests/test_cli.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backtester/tests/test_cli.py -v`
Expected: FAIL — `ValueError: Unknown strategy: kama` (raised by `build_strategy`,
since the `"kama"` branch doesn't exist yet).

- [ ] **Step 3: Wire KAMA into `cli.py`**

In `quant/backtester/cli.py`:

Add the import alongside the other strategy imports (after line 21):

```python
from backtester.strategies.kama_momentum import KamaMomentumStrategy
```

Update `STRATEGY_CHOICES` (line 26):

```python
STRATEGY_CHOICES = {"sma": "SMA crossover", "rsi": "RSI threshold", "kama": "KAMA momentum"}
```

Add a branch to `build_strategy` (after the `"rsi"` branch, before the final
`raise ValueError`, currently lines 41-47):

```python
    if name == "kama":
        return KamaMomentumStrategy(
            period=int(params.get("kama_period", 10)),
            fast=int(params.get("kama_fast", 2)),
            slow=int(params.get("kama_slow", 30)),
        )
```

Add flags to `parse_args` (after the `--overbought` line, currently line 63):

```python
    parser.add_argument("--kama-period", type=int, default=10, help="KAMA efficiency-ratio period")
    parser.add_argument("--kama-fast", type=int, default=2, help="KAMA fast EMA period bound")
    parser.add_argument("--kama-slow", type=int, default=30, help="KAMA slow EMA period bound")
```

Replace the `if strategy_key == "sma": ... else: ...` block in `run_guided_prompts`
(currently lines 108-114) with an explicit `elif` chain so it doesn't silently
lump `"kama"` in with the RSI branch:

```python
    if strategy_key == "sma":
        params["fast"] = questionary.text("Fast SMA period:", default="20").ask()
        params["slow"] = questionary.text("Slow SMA period:", default="50").ask()
    elif strategy_key == "rsi":
        params["period"] = questionary.text("RSI period:", default="14").ask()
        params["oversold"] = questionary.text("Oversold threshold (enter long below this):", default="30").ask()
        params["overbought"] = questionary.text("Overbought threshold (exit above this):", default="70").ask()
    else:
        params["kama_period"] = questionary.text("KAMA period:", default="10").ask()
        params["kama_fast"] = questionary.text("KAMA fast bound:", default="2").ask()
        params["kama_slow"] = questionary.text("KAMA slow bound:", default="30").ask()
```

In `main()`, add the three new keys to the `config` dict built from flag args
(after `"overbought": args.overbought,`, currently line 151):

```python
            "kama_period": args.kama_period,
            "kama_fast": args.kama_fast,
            "kama_slow": args.kama_slow,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backtester/tests/test_cli.py -v`
Expected: both tests PASS.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `pytest backtester/tests/ -v`
Expected: all tests PASS, including the pre-existing SMA/RSI/simulator/metrics/integration tests.

- [ ] **Step 6: Commit**

```bash
git add quant/backtester/cli.py quant/backtester/tests/test_cli.py
git commit -m "feat(quant): wire KAMA momentum strategy into CLI"
```

---

### Task 3: End-to-end integration test + README

**Files:**
- Modify: `quant/backtester/tests/test_integration.py`
- Modify: `quant/backtester/README.md`

**Interfaces:**
- Consumes: `KamaMomentumStrategy` (Task 1), `run_backtest`, `compute_metrics`,
  `save_equity_curve`, `save_trades_csv` (all pre-existing, already imported in
  `test_integration.py`).
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Write the failing test**

In `quant/backtester/tests/test_integration.py`, add the import alongside the
existing `SmaCrossoverStrategy` import (line 12):

```python
from backtester.strategies.kama_momentum import KamaMomentumStrategy
```

Append this test function at the end of the file:

```python
def test_end_to_end_pipeline_with_kama_strategy(tmp_path: Path):
    bars = _fake_bars({"FAKE_UP.SI": [10 + i * 0.5 for i in range(40)]})

    strategy = KamaMomentumStrategy(period=5, fast=2, slow=10)
    result = run_backtest(bars, strategy, starting_cash=100_000, size_per_trade=10_000)
    metrics = compute_metrics(result)

    assert result.skipped_tickers == []
    assert metrics.num_trades >= 1

    png_path = save_equity_curve(result, tmp_path)
    csv_path = save_trades_csv(result, tmp_path)
    assert png_path.exists()
    assert csv_path.exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backtester/tests/test_integration.py -v -k kama`
Expected: FAIL with `ImportError: cannot import name 'KamaMomentumStrategy'`
(this only fails if Task 1 hasn't been done yet in this session — if Task 1 is
already committed, skip straight to Step 4, this step exists to catch
out-of-order execution).

- [ ] **Step 3: (no implementation step — this task only adds test coverage over existing code)**

Nothing to implement; `KamaMomentumStrategy` (Task 1) and `run_backtest` /
`compute_metrics` / `save_equity_curve` / `save_trades_csv` (pre-existing)
already provide everything this test needs.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backtester/tests/test_integration.py -v`
Expected: both integration tests (SMA and KAMA) PASS.

- [ ] **Step 5: Update README**

In `quant/backtester/README.md`, after the line (currently line 36):

```
`--strategy rsi` uses `--period`, `--oversold`, `--overbought` instead of
`--fast`/`--slow`.
```

add:

```
`--strategy kama` uses `--kama-period`, `--kama-fast`, `--kama-slow` instead.
```

- [ ] **Step 6: Run the full test suite one last time**

Run: `pytest backtester/tests/ -v`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add quant/backtester/tests/test_integration.py quant/backtester/README.md
git commit -m "test(quant): add end-to-end coverage for KAMA momentum strategy"
```
