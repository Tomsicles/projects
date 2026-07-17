import pytest

from asean_graph.config import load_config, ConfigError
from asean_graph.db import connect, Neo4jUnreachableError
from asean_graph.toy_pipeline import build_toy_graph, run_fastrp, train_toy_model


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
