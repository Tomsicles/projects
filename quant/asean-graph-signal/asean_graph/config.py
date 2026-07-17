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
