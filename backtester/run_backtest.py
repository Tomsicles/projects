"""Entrypoint: `python backtester/run_backtest.py` or `python -m backtester.run_backtest`."""

import sys
from pathlib import Path

# Allow running this file directly (`python backtester/run_backtest.py`) from
# any working directory by making sure the repo root is importable, since the
# script otherwise only sees its own directory on sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backtester.cli import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
