# SGX Anomaly Research — Design Spec
**Date:** 2026-06-13
**Status:** Approved

## Goal

Research project studying price/volume anomalies in Singapore markets. Output: Jupyter notebooks with charts and stats. Future extension: dashboard.

## Research Questions

### Track 1: SiMSCI Futures
- Do certain days-of-week or months-of-year produce consistently higher/lower returns?
- Is there an expiry-week effect?
- What is the roll yield (front-month vs next-month basis) over time?

### Track 2: STI 30 Single Stocks
- Do day-of-week and monthly seasonality effects exist across STI 30?
- Do high-volume days predict next-day returns?
- Does short-term momentum persist (1-week, 1-month, 3-month lookbacks)?

## Data Sources

| Data | Source | Notes |
|------|--------|-------|
| SiMSCI spot proxy | `yfinance` → `EWS` (iShares MSCI Singapore ETF) | Free, daily OHLCV |
| STI 30 stocks | `yfinance` → individual tickers | Free, daily OHLCV |
| SiMSCI futures | SGX historical CSV (if obtainable) | Fallback: `EWS` as proxy |

## Notebooks

| File | Contents |
|------|----------|
| `notebooks/01_simSCI_futures_seasonality.ipynb` | Track 1 analysis |
| `notebooks/02_sti30_stock_anomalies.ipynb` | Track 2 analysis |

## Analysis Components

### Seasonality
- Compute mean return by day-of-week, by calendar month
- Bar charts with error bars (standard error)
- T-test: is any bucket significantly different from zero?

### Roll Yield (Track 1 only)
- Compute front-month minus next-month price spread over time
- Plot time series, annotate contango/backwardation regimes

### Volume-Price (Track 2 only)
- Define "high volume day": top quartile by 20-day rolling avg
- Compute next-day return distribution: high-vol vs normal days
- Mann-Whitney U test for significance

### Momentum
- Rank STI 30 stocks by past N-period return (N = 5, 21, 63 days)
- Compute forward 1-month return by quintile
- Bar chart: top quintile vs bottom quintile forward returns

## Stack

- Python 3.11+
- `yfinance` — data fetch
- `pandas`, `numpy` — data manipulation
- `matplotlib`, `seaborn` — charts
- `scipy.stats` — significance tests
- `jupyter` — notebook environment

## Project Structure

```
sgx-anomaly-research/
├── data/               # cached CSVs (gitignored)
├── notebooks/
│   ├── 01_simSCI_futures_seasonality.ipynb
│   └── 02_sti30_stock_anomalies.ipynb
├── src/
│   └── data_loader.py  # yfinance fetch + caching helpers
├── requirements.txt
└── README.md
```

## Success Criteria

- Each notebook runs end-to-end without errors
- Every claim backed by chart + stat test result
- Findings section at end of each notebook: list anomalies found (or null results)
- Ready to extend into Power BI / HTML dashboard later
