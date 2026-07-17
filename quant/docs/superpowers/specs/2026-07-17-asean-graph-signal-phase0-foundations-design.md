# ASEAN Graph Signal — Phase 0: Foundations (Design)

## Context

New quant subproject at `quant/asean-graph-signal/`. The full vision is a
dynamic, interpretable cross-border corporate relationship graph for ASEAN
equities in Neo4j, whose node embeddings are tested for forward-return
predictive power. The complete plan (`asean-graph-signal-project-plan.md`)
spans 7 phases over ~18 weeks and is deliberately decomposed into per-phase
spec → plan → build cycles.

**This spec covers Phase 0 only: Foundations.** Its sole job is to prove the
entire pipeline *mechanism* works end-to-end on a trivial 10-node graph before
any real data, scraping, or schema work exists — and to lay down the project
scaffold and config conventions everything later builds on.

Later phases (schema/universe, data acquisition, graph loading, embeddings,
prediction model, interpretability, dynamic/temporal analysis) each get their
own spec and are explicitly out of scope here.

### Decisions already made

- **Placement:** `quant/asean-graph-signal/`, specs in
  `quant/docs/superpowers/specs/` — matches the existing `quant/backtester`
  convention.
- **Reuse:** The user is already fluent in Cypher/GDS, so the GraphAcademy
  courses and Cypher cheat-sheet deliverable from the original plan are
  dropped. There is **no** pre-existing reusable Neo4j instance or price
  pipeline, so environment setup and (later) data acquisition stay in scope.
  The FreerInvestment SGX PostgreSQL pipeline remains a possible *fallback*
  price source in a later phase — not a dependency.
- **Sequencing:** Layered ("plan as written"), first slice cut tightly at
  Phase 0 to ship fast and de-risk the tooling before the heavy data phase.
- **Environment:** Neo4j + GDS via Docker Compose (version-pinned,
  reproducible, disposable), not Neo4j Desktop.
- **Naming:** Project directory is hyphenated (`asean-graph-signal/`) per the
  plan/README; the importable Python package inside it is underscored
  (`asean_graph/`) because Python cannot import a hyphenated module name.

## Goal

Stand up a reproducible Neo4j + GDS environment and a minimal Python project
that runs a complete toy pipeline: build a 10-node graph in Neo4j → project it
in GDS → run FastRP → pull a 10×64 embedding DataFrame into pandas → train a
throwaway sklearn model. This confirms the full toolchain
(Python ↔ Neo4j ↔ GDS ↔ pandas ↔ scikit-learn) is correctly wired.

## Success criteria

- `docker compose up` brings up Neo4j with the GDS plugin available.
- Running the toy pipeline (via notebook or directly via the module) completes
  with zero manual steps and produces:
  - a 10-node, edge-bearing toy graph in Neo4j,
  - a 10×64 pandas DataFrame of FastRP embeddings indexed by node id/ticker,
  - a trained sklearn model returning a numeric score without error.
- `pytest` passes: config tests run with no services; the toy-pipeline smoke
  test passes when Neo4j is up and **skips with a clear message** when it is
  not (so the suite is green on a machine with Docker down).
- `db.py` surfaces actionable errors ("Neo4j unreachable at <uri>", "GDS
  plugin not found") rather than raw driver stack traces.

## Non-goals (explicitly deferred to later phases)

- Real relationship or price data; any scraping, PDF parsing, or NLP.
- The real graph schema (`schema.cypher`, `SCHEMA.md`), constraints, indexes.
- The stock universe definition, quarterly snapshots, and `as_of_date`
  versioning.
- Node2Vec, hyperparameter grids, embedding-quality visualisation.
- Any prediction model, walk-forward CV, ablation, or interpretability work.
- Creating the full 7-phase directory tree — folders are added per phase to
  avoid empty-folder clutter.

## Architecture

### Directory layout (created this phase)

```
quant/asean-graph-signal/
├── README.md                 # how to run
├── CONTEXT.md                # why: research thesis + phase roadmap
├── requirements.txt
├── config.yaml               # single source of parameters
├── docker-compose.yml        # Neo4j + GDS, version-pinned
├── .env.example              # NEO4J_USER / NEO4J_PASSWORD template (not committed as .env)
├── asean_graph/
│   ├── __init__.py
│   ├── config.py             # load + validate config.yaml, read secrets from env
│   ├── db.py                 # Neo4j driver wrapper: connect, run, check_gds
│   └── toy_pipeline.py       # build_toy_graph / run_fastrp / train_toy_model
├── notebooks/
│   └── 00_toy_pipeline.ipynb # thin: calls toy_pipeline functions, displays output
└── tests/
    ├── __init__.py
    ├── test_config.py
    └── test_toy_pipeline.py
```

### Components

Each module has one clear purpose and a well-defined interface so it can be
understood and tested independently.

**`config.py`** — loads `config.yaml`, validates required keys, reads secrets
from environment variables (never from the committed file).
- Interface: `load_config(path="config.yaml") -> Config`
- Validates presence of: Neo4j URI, embedding dimension, random seed.
- Secrets (`NEO4J_USER`, `NEO4J_PASSWORD`) come from env; missing/invalid keys
  raise a clear `ConfigError`.
- Depends on: `pyyaml`, stdlib `os`.

**`db.py`** — thin, reusable Neo4j driver wrapper. Everything in later phases
reuses this.
- Interface: `connect(config) -> Neo4jClient`; client exposes
  `run(cypher, **params) -> list[dict]`, `check_gds() -> str` (returns GDS
  version or raises), and context-manager `close()`.
- Errors: unreachable database → `Neo4jUnreachableError` with the URI; GDS
  plugin absent → `GdsNotFoundError`.
- Depends on: `neo4j` Python driver.

**`toy_pipeline.py`** — pure functions holding all toy logic so it is
unit-testable (notebooks are not).
- `build_toy_graph(client)` — MERGE a deterministic 10-node graph with a
  handful of edges (idempotent; safe to re-run). Nodes carry a `ticker`-like
  id so the embedding index is meaningful.
- `run_fastrp(client, dim, seed) -> pd.DataFrame` — project the toy graph in
  GDS, run `gds.fastRP.stream`, return a DataFrame indexed by node id with
  `dim` embedding columns. Drops any transient projection it creates.
- `train_toy_model(emb_df) -> float` — fit a trivial sklearn model against a
  synthetic/deterministic target derived from the embeddings and return a
  score. Purpose is only to prove sklearn is wired, not to mean anything.

**`00_toy_pipeline.ipynb`** — a thin notebook that loads config, connects,
calls the three `toy_pipeline` functions in order, and displays the resulting
DataFrame and score. No logic lives in the notebook.

**`docker-compose.yml`** — pins a Neo4j image and enables the GDS plugin
(via `NEO4J_PLUGINS='["graph-data-science"]'` or a mounted plugin, whichever
the chosen image supports), maps the bolt/http ports, and reads credentials
from `.env`. `config.yaml` points at this local instance by default.

### Data / control flow

```
config.yaml + env ──► config.py ──► db.py.connect ──► Neo4jClient
                                                          │
                       toy_pipeline.build_toy_graph(client)   (writes 10 nodes)
                                                          │
                       toy_pipeline.run_fastrp(client) ──► pandas DataFrame (10×dim)
                                                          │
                       toy_pipeline.train_toy_model(df) ──► score (float)
```

The notebook and the smoke test drive this same flow through the same
functions.

## Testing strategy

- **`test_config.py`** (no live services): a valid `config.yaml` loads; a
  config missing a required key raises `ConfigError`; secrets are read from
  env. Uses a temp config fixture.
- **`test_toy_pipeline.py`** (needs Neo4j): a module-level fixture attempts to
  connect; if Neo4j is unreachable, tests are **skipped** with a clear reason
  rather than failing. When connected: `build_toy_graph` creates exactly 10
  nodes; `run_fastrp` returns a DataFrame of shape `(10, dim)`; `check_gds`
  returns a version string; `train_toy_model` returns a float. The test cleans
  up its toy graph and any GDS projection so it is repeatable.
- Follows the repo's existing pytest layout (`tests/` package with
  `__init__.py`), Python 3.11+.

## Error handling

- `config.py`: missing file, malformed YAML, or missing required key →
  `ConfigError` naming the offending key/path.
- `db.py`: connection failure → `Neo4jUnreachableError(uri)`; GDS absent →
  `GdsNotFoundError`; both are caught by the smoke test to drive skip-vs-fail.
- `toy_pipeline.py`: `run_fastrp` releases any GDS graph projection it created
  even on error (try/finally), so re-runs don't collide on an existing
  projection name.

## Deliverables

- Working `docker-compose.yml` bringing up Neo4j + GDS.
- Project scaffold with `README.md`, `CONTEXT.md`, `requirements.txt`,
  `config.yaml`, `.env.example`.
- `asean_graph/` package: `config.py`, `db.py`, `toy_pipeline.py`.
- `notebooks/00_toy_pipeline.ipynb` running the toy pipeline end-to-end.
- `tests/` passing per the strategy above.
- Git commit tagged conceptually as the `v0.1-toy` milestone (tagging optional,
  per user preference).

## Risks

| Risk | Mitigation |
|---|---|
| GDS plugin not enabled in the chosen Neo4j image | `check_gds()` fails loudly with remediation hint; docker-compose pins a known-good image+plugin combo |
| Smoke test flaky/unavailable in CI without Docker | Test skips (not fails) when Neo4j is unreachable, with a clear reason |
| Hyphenated dir vs importable package confusion | Package is `asean_graph/`; tests/notebooks import from it; documented in README |
