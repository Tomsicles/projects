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
