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
