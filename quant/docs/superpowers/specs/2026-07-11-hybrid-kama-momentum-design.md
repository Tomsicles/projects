# Hybrid/Custom Indicator — KAMA Momentum Strategy — Design

Status: approved
Date: 2026-07-11

## Context

Second of four planned subsystems for the broader SGX trading-research toolkit (see
`quant/backtester/CONTEXT.md`):

1. Backtester core engine (built — see `2026-06-22-sgx-backtester-core-design.md`)
2. **Hybrid/custom indicator design (this spec)**
3. News search → stock impact analysis (future spec)
4. "Opposite stock" finder — inverse-correlated pair (future spec)

The backtester core shipped with two baseline strategies (SMA crossover, RSI
threshold) specifically so that future indicators, including this one, could plug
into the existing `Strategy` interface without any engine changes. This spec
delivers the first such pluggable addition.

## Goals

- Add a genuinely new indicator (not just a combination of the two existing ones)
  that adapts its responsiveness to market volatility/trendiness automatically.
- Plug into the backtester purely as a new `Strategy` implementation — zero engine
  changes.
- Prove out the pluggable-strategy design from the core engine spec with a second,
  independent strategy author could add later.

## Non-goals

- Regime-switching or confirmation-combo strategies that blend SMA/RSI — considered
  and explicitly not chosen (see rejected alternatives below).
- News/sentiment signals, inverse-correlation finder — separate future specs.
- Multi-strategy portfolio blending — single strategy per run, same as today.

## Design

### What it is

`KamaMomentumStrategy` — a long/flat strategy driven by Kaufman's Adaptive Moving
Average (KAMA). KAMA is a moving average whose responsiveness scales with an
"efficiency ratio" (net price change over a window ÷ sum of absolute bar-to-bar
moves): it tracks price closely when the market trends cleanly and flattens out
when price is choppy, without any manual regime detection step.

### Signal logic

- Compute KAMA over the closing price using the standard Kaufman formula:
  - Efficiency ratio `ER[t] = |close[t] - close[t-period]| / sum(|close[i] - close[i-1]|)`,
    where the sum runs over the trailing `period` bars.
  - Smoothing constant `SC[t] = (ER[t] * (fast_sc - slow_sc) + slow_sc) ** 2`, where
    `fast_sc = 2 / (fast + 1)` and `slow_sc = 2 / (slow + 1)`.
  - `KAMA[t] = KAMA[t-1] + SC[t] * (close[t] - KAMA[t-1])`, seeded with
    `KAMA[period] = close[period]`.
- Long (`1`) while KAMA is rising (`KAMA[t] > KAMA[t-1]`); flat (`0`) while falling
  or flat.
- Flat during warm-up (bars before index `period`, where KAMA is undefined) — same
  convention `SmaCrossoverStrategy` uses for its slow-SMA warm-up period.

### Parameters

Kaufman's classic defaults, all overridable via `__init__` like the existing
strategies:

- `period=10` — efficiency ratio lookback window
- `fast=2` — fast EMA period bound (converted to `fast_sc` internally)
- `slow=30` — slow EMA period bound (converted to `slow_sc` internally)

### Component placement

Same pattern as the existing strategies — no engine changes required:

- `backtester/strategies/kama_momentum.py` implementing
  `Strategy.generate_signals(df) -> pd.Series`
- `run_backtest.py` gets a new `--strategy kama` choice with
  `--kama-period` / `--kama-fast` / `--kama-slow` flags, mirroring how
  `--strategy rsi` adds `--period`/`--oversold`/`--overbought` today

### Error handling

Same posture as existing strategies — invalid params raise `ValueError` at
construction time, not during `generate_signals`:

- `period < 1` → `ValueError`
- `fast >= slow` → `ValueError` (mirrors `SmaCrossoverStrategy`'s
  `fast >= slow` check)

No new engine-level error paths: this is purely a new signal source behind the
existing `Strategy` interface, so all of the core engine's error handling
(insufficient cash, strategy exceptions, data gaps) applies unchanged.

### Testing

- Unit tests against a synthetic price series with hand-computed expected KAMA
  values and resulting slope-based signals: flat during warm-up, long while KAMA
  rising, flat while KAMA falling — same style as the existing tests in
  `tests/test_strategies.py`.
- Construction validation tests: `period < 1` and `fast >= slow` both raise
  `ValueError`.
- No changes needed to simulator or metrics tests. The CLI integration test
  (`test_integration.py`) gets one added case exercising `--strategy kama`
  end-to-end through the existing synthetic-universe fixture.

## Rejected alternatives

- **Regime-switching hybrid** (ADX/volatility-based routing between SMA-crossover
  and RSI-threshold logic): would have reused existing strategies as building
  blocks and directly addressed both "fewer false signals" and "adapt to
  regime/volatility," but adds a regime detector plus routing logic — more moving
  parts than a single new indicator. Deferred; can revisit as a later addition
  once KAMA momentum has a track record to route against.
- **Confirmation combo** (AND-gate on existing SMA + RSI signals): lowest risk and
  complexity, but not a genuinely new indicator — just a stricter filter on the
  two already in the backtester. Rejected because the goal for this piece was a
  new indicator formula.

## Workflow note

Per user instruction: use Opus for the planning/outline phase (writing-plans) and
Sonnet for execution of the implementation plan (same convention as the core
engine spec).
