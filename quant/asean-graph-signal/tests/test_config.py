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
