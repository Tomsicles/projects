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
