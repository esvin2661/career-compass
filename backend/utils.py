"""
utils.py – Profile parsing, ontology helpers, and GitHub fetching.
No OpenAI/LLM dependency. Embeddings and LLM calls live in /chains.
"""
import logging
import re
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


# ── Profile parsing ──────────────────────────────────────────────────────────

def parse_resume_text(text: str) -> dict:
    """Light-weight heuristic parser for free-text resumes."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    headline = lines[0] if lines else "Candidate"

    experience_bullets, skills_text = [], ""
    in_skills, in_experience = False, False

    for line in lines:
        ll = line.lower()
        if any(kw in ll for kw in ["experience", "work history", "employment"]):
            in_experience, in_skills = True, False
        elif any(kw in ll for kw in ["skills", "technical skills", "technologies"]):
            in_skills, in_experience = True, False
        elif any(kw in ll for kw in ["education", "projects", "certifications"]):
            in_experience = False

        if in_experience and line.startswith(("-", "•", "–", "*")):
            experience_bullets.append(line.lstrip("-•–* ").strip())
        if in_skills:
            skills_text += " " + line

    return {
        "headline": headline,
        "education": [],
        "projects": [],
        "experience": experience_bullets[:20],
        "explicit_skills": _tokenize_skill_text(skills_text or text),
        "raw_text": text,
    }


def parse_synthetic_profile(profile: dict) -> dict:
    """Normalize a structured JSON profile into canonical form."""
    bullets = [b for exp in profile.get("experience", []) for b in exp.get("bullets", [])]
    project_texts = [p.get("description", "") for p in profile.get("projects", []) if p.get("description")]
    raw_text = " ".join(profile.get("explicit_skills", []) + bullets + project_texts)

    return {
        "headline": profile.get("headline", profile.get("name", "Candidate")),
        "education": profile.get("education", []),
        "projects": profile.get("projects", []),
        "experience": bullets,
        "explicit_skills": profile.get("explicit_skills", []),
        "raw_text": raw_text,
        "target_roles": profile.get("target_roles", []),
        "preferences": profile.get("preferences", {}),
    }


def _tokenize_skill_text(text: str) -> list[str]:
    tokens = re.split(r"[,\n;|]", text)
    return [t.strip() for t in tokens if 2 < len(t.strip()) < 60]


# ── Ontology helpers ─────────────────────────────────────────────────────────

def build_skill_ontology(roles: list[dict]) -> dict:
    """
    Merge all role skill lists into {skill_id: {label, synonyms, importance}}.
    """
    ontology = {}
    for role in roles:
        for skill in role.get("skill_list", []):
            sid = skill["skill_id"]
            if sid not in ontology:
                ontology[sid] = {
                    "skill_id": sid,
                    "label": skill["label"],
                    "synonyms": list(skill.get("synonyms", [])),
                    "importance": skill["importance"],
                }
            else:
                existing = set(ontology[sid]["synonyms"])
                existing.update(skill.get("synonyms", []))
                ontology[sid]["synonyms"] = list(existing)
                if skill["importance"] == "core":
                    ontology[sid]["importance"] = "core"
    return ontology


def build_skill_vocabulary(ontology: dict) -> list[str]:
    """
    Flatten ontology into a deduplicated vocabulary list.
    Includes labels and all synonyms — used as the skill_vocabulary for extraction.
    """
    vocab = set()
    for entry in ontology.values():
        vocab.add(entry["label"])
        vocab.update(entry.get("synonyms", []))
    return sorted(vocab)


# ── Seniority inference ──────────────────────────────────────────────────────

def infer_seniority(profile: dict) -> str:
    raw = profile.get("raw_text", "").lower()
    senior_signals = ["lead ", "senior", "principal", "staff ", "architect", "manager", "7+", "8+", "10+"]
    mid_signals = ["3 years", "4 years", "5 years", "6 years", "mid-level"]
    if any(s in raw for s in senior_signals):
        return "senior"
    if any(s in raw for s in mid_signals) or len(profile.get("experience", [])) > 10:
        return "mid-level"
    return "junior"


# ── GitHub fetching ──────────────────────────────────────────────────────────

async def fetch_github_profile(github_url: str) -> Optional[str]:
    """Fetch README and repo metadata from a public GitHub URL."""
    import httpx
    match = re.search(r"github\.com/([^/]+)(?:/([^/]+))?", github_url)
    if not match:
        return None

    owner, repo = match.group(1), match.group(2)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if repo:
                for branch in ("main", "master"):
                    url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/README.md"
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        return resp.text[:3000]
            else:
                url = f"https://api.github.com/users/{owner}/repos?sort=pushed&per_page=10"
                resp = await client.get(url, headers={"Accept": "application/vnd.github.v3+json"})
                if resp.status_code == 200:
                    repos = resp.json()
                    parts = []
                    for r in repos:
                        parts.extend(r.get("topics", []))
                        if r.get("language"):
                            parts.append(r["language"])
                        parts.append(r.get("name", ""))
                        parts.append(r.get("description") or "")
                    return " ".join(parts)
    except Exception as e:
        logger.warning(f"GitHub fetch failed for {github_url}: {e}")

    return None
