"""
backend/chains/skill_extractor_chain.py

Hybrid skill extraction pipeline:
  1. Deterministic keyword/regex matching against skill vocabulary
  2. Sentence-transformer embedding similarity (COSINE >= threshold)
  3. LLM fallback via LangChain LLMChain if still too few hits and llm provided

No OpenAI dependency. LLM is optional — pass None to skip step 3.
"""
import re
import logging
import os
from typing import Dict, List, Optional

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from langchain.prompts import PromptTemplate

logger = logging.getLogger(__name__)

# ── Embedding model (shared, loaded once) ──────────────────────────────────
_EMBED_MODEL: Optional[SentenceTransformer] = None

def _get_embed_model() -> SentenceTransformer:
    global _EMBED_MODEL
    if _EMBED_MODEL is None:
        model_name = os.getenv("SENTENCE_TRANSFORMER_MODEL", "all-mpnet-base-v2")
        logger.info(f"Loading sentence-transformer model: {model_name}")
        _EMBED_MODEL = SentenceTransformer(model_name)
    return _EMBED_MODEL


# ── Thresholds ──────────────────────────────────────────────────────────────
COSINE_HIGH = float(os.getenv("COSINE_THRESHOLD_HIGH", "0.65"))
COSINE_LOW  = float(os.getenv("COSINE_THRESHOLD_LOW",  "0.55"))

# ── LangChain prompt template ───────────────────────────────────────────────
SKILL_PROMPT = PromptTemplate(
    input_variables=["profile_text"],
    template=(
        "Extract concise technical skills, tools, and technologies from the following "
        "text as a comma-separated list. Output only the list, no commentary:\n\n"
        "{profile_text}"
    ),
)


# ── Internal helpers ────────────────────────────────────────────────────────
def _keyword_extract(text: str, skill_vocabulary: List[str]) -> List[Dict]:
    """
    Regex word-boundary match of each skill label/synonym against profile text.
    Returns list of {skill, confidence, source}.
    """
    found: Dict[str, Dict] = {}
    lower = text.lower()
    for skill in skill_vocabulary:
        pattern = r"\b" + re.escape(skill.lower()) + r"\b"
        if re.search(pattern, lower):
            key = skill.lower()
            if key not in found:
                found[key] = {"skill": skill, "confidence": 0.95, "source": "keyword"}
    return list(found.values())


def _embedding_extract(
    profile_text: str,
    skill_vocabulary: List[str],
    existing_skills: List[Dict],
) -> List[Dict]:
    """
    Embed profile text and each skill phrase; return new skills above threshold
    that were not already found by keyword matching.
    """
    already = {d["skill"].lower() for d in existing_skills}
    new_skills: List[Dict] = []

    try:
        model = _get_embed_model()
        skill_embs = model.encode(skill_vocabulary, convert_to_numpy=True, show_progress_bar=False)
        profile_emb = model.encode([profile_text[:4000]], convert_to_numpy=True, show_progress_bar=False)
        sims = cosine_similarity(profile_emb, skill_embs)[0]

        for i, sim in enumerate(sims):
            skill_key = skill_vocabulary[i].lower()
            if skill_key in already:
                continue  # already captured by keyword
            if sim >= COSINE_HIGH:
                new_skills.append({
                    "skill": skill_vocabulary[i],
                    "confidence": round(float(sim), 3),
                    "source": "embedding",
                })
            elif sim >= COSINE_LOW:
                new_skills.append({
                    "skill": skill_vocabulary[i],
                    "confidence": round(float(sim) * 0.85, 3),  # partial-match penalty
                    "source": "embedding_partial",
                })
    except Exception as e:
        logger.warning(f"Embedding extraction failed: {e}")

    return new_skills


def _llm_extract(profile_text: str, llm) -> List[str]:
    """
    LangChain LLMChain fallback. Returns list of raw skill strings.
    """
    try:
        from langchain.chains import LLMChain
        chain = LLMChain(llm=llm, prompt=SKILL_PROMPT)
        resp = chain.invoke({"profile_text": profile_text[:3000]})
        raw = resp.get("text", "") if isinstance(resp, dict) else str(resp)
        return [s.strip() for s in raw.split(",") if s.strip()]
    except Exception as e:
        logger.warning(f"LLM skill extraction failed: {e}")
        return []


# ── Public API ──────────────────────────────────────────────────────────────
def extract_skills(
    profile_text: str,
    skill_vocabulary: List[str],
    llm=None,
    min_skills: int = 3,
) -> List[Dict]:
    """
    Full hybrid extraction pipeline.

    Args:
        profile_text:     Raw text of the candidate's profile/resume.
        skill_vocabulary: Flat list of skill labels (and/or synonyms) to match against.
        llm:              Optional LangChain LLM instance for fallback generation.
        min_skills:       Minimum hits before attempting next stage.

    Returns:
        List of {skill, confidence, source} sorted by confidence desc.
    """
    # Stage 1 — keyword
    skills = _keyword_extract(profile_text, skill_vocabulary)
    logger.debug(f"Keyword extraction: {len(skills)} hits")

    # Stage 2 — embeddings (always run to catch additional signals)
    embed_skills = _embedding_extract(profile_text, skill_vocabulary, skills)
    skills.extend(embed_skills)
    logger.debug(f"After embedding: {len(skills)} total hits")

    # Stage 3 — LLM fallback if still too few
    if len(skills) < min_skills and llm is not None:
        logger.info("Falling back to LLM skill extraction")
        llm_strings = _llm_extract(profile_text, llm)
        existing_lower = {d["skill"].lower() for d in skills}
        for s in llm_strings:
            if s.lower() not in existing_lower:
                skills.append({"skill": s, "confidence": 0.60, "source": "llm"})

    # Deduplicate by skill label (case-insensitive), keep highest confidence
    deduped: Dict[str, Dict] = {}
    for item in skills:
        key = item["skill"].lower()
        if key not in deduped or item["confidence"] > deduped[key]["confidence"]:
            deduped[key] = item

    return sorted(deduped.values(), key=lambda x: x["confidence"], reverse=True)
