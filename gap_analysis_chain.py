"""
backend/chains/gap_analysis_chain.py

Computes skill gap between a candidate profile and a target role.
Uses sentence-transformer embeddings to measure semantic presence of each
required skill in the profile text — no keyword dependency.

Importance weighting:
  core skill     → weight 2.0
  optional skill → weight 1.0

Returns a structured gap report compatible with the /analyze API response.
"""
import logging
import os
from typing import Dict, List

import numpy as np

logger = logging.getLogger(__name__)

COSINE_PRESENT = float(os.getenv("COSINE_THRESHOLD_HIGH", "0.65"))

# ── Shared embedding model ──────────────────────────────────────────────────
_EMBED_MODEL = None

def _get_embed_model():
    global _EMBED_MODEL
    if _EMBED_MODEL is None:
        from sentence_transformers import SentenceTransformer
        model_name = os.getenv("SENTENCE_TRANSFORMER_MODEL", "all-mpnet-base-v2")
        _EMBED_MODEL = SentenceTransformer(model_name)
    return _EMBED_MODEL


# ── Public API ──────────────────────────────────────────────────────────────
def compute_skill_match(
    profile_text: str,
    role_skill_list: List[Dict],
    extracted_skill_ids: set = None,
    threshold_present: float = COSINE_PRESENT,
) -> Dict:
    """
    Compute a gap analysis between a candidate and a role.

    Args:
        profile_text:       Full text of the candidate's profile.
        role_skill_list:    List of {skill_id, label, importance, synonyms?}
                            from a role JSON file.
        extracted_skill_ids: Optional set of skill_ids already found by
                            keyword extraction — used to boost confidence.
        threshold_present:  Cosine similarity above which a skill is "present".

    Returns:
        {
          matched_skills:          [{skill_id, label, confidence, importance}],
          missing_core_skills:     [{skill_id, label, similarity}],
          missing_optional_skills: [{skill_id, label, similarity}],
          match_score:             float 0–100,
          keyword_boost_count:     int  (how many matched via keyword shortcut)
        }
    """
    if not role_skill_list:
        return {
            "matched_skills": [],
            "missing_core_skills": [],
            "missing_optional_skills": [],
            "match_score": 0.0,
            "keyword_boost_count": 0,
        }

    extracted_ids = extracted_skill_ids or set()
    labels = [s["label"] for s in role_skill_list]

    # Build enriched phrases for embedding (label + synonyms improve recall)
    phrases = []
    for s in role_skill_list:
        syns = s.get("synonyms", [])
        phrase = s["label"] if not syns else f"{s['label']}: {', '.join(syns[:4])}"
        phrases.append(phrase)

    # Compute similarities
    try:
        model = _get_embed_model()
        skill_embs = model.encode(phrases, convert_to_numpy=True, show_progress_bar=False)
        profile_emb = model.encode([profile_text[:4000]], convert_to_numpy=True, show_progress_bar=False)
        from sklearn.metrics.pairwise import cosine_similarity
        sims = cosine_similarity(profile_emb, skill_embs)[0]
    except Exception as e:
        logger.warning(f"Gap analysis embedding failed: {e}; using keyword-only fallback.")
        sims = np.zeros(len(role_skill_list))

    matched: List[Dict] = []
    missing_core: List[Dict] = []
    missing_optional: List[Dict] = []
    total_weight = 0.0
    matched_weight = 0.0
    keyword_boosts = 0

    for i, skill in enumerate(role_skill_list):
        importance = skill.get("importance", "optional")
        weight = 2.0 if importance == "core" else 1.0
        total_weight += weight

        sim = float(sims[i])
        skill_id = skill.get("skill_id", skill["label"].lower().replace(" ", "_"))

        # Keyword-extracted skills are treated as definitively present
        keyword_present = skill_id in extracted_ids
        if keyword_present:
            sim = max(sim, 0.90)  # floor at high confidence
            keyword_boosts += 1

        if sim >= threshold_present or keyword_present:
            matched.append({
                "skill_id": skill_id,
                "label": skill["label"],
                "confidence": round(sim, 3),
                "importance": importance,
            })
            matched_weight += weight
        else:
            entry = {"skill_id": skill_id, "label": skill["label"], "similarity": round(sim, 3)}
            if importance == "core":
                missing_core.append(entry)
            else:
                missing_optional.append(entry)

    match_score = (matched_weight / total_weight * 100) if total_weight > 0 else 0.0

    # Sort missing by similarity desc (closest-to-threshold first → easiest wins)
    missing_core.sort(key=lambda x: x["similarity"], reverse=True)
    missing_optional.sort(key=lambda x: x["similarity"], reverse=True)

    return {
        "matched_skills": matched,
        "missing_core_skills": missing_core,
        "missing_optional_skills": missing_optional,
        "match_score": round(float(match_score), 1),
        "keyword_boost_count": keyword_boosts,
    }
