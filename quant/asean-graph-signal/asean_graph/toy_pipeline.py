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
