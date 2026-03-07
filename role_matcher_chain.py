"""
backend/chains/role_matcher_chain.py

FAISS-backed semantic role matching.
  1. Build an inner-product (cosine) FAISS index of all role job_snippets at startup.
  2. At query time, embed profile text and retrieve top-K nearest snippets.
  3. Aggregate hit counts per role → rank roles → enrich with gap metadata.

No OpenAI dependency. Pure sentence-transformers + FAISS.
"""
import json
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# ── Shared embedding model (imported lazily to allow mocking in tests) ──────
_EMBED_MODEL = None

def _get_embed_model():
    global _EMBED_MODEL
    if _EMBED_MODEL is None:
        from sentence_transformers import SentenceTransformer
        model_name = os.getenv("SENTENCE_TRANSFORMER_MODEL", "all-mpnet-base-v2")
        logger.info(f"Loading sentence-transformer model for role matching: {model_name}")
        _EMBED_MODEL = SentenceTransformer(model_name)
    return _EMBED_MODEL


# ── Paths ────────────────────────────────────────────────────────────────────
def _roles_dir() -> Path:
    env = os.getenv("ROLES_DIR")
    if env:
        return Path(env)
    # Resolve relative to this file: backend/chains/ → backend/data/roles
    return Path(__file__).parent.parent / "data" / "roles"


# ── Data loading ─────────────────────────────────────────────────────────────
def load_roles() -> List[Dict]:
    """Load all role JSON files from ROLES_DIR."""
    roles = []
    for fname in sorted(_roles_dir().glob("*.json")):
        try:
            roles.append(json.loads(fname.read_text()))
        except Exception as e:
            logger.error(f"Failed to load role {fname}: {e}")
    return roles


# ── Index construction ────────────────────────────────────────────────────────
def build_role_index(roles: List[Dict]) -> Tuple[Optional[object], Optional[np.ndarray], Optional[List[Dict]]]:
    """
    Build a FAISS flat inner-product index over all role job_snippets.

    Returns:
        (faiss_index, embeddings_matrix, metadata_list)
        metadata_list[i] = {"role_id": ..., "display_name": ..., "snippet": ...}
        Returns (None, None, None) if faiss is unavailable or no docs.
    """
    try:
        import faiss
    except ImportError:
        logger.warning("faiss-cpu not installed; falling back to numpy cosine matching.")
        return None, None, None

    docs: List[str] = []
    meta: List[Dict] = []

    for role in roles:
        for snippet in role.get("job_snippets", []):
            docs.append(snippet)
            meta.append({
                "role_id": role["role_id"],
                "display_name": role.get("display_name", role["role_id"]),
            })

    if not docs:
        logger.warning("No job snippets found; role index is empty.")
        return None, None, None

    model = _get_embed_model()
    logger.info(f"Encoding {len(docs)} job snippets for FAISS index…")
    embeddings = model.encode(docs, convert_to_numpy=True, show_progress_bar=False, batch_size=64)

    dim = embeddings.shape[1]
    faiss.normalize_L2(embeddings)
    index = faiss.IndexFlatIP(dim)
    index.add(embeddings)

    logger.info(f"FAISS index built: {index.ntotal} vectors, dim={dim}")
    return index, embeddings, meta


def _numpy_match_roles(
    profile_text: str,
    roles: List[Dict],
    top_k: int,
) -> List[Dict]:
    """
    Pure-numpy cosine fallback when FAISS is not installed.
    Averages cosine similarity between profile and each role's job_snippets.
    """
    model = _get_embed_model()
    profile_emb = model.encode([profile_text[:4000]], convert_to_numpy=True, show_progress_bar=False)

    scores = []
    for role in roles:
        snippets = role.get("job_snippets", [])
        if not snippets:
            continue
        snippet_embs = model.encode(snippets, convert_to_numpy=True, show_progress_bar=False)
        from sklearn.metrics.pairwise import cosine_similarity as cos_sim
        sims = cos_sim(profile_emb, snippet_embs)[0]
        avg_top5 = float(np.mean(np.sort(sims)[::-1][:5]))
        scores.append({
            "role_id": role["role_id"],
            "display_name": role.get("display_name", role["role_id"]),
            "score": round(avg_top5 * 20, 2),  # scale to ~0-20 to match FAISS hit counts
            "skill_list": role.get("skill_list", []),
        })

    scores.sort(key=lambda x: x["score"], reverse=True)
    return scores[:top_k]


# ── Query ─────────────────────────────────────────────────────────────────────
def match_roles(
    profile_text: str,
    roles: List[Dict],
    index,
    meta: Optional[List[Dict]],
    top_k: int = 3,
    retrieved_k: int = 30,
) -> List[Dict]:
    """
    Find top_k matching roles for a candidate profile.

    Args:
        profile_text: Full profile text for embedding.
        roles:        List of role dicts (from load_roles()).
        index:        FAISS index from build_role_index() — or None for numpy fallback.
        meta:         Metadata list from build_role_index().
        top_k:        Number of roles to return.
        retrieved_k:  How many nearest snippets to retrieve before aggregating.

    Returns:
        List of role match dicts sorted by score desc.
        Each dict: {role_id, display_name, score, skill_list}
    """
    if index is None or meta is None:
        logger.info("FAISS unavailable; using numpy cosine fallback for role matching.")
        return _numpy_match_roles(profile_text, roles, top_k)

    try:
        import faiss
        model = _get_embed_model()
        q_emb = model.encode([profile_text[:4000]], convert_to_numpy=True, show_progress_bar=False)
        faiss.normalize_L2(q_emb)

        k = min(retrieved_k, index.ntotal)
        distances, indices = index.search(q_emb, k)

        # Aggregate: score = sum of cosine similarities for each role's snippets
        role_scores: Dict[str, float] = {}
        for dist, idx in zip(distances[0], indices[0]):
            if idx < 0:
                continue
            role_id = meta[idx]["role_id"]
            role_scores[role_id] = role_scores.get(role_id, 0.0) + float(dist)

        # Build enriched result list
        role_lookup = {r["role_id"]: r for r in roles}
        results = []
        for role_id, score in sorted(role_scores.items(), key=lambda x: x[1], reverse=True):
            role = role_lookup.get(role_id, {})
            results.append({
                "role_id": role_id,
                "display_name": role.get("display_name", role_id),
                "score": round(score, 4),
                "skill_list": role.get("skill_list", []),
            })

        return results[:top_k]

    except Exception as e:
        logger.warning(f"FAISS match_roles failed ({e}); falling back to numpy.")
        return _numpy_match_roles(profile_text, roles, top_k)
