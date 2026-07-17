# ASEAN Graph Signal

Signal discovery for ASEAN equities via Neo4j graph embeddings. See
`CONTEXT.md` for the why and
`../docs/superpowers/specs/2026-07-17-asean-graph-signal-phase0-foundations-design.md`
for the Phase 0 design.

The importable Python package is `asean_graph` (underscored); this project
directory is `asean-graph-signal` (hyphenated).

## Setup

Requires Python 3.11+ and Docker.

```
pip install -r requirements.txt
cp .env.example .env        # then edit .env and set a password
docker compose up -d        # starts Neo4j + GDS on bolt://localhost:7687
```

Load the env vars before running Python (they must be in your shell):

- PowerShell: `Get-Content .env | ForEach-Object { $k,$v = $_ -split '=',2; if ($k -and -not $k.StartsWith('#')) { Set-Item "env:$k" $v } }`

## Run the toy pipeline

```
jupyter notebook notebooks/00_toy_pipeline.ipynb
```

Or from Python: import `asean_graph.config`, `asean_graph.db`,
`asean_graph.toy_pipeline` and run `build_toy_graph → run_fastrp →
train_toy_model`.

## Test

```
pytest
```

Tests that need Neo4j skip (not fail) when it is unreachable.
