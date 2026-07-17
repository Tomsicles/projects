# ASEAN Graph Signal — Phase 0: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a reproducible Neo4j + GDS environment and a minimal Python project that runs a toy pipeline (build 10-node graph → FastRP → pandas → sklearn) end-to-end, proving the full toolchain is wired.

**Architecture:** A new `quant/asean-graph-signal/` subproject with an importable `asean_graph/` package split into three focused modules (`config`, `db`, `toy_pipeline`), a Docker-Compose'd Neo4j+GDS instance, a thin driver notebook, and a pytest suite that skips gracefully when Neo4j is down.

**Tech Stack:** Python 3.11+, Neo4j 5.x + Graph Data Science plugin (Docker Compose), `neo4j` driver, pandas, scikit-learn, PyYAML, pytest, Jupyter.

## Global Constraints

- Python 3.11+ (matches existing `quant/backtester`).
- Importable package is `asean_graph/` (underscored); project directory is `asean-graph-signal/` (hyphenated).
- Secrets (`NEO4J_USER`, `NEO4J_PASSWORD`) come from environment variables only — never committed. `.env` is git-ignored; `.env.example` is the committed template.
- Neo4j + GDS run via version-pinned Docker Compose.
- Tests that need Neo4j must **skip with a clear reason** (not fail) when Neo4j is unreachable or env/config is absent.
- Do NOT add later-phase dependencies (yfinance, beautifulsoup4, requests, networkx, PDF/NLP libs) — YAGNI for Phase 0.
- Follow existing repo conventions: `CONTEXT.md` (why) + `README.md` (how), per-subproject `requirements.txt`, `tests/` package with `__init__.py`.

## File Structure

- `quant/asean-graph-signal/docker-compose.yml` — Neo4j 5.x + GDS, creds from `.env`.
- `quant/asean-graph-signal/.env.example` — `NEO4J_USER`/`NEO4J_PASSWORD` template.
- `quant/asean-graph-signal/requirements.txt` — Phase 0 deps only.
- `quant/asean-graph-signal/config.yaml` — non-secret params (uri, embedding_dim, random_seed).
- `quant/asean-graph-signal/README.md` — how to run.
- `quant/asean-graph-signal/CONTEXT.md` — research thesis + phase roadmap.
- `quant/asean-graph-signal/asean_graph/__init__.py` — package marker.
- `quant/asean-graph-signal/asean_graph/config.py` — load + validate config, read secrets from env.
- `quant/asean-graph-signal/asean_graph/db.py` — Neo4j driver wrapper (`connect`, `Neo4jClient`, `check_gds`).
- `quant/asean-graph-signal/asean_graph/toy_pipeline.py` — `build_toy_graph`, `run_fastrp`, `train_toy_model`.
- `quant/asean-graph-signal/notebooks/00_toy_pipeline.ipynb` — thin driver notebook.
- `quant/asean-graph-signal/tests/__init__.py`, `test_config.py`, `test_toy_pipeline.py`.
- `.gitignore` (repo root) — add `.env` ignore.

---

### Task 1: Project scaffold & Docker environment

**Files:**
- Create: `quant/asean-graph-signal/requirements.txt`
- Create: `quant/asean-graph-signal/config.yaml`
- Create: `quant/asean-graph-signal/docker-compose.yml`
- Create: `quant/asean-graph-signal/.env.example`
- Create: `quant/asean-graph-signal/README.md`
- Create: `quant/asean-graph-signal/CONTEXT.md`
- Create: `quant/asean-graph-signal/asean_graph/__init__.py`
- Create: `quant/asean-graph-signal/tests/__init__.py`
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Consumes: nothing.
- Produces: the directory skeleton, `config.yaml` keys (`neo4j_uri`, `embedding_dim`, `random_seed`) consumed by Task 2, and a running Neo4j+GDS on `bolt://localhost:7687`.

- [ ] **Step 1: Create the package and test markers**

Create `quant/asean-graph-signal/asean_graph/__init__.py` with:

```python
"""ASEAN corporate-relationship graph signal-discovery project."""
```

Create `quant/asean-graph-signal/tests/__init__.py` as an empty file.

- [ ] **Step 2: Write `requirements.txt`**

Create `quant/asean-graph-signal/requirements.txt`:

```
neo4j>=5.20
pandas>=2.0
numpy>=1.24
scikit-learn>=1.3
scipy>=1.11
pyarrow>=14.0
pyyaml>=6.0
pytest>=7.4
jupyter>=1.0
```

- [ ] **Step 3: Write `config.yaml` (non-secret params only)**

Create `quant/asean-graph-signal/config.yaml`:

```yaml
# Non-secret parameters. Secrets (NEO4J_USER/NEO4J_PASSWORD) come from the
# environment / .env — never put them here.
neo4j_uri: bolt://localhost:7687
embedding_dim: 64
random_seed: 42
```

- [ ] **Step 4: Write `.env.example`**

Create `quant/asean-graph-signal/.env.example`:

```
# Copy to .env and fill in. Neo4j Community requires the username 'neo4j'.
NEO4J_USER=neo4j
NEO4J_PASSWORD=change-me-please
```

- [ ] **Step 5: Write `docker-compose.yml`**

Create `quant/asean-graph-signal/docker-compose.yml`:

```yaml
services:
  neo4j:
    image: neo4j:5.24-community
    container_name: asean-graph-neo4j
    ports:
      - "7474:7474"   # Neo4j Browser
      - "7687:7687"   # Bolt
    environment:
      - NEO4J_AUTH=${NEO4J_USER}/${NEO4J_PASSWORD}
      - NEO4J_PLUGINS=["graph-data-science"]
    volumes:
      - neo4j_data:/data

volumes:
  neo4j_data:
```

- [ ] **Step 6: Ignore `.env`**

Add a line `\.env` handling to `.gitignore` at repo root. Append:

```
# ASEAN graph signal — local secrets
quant/asean-graph-signal/.env
```

- [ ] **Step 7: Write `CONTEXT.md`**

Create `quant/asean-graph-signal/CONTEXT.md`:

```markdown
# CONTEXT.md

Why this subproject exists. See
`../docs/superpowers/specs/2026-07-17-asean-graph-signal-phase0-foundations-design.md`
for the Phase 0 design, and `asean-graph-signal-project-plan.md` for the full
7-phase plan.

## Thesis

Build a dynamic, interpretable, cross-border corporate relationship graph for
ASEAN-listed equities in Neo4j. Generate node embeddings (FastRP → Node2Vec)
that encode each company's structural position, then test whether those
embeddings predict forward stock returns — with queryable graph explanations of
why a signal fired. Differentiators: SGX/ASEAN geography, interpretability (a
queryable graph DB, not a black-box GNN), quarterly-versioned dynamic edges,
cross-border ownership/supply chains.

## Phase roadmap

0. Foundations (this phase) — env + toy pipeline proving the toolchain.
1. Universe & schema.
2. Data acquisition pipeline (hardest phase).
3. Graph construction & loading.
4. Embedding generation.
5. Prediction model (walk-forward CV + ablation).
6. Interpretability layer.
7. Dynamic graph & temporal analysis.

Each phase gets its own spec → plan → build cycle.
```

- [ ] **Step 8: Write `README.md`**

Create `quant/asean-graph-signal/README.md`:

````markdown
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
````

- [ ] **Step 9: Bring up the environment and verify Neo4j + GDS**

Run (from `quant/asean-graph-signal/`, with `.env` created):

```bash
docker compose up -d
```

Then verify GDS is present (wait ~15s for startup):

```bash
docker exec asean-graph-neo4j cypher-shell -u neo4j -p <your-password> "RETURN gds.version() AS version"
```

Expected: a version string (e.g. `2.x.x`), not an error. If it errors with an
unknown-function message, the GDS plugin did not load — check the
`NEO4J_PLUGINS` line and image tag.

- [ ] **Step 10: Commit**

```bash
git add quant/asean-graph-signal .gitignore
git commit -m "feat(asean-graph): scaffold Phase 0 project + Docker Neo4j/GDS env"
```

---

### Task 2: Config loader (`config.py`)

**Files:**
- Create: `quant/asean-graph-signal/asean_graph/config.py`
- Test: `quant/asean-graph-signal/tests/test_config.py`

**Interfaces:**
- Consumes: `config.yaml` keys from Task 1; `NEO4J_USER`/`NEO4J_PASSWORD` env vars.
- Produces: `load_config(path="config.yaml") -> Config`; `Config` dataclass with fields `neo4j_uri: str`, `neo4j_user: str`, `neo4j_password: str`, `embedding_dim: int`, `random_seed: int`; `ConfigError(Exception)`.

- [ ] **Step 1: Write the failing tests**

Create `quant/asean-graph-signal/tests/test_config.py`:

```python
import pytest

from asean_graph.config import load_config, Config, ConfigError


def _write_config(tmp_path, body):
    p = tmp_path / "config.yaml"
    p.write_text(body)
    return p


def test_load_valid_config(tmp_path, monkeypatch):
    monkeypatch.setenv("NEO4J_USER", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", "secret")
    p = _write_config(
        tmp_path,
        "neo4j_uri: bolt://localhost:7687\nembedding_dim: 64\nrandom_seed: 42\n",
    )
    cfg = load_config(p)
    assert isinstance(cfg, Config)
    assert cfg.neo4j_uri == "bolt://localhost:7687"
    assert cfg.neo4j_user == "neo4j"
    assert cfg.neo4j_password == "secret"
    assert cfg.embedding_dim == 64
    assert cfg.random_seed == 42


def test_missing_required_key_raises(tmp_path, monkeypatch):
    monkeypatch.setenv("NEO4J_USER", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", "secret")
    p = _write_config(tmp_path, "neo4j_uri: bolt://localhost:7687\n")
    with pytest.raises(ConfigError) as exc:
        load_config(p)
    assert "embedding_dim" in str(exc.value)


def test_missing_env_secrets_raises(tmp_path, monkeypatch):
    monkeypatch.delenv("NEO4J_USER", raising=False)
    monkeypatch.delenv("NEO4J_PASSWORD", raising=False)
    p = _write_config(
        tmp_path,
        "neo4j_uri: bolt://localhost:7687\nembedding_dim: 64\nrandom_seed: 42\n",
    )
    with pytest.raises(ConfigError):
        load_config(p)


def test_missing_file_raises(tmp_path, monkeypatch):
    monkeypatch.setenv("NEO4J_USER", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", "secret")
    with pytest.raises(ConfigError):
        load_config(tmp_path / "does_not_exist.yaml")
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `quant/asean-graph-signal/`): `pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'asean_graph.config'` (or import error).

- [ ] **Step 3: Write minimal implementation**

Create `quant/asean-graph-signal/asean_graph/config.py`:

```python
"""Load and validate non-secret config; read secrets from the environment."""
import os
from dataclasses import dataclass
from pathlib import Path

import yaml

REQUIRED_KEYS = ("neo4j_uri", "embedding_dim", "random_seed")


class ConfigError(Exception):
    """Raised when configuration is missing or invalid."""


@dataclass
class Config:
    neo4j_uri: str
    neo4j_user: str
    neo4j_password: str
    embedding_dim: int
    random_seed: int


def load_config(path="config.yaml") -> Config:
    p = Path(path)
    if not p.exists():
        raise ConfigError(f"Config file not found: {p}")
    try:
        data = yaml.safe_load(p.read_text()) or {}
    except yaml.YAMLError as e:
        raise ConfigError(f"Malformed YAML in {p}: {e}") from e

    missing = [k for k in REQUIRED_KEYS if k not in data]
    if missing:
        raise ConfigError(f"Missing required config keys: {', '.join(missing)}")

    user = os.environ.get("NEO4J_USER")
    password = os.environ.get("NEO4J_PASSWORD")
    if not user or not password:
        raise ConfigError(
            "NEO4J_USER and NEO4J_PASSWORD must be set in the environment"
        )

    return Config(
        neo4j_uri=str(data["neo4j_uri"]),
        neo4j_user=user,
        neo4j_password=password,
        embedding_dim=int(data["embedding_dim"]),
        random_seed=int(data["random_seed"]),
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_config.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add quant/asean-graph-signal/asean_graph/config.py quant/asean-graph-signal/tests/test_config.py
git commit -m "feat(asean-graph): add validated config loader"
```

---

### Task 3: Neo4j driver wrapper (`db.py`)

**Files:**
- Create: `quant/asean-graph-signal/asean_graph/db.py`
- Test: `quant/asean-graph-signal/tests/test_toy_pipeline.py` (shared live-Neo4j test module; this task adds the connection/GDS tests, Task 4 adds pipeline tests)

**Interfaces:**
- Consumes: `Config` from Task 2.
- Produces: `connect(config) -> Neo4jClient`; `Neo4jClient` with methods `run(cypher, **params) -> list[dict]`, `check_gds() -> str`, `close()`, and context-manager support; exceptions `Neo4jUnreachableError(Exception)`, `GdsNotFoundError(Exception)`.

- [ ] **Step 1: Write the failing tests**

Create `quant/asean-graph-signal/tests/test_toy_pipeline.py`:

```python
import pytest

from asean_graph.config import load_config, ConfigError
from asean_graph.db import connect, Neo4jUnreachableError


@pytest.fixture(scope="module")
def client():
    try:
        cfg = load_config()
    except ConfigError as e:
        pytest.skip(f"config unavailable: {e}")
    try:
        c = connect(cfg)
    except Neo4jUnreachableError as e:
        pytest.skip(str(e))
    yield c
    c.run("MATCH (n:ToyNode) DETACH DELETE n")
    c.close()


def test_run_returns_list_of_dicts(client):
    rows = client.run("RETURN 1 AS n")
    assert rows == [{"n": 1}]


def test_check_gds_returns_version(client):
    version = client.check_gds()
    assert isinstance(version, str)
    assert len(version) > 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_toy_pipeline.py -v`
Expected: FAIL — import error (`No module named 'asean_graph.db'`). (If Neo4j is down the fixture would skip, but the import error happens first, so this fails.)

- [ ] **Step 3: Write minimal implementation**

Create `quant/asean-graph-signal/asean_graph/db.py`:

```python
"""Thin Neo4j driver wrapper reused by every later phase."""
from neo4j import GraphDatabase
from neo4j.exceptions import ServiceUnavailable, AuthError


class Neo4jUnreachableError(Exception):
    """Raised when the Neo4j server cannot be reached."""


class GdsNotFoundError(Exception):
    """Raised when the Graph Data Science plugin is not installed."""


class Neo4jClient:
    def __init__(self, driver):
        self._driver = driver

    def run(self, cypher, **params):
        with self._driver.session() as session:
            result = session.run(cypher, **params)
            return [dict(record) for record in result]

    def check_gds(self) -> str:
        try:
            rows = self.run("RETURN gds.version() AS version")
        except Exception as e:  # noqa: BLE001 - surface as a clear domain error
            raise GdsNotFoundError(
                "GDS plugin not found; ensure the graph-data-science plugin "
                "is installed and Neo4j has finished starting"
            ) from e
        return rows[0]["version"]

    def close(self):
        self._driver.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def connect(config) -> Neo4jClient:
    driver = GraphDatabase.driver(
        config.neo4j_uri, auth=(config.neo4j_user, config.neo4j_password)
    )
    try:
        driver.verify_connectivity()
    except (ServiceUnavailable, OSError) as e:
        driver.close()
        raise Neo4jUnreachableError(
            f"Neo4j unreachable at {config.neo4j_uri}"
        ) from e
    except AuthError as e:
        driver.close()
        raise Neo4jUnreachableError(
            f"Neo4j auth failed at {config.neo4j_uri}: {e}"
        ) from e
    return Neo4jClient(driver)
```

- [ ] **Step 4: Run tests to verify they pass**

Run (with `docker compose up -d` and env vars loaded): `pytest tests/test_toy_pipeline.py -v`
Expected: 2 passed. (If Neo4j is down: 2 skipped with a clear reason — also acceptable, but bring it up to confirm the wiring at least once.)

- [ ] **Step 5: Commit**

```bash
git add quant/asean-graph-signal/asean_graph/db.py quant/asean-graph-signal/tests/test_toy_pipeline.py
git commit -m "feat(asean-graph): add Neo4j driver wrapper with GDS check"
```

---

### Task 4: Toy pipeline (`toy_pipeline.py`)

**Files:**
- Create: `quant/asean-graph-signal/asean_graph/toy_pipeline.py`
- Test: `quant/asean-graph-signal/tests/test_toy_pipeline.py` (extend with pipeline tests)

**Interfaces:**
- Consumes: `Neo4jClient` from Task 3.
- Produces: `build_toy_graph(client) -> None`; `run_fastrp(client, dim=64, seed=42) -> pandas.DataFrame` (index = ticker, columns `emb_0..emb_{dim-1}`, shape `(10, dim)`); `train_toy_model(emb_df) -> float`. Module constant `TOY_GRAPH_NAME = "toyGraph"`.

- [ ] **Step 1: Write the failing tests (extend the live-Neo4j module)**

Append to `quant/asean-graph-signal/tests/test_toy_pipeline.py`:

```python
from asean_graph.toy_pipeline import build_toy_graph, run_fastrp, train_toy_model


def test_build_toy_graph_creates_ten_nodes(client):
    build_toy_graph(client)
    rows = client.run("MATCH (n:ToyNode) RETURN count(n) AS c")
    assert rows[0]["c"] == 10


def test_run_fastrp_returns_10_by_dim(client):
    build_toy_graph(client)
    emb = run_fastrp(client, dim=64, seed=42)
    assert emb.shape == (10, 64)
    assert list(emb.columns) == [f"emb_{i}" for i in range(64)]


def test_train_toy_model_returns_float(client):
    build_toy_graph(client)
    emb = run_fastrp(client, dim=64, seed=42)
    score = train_toy_model(emb)
    assert isinstance(score, float)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_toy_pipeline.py -v`
Expected: FAIL — `ImportError` / `ModuleNotFoundError` for `asean_graph.toy_pipeline` (or skips if Neo4j down; bring it up so they actually run and fail on the missing module).

- [ ] **Step 3: Write minimal implementation**

Create `quant/asean-graph-signal/asean_graph/toy_pipeline.py`:

```python
"""Toy pipeline: prove Neo4j -> GDS -> pandas -> sklearn is wired end to end."""
import pandas as pd
from sklearn.linear_model import LinearRegression

TOY_GRAPH_NAME = "toyGraph"


def build_toy_graph(client) -> None:
    """Create a deterministic, idempotent 10-node ring + one chord."""
    client.run("MATCH (n:ToyNode) DETACH DELETE n")
    client.run(
        """
        UNWIND range(0, 9) AS i
        MERGE (:ToyNode {id: i, ticker: 'T' + toString(i)})
        """
    )
    client.run(
        """
        UNWIND range(0, 9) AS i
        MATCH (a:ToyNode {id: i})
        MATCH (b:ToyNode {id: (i + 1) % 10})
        MERGE (a)-[:LINKS]->(b)
        """
    )
    client.run(
        """
        MATCH (a:ToyNode {id: 0})
        MATCH (b:ToyNode {id: 5})
        MERGE (a)-[:LINKS]->(b)
        """
    )


def run_fastrp(client, dim=64, seed=42) -> pd.DataFrame:
    """Project the toy graph, run FastRP, return a (10 x dim) embedding frame."""
    # Drop any leftover projection (failIfMissing=false), then project fresh.
    client.run("CALL gds.graph.drop($name, false) YIELD graphName RETURN graphName",
               name=TOY_GRAPH_NAME)
    try:
        client.run(
            "CALL gds.graph.project($name, 'ToyNode', "
            "{LINKS: {orientation: 'UNDIRECTED'}}) "
            "YIELD graphName RETURN graphName",
            name=TOY_GRAPH_NAME,
        )
        rows = client.run(
            """
            CALL gds.fastRP.stream($name, {
              embeddingDimension: $dim,
              randomSeed: $seed
            })
            YIELD nodeId, embedding
            RETURN gds.util.asNode(nodeId).ticker AS ticker, embedding
            """,
            name=TOY_GRAPH_NAME, dim=dim, seed=seed,
        )
    finally:
        client.run("CALL gds.graph.drop($name, false) YIELD graphName RETURN graphName",
                   name=TOY_GRAPH_NAME)

    df = pd.DataFrame(rows)
    emb = pd.DataFrame(
        df["embedding"].tolist(),
        index=df["ticker"],
        columns=[f"emb_{i}" for i in range(dim)],
    )
    return emb.sort_index()


def train_toy_model(emb_df) -> float:
    """Fit a trivial model against a synthetic target; return R^2. Proves sklearn works."""
    y = emb_df["emb_0"] + emb_df["emb_1"]
    model = LinearRegression()
    model.fit(emb_df.values, y.values)
    return float(model.score(emb_df.values, y.values))
```

- [ ] **Step 4: Run tests to verify they pass**

Run (Neo4j up, env loaded): `pytest tests/test_toy_pipeline.py -v`
Expected: 5 passed (2 from Task 3 + 3 here).

- [ ] **Step 5: Run the full suite**

Run (from `quant/asean-graph-signal/`): `pytest -v`
Expected: `test_config.py` 4 passed; `test_toy_pipeline.py` 5 passed (or 5 skipped if you deliberately test with Neo4j down — confirm the skip reason is clear).

- [ ] **Step 6: Commit**

```bash
git add quant/asean-graph-signal/asean_graph/toy_pipeline.py quant/asean-graph-signal/tests/test_toy_pipeline.py
git commit -m "feat(asean-graph): add toy FastRP->sklearn pipeline"
```

---

### Task 5: Driver notebook (`00_toy_pipeline.ipynb`)

**Files:**
- Create: `quant/asean-graph-signal/notebooks/00_toy_pipeline.ipynb`

**Interfaces:**
- Consumes: `load_config`, `connect`, `build_toy_graph`, `run_fastrp`, `train_toy_model`.
- Produces: nothing importable — a runnable notebook that displays the embedding DataFrame and the model score.

- [ ] **Step 1: Create the notebook**

Create `quant/asean-graph-signal/notebooks/00_toy_pipeline.ipynb` with this exact content (valid nbformat v4 JSON — no logic beyond calling the package):

```json
{
 "cells": [
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "# 00 — Toy Pipeline\n",
    "Proves Neo4j → GDS → pandas → sklearn is wired. Requires `docker compose up -d` and `NEO4J_USER`/`NEO4J_PASSWORD` in the environment."
   ]
  },
  {
   "cell_type": "code",
   "execution_count": null,
   "metadata": {},
   "source": [
    "from asean_graph.config import load_config\n",
    "from asean_graph.db import connect\n",
    "from asean_graph.toy_pipeline import build_toy_graph, run_fastrp, train_toy_model\n",
    "\n",
    "cfg = load_config()\n",
    "client = connect(cfg)\n",
    "print('GDS version:', client.check_gds())"
   ],
   "outputs": []
  },
  {
   "cell_type": "code",
   "execution_count": null,
   "metadata": {},
   "source": [
    "build_toy_graph(client)\n",
    "emb = run_fastrp(client, dim=cfg.embedding_dim, seed=cfg.random_seed)\n",
    "emb.head(10)"
   ],
   "outputs": []
  },
  {
   "cell_type": "code",
   "execution_count": null,
   "metadata": {},
   "source": [
    "score = train_toy_model(emb)\n",
    "print('Toy model R^2:', score)\n",
    "client.close()"
   ],
   "outputs": []
  }
 ],
 "metadata": {
  "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
  "language_info": {"name": "python", "version": "3.11"}
 },
 "nbformat": 4,
 "nbformat_minor": 5
}
```

- [ ] **Step 2: Verify the notebook runs end-to-end**

With Neo4j up and env loaded, run (from `quant/asean-graph-signal/`):

```bash
jupyter nbconvert --to notebook --execute --output-dir /tmp notebooks/00_toy_pipeline.ipynb
```

Expected: executes without error; the executed copy shows a GDS version, a 10-row embedding table, and a printed `Toy model R^2` value. (On Windows without `/tmp`, use `--output-dir .` and delete the executed copy after, or run the notebook interactively in Jupyter instead.)

- [ ] **Step 3: Commit**

```bash
git add quant/asean-graph-signal/notebooks/00_toy_pipeline.ipynb
git commit -m "feat(asean-graph): add toy pipeline driver notebook"
```

---

## Self-Review

**Spec coverage:**
- Docker Neo4j+GDS env → Task 1. ✓
- Scaffold (`README`, `CONTEXT`, `requirements.txt`, `config.yaml`, `.env.example`) → Task 1. ✓
- `config.py` load + validate + env secrets → Task 2. ✓
- `db.py` connect/run/check_gds + clear errors → Task 3. ✓
- `toy_pipeline.py` build/fastrp/train → Task 4. ✓
- Notebook thin driver → Task 5. ✓
- `test_config.py` (no services) → Task 2; `test_toy_pipeline.py` (skip-if-down) → Tasks 3–4. ✓
- Success criteria (10×64 frame, trained model, GDS reachable, suite green when Docker down) → Tasks 3–5 verification steps. ✓
- Non-goals (real schema/universe/scraping/Node2Vec/prediction) → none introduced. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command shows expected output. ✓

**Type consistency:** `Config` fields (`neo4j_uri`, `neo4j_user`, `neo4j_password`, `embedding_dim`, `random_seed`) used identically in Tasks 2/3/5. `connect`/`Neo4jClient.run`/`check_gds`/`close` signatures match across Tasks 3/4/5. `build_toy_graph`/`run_fastrp(dim,seed)`/`train_toy_model` names match across Task 4 and notebook. `TOY_GRAPH_NAME` defined once. `Neo4jUnreachableError`/`GdsNotFoundError`/`ConfigError` referenced consistently. ✓
