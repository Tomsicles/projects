# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`projects` is a personal multi-project monorepo. Current subfolders:

- **`quant/`** — SGX (Singapore Exchange) quant research and trading tooling.

  Planned subsystems, each with its own design spec:

  - **SGX anomaly research** —
    `quant/docs/superpowers/specs/2026-06-13-sgx-anomaly-research-design.md`
  - **SGX backtester** — first piece of a larger backtesting toolkit, core engine
    spec'd at `quant/docs/superpowers/specs/2026-06-22-sgx-backtester-core-design.md`.
    Three more pieces are planned and will get their own specs later: hybrid/custom
    indicators, news search → stock impact analysis, and an inverse-correlation
    "opposite stock" finder. All three are designed to plug into the backtester
    core as additional strategies/signals once it exists.

- **`dashboard/`** — personal dashboard project (incoming, not yet populated).

## Workflow

Design specs for the quant subsystem live in `quant/docs/superpowers/specs/`
using the `YYYY-MM-DD-<topic>-design.md` naming convention. New feature work
should go through brainstorming → design spec → implementation plan before
code is written — read the relevant spec(s) above before implementing any
subsystem.
