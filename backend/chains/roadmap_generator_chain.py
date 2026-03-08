"""
backend/chains/roadmap_generator_chain.py

Generates a personalized, weekly-bucketed learning roadmap.

Pipeline:
  1. Deterministic: map missing skill_ids → matching courses from courses.json.
     Greedy selection covers the most missing core skills first.
  2. Optional LangChain LLM refinement: can produce a motivational summary or
     re-rank items — falls back silently to deterministic output if LLM fails.

No OpenAI dependency. LLM is fully optional.
"""
import json
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


# ── Path helpers ─────────────────────────────────────────────────────────────
def _courses_path() -> Path:
    env = os.getenv("COURSES_PATH")
    if env:
        return Path(env)
    return Path(__file__).parent.parent / "data" / "courses.json"


def load_courses() -> List[Dict]:
    try:
        return json.loads(_courses_path().read_text())
    except Exception as e:
        logger.error(f"Failed to load courses: {e}")
        return []


# ── LangChain prompt (optional refinement) ───────────────────────────────────
try:
    from langchain_core.prompts import PromptTemplate
    ROADMAP_PROMPT = PromptTemplate(
        input_variables=["role_name", "missing_skills", "courses_json", "preferences"],
        template=(
            "You are a career coach. Generate a brief motivational roadmap summary (2-3 sentences) "
            "and the top 3 immediate action items for a candidate aiming for the role: {role_name}.\n"
            "Missing skills to address: {missing_skills}\n"
            "Available resources: {courses_json}\n"
            "Candidate preferences: {preferences}\n\n"
            "Respond in JSON with keys: summary (string), top_actions (list of 3 strings)."
        ),
    )
except ImportError:
    ROADMAP_PROMPT = None


# ── Core deterministic logic ──────────────────────────────────────────────────
def _select_courses(
    missing_skill_ids: List[str],
    courses: List[Dict],
    budget: str = "all",
    cert_focus: bool = False,
) -> List[Dict]:
    """
    Greedily select courses that cover the most missing skills.
    Priority: core gap coverage > hours (shorter first) > optional coverage.
    """
    # Budget filter
    if budget == "free":
        courses = [c for c in courses if c.get("cost_tag") == "free"]
    elif budget == "paid":
        courses = [c for c in courses if c.get("cost_tag") == "paid"]

    # Cert filter: float certification courses to top
    if cert_focus:
        courses = sorted(
            courses,
            key=lambda c: -(
                "certif" in c.get("title", "").lower() or
                "certified" in c.get("title", "").lower()
            ),
        )

    missing_set = set(s.lower() for s in missing_skill_ids)

    # Score each course
    scored = []
    for c in courses:
        covered = {s.lower() for s in c.get("skills_covered", [])}
        overlap = covered & missing_set
        if overlap:
            scored.append((len(overlap), -c.get("hours_estimate", 999), c, overlap))

    scored.sort(key=lambda x: (x[0], x[1]), reverse=True)

    # Greedy dedup: pick courses that add new coverage
    selected: List[Dict] = []
    newly_covered: set = set()

    for _, _, course, overlap in scored:
        new = overlap - newly_covered
        if new:
            enriched = dict(course)
            enriched["covers_missing"] = sorted(overlap)
            enriched["covers_new_missing"] = sorted(new)
            enriched["priority"] = "core"  # all selected are for missing skills
            selected.append(enriched)
            newly_covered |= new

    return selected


def _build_milestones(
    selected: List[Dict],
    hours_per_week: int,
) -> List[Dict]:
    """Pack selected courses into bi-weekly buckets."""
    milestones: List[Dict] = []
    week_idx = 1
    bucket_items: List[str] = []
    bucket_hours = 0
    week_budget = hours_per_week * 2  # 2-week window per milestone

    for item in selected:
        h = item.get("hours_estimate", 10)
        if bucket_hours + h > week_budget and bucket_items:
            milestones.append({
                "week_range": f"Weeks {week_idx}–{week_idx + 1}",
                "items": bucket_items,
                "total_hours": bucket_hours,
            })
            week_idx += 2
            bucket_items = []
            bucket_hours = 0
        bucket_items.append(item["id"])
        bucket_hours += h

    if bucket_items:
        milestones.append({
            "week_range": f"Weeks {week_idx}–{week_idx + 1}",
            "items": bucket_items,
            "total_hours": bucket_hours,
        })

    return milestones


# ── Public API ────────────────────────────────────────────────────────────────
def generate_roadmap(
    role_name: str,
    missing_skills: List[str],
    preferences: Dict,
    courses: Optional[List[Dict]] = None,
    llm=None,
) -> Dict:
    """
    Build a personalized learning roadmap.

    Args:
        role_name:      Display name of the target role.
        missing_skills: List of missing skill_ids (strings).
        preferences:    {budget: str, hours_per_week: int, certification_focus: bool}
        courses:        Pre-loaded course list; loaded from disk if None.
        llm:            Optional LangChain LLM for motivational summary.

    Returns:
        {
          recommended_items:  [enriched course dicts],
          weekly_milestones:  [{week_range, items, total_hours}],
          total_hours:        int,
          estimated_weeks:    float,
          llm_summary:        str | None,
          top_actions:        [str] | None,
        }
    """
    if courses is None:
        courses = load_courses()

    budget = preferences.get("budget", "all")
    hours_per_week = max(int(preferences.get("hours_per_week", 10)), 1)
    cert_focus = bool(preferences.get("certification_focus", False))

    selected = _select_courses(missing_skills, courses, budget=budget, cert_focus=cert_focus)
    milestones = _build_milestones(selected, hours_per_week)
    total_hours = sum(c.get("hours_estimate", 0) for c in selected)
    estimated_weeks = round(total_hours / hours_per_week, 1) if hours_per_week else 0

    # Optional LLM refinement (motivational summary + top 3 actions)
    llm_summary: Optional[str] = None
    top_actions: Optional[List[str]] = None

    if llm is not None and ROADMAP_PROMPT is not None and selected:
        try:
            from langchain.chains import LLMChain
            chain = LLMChain(llm=llm, prompt=ROADMAP_PROMPT)
            compact_courses = [
                {"id": c["id"], "title": c["title"], "hours": c.get("hours_estimate")}
                for c in selected[:6]
            ]
            resp = chain.invoke({
                "role_name": role_name,
                "missing_skills": ", ".join(missing_skills[:8]),
                "courses_json": json.dumps(compact_courses),
                "preferences": str(preferences),
            })
            raw_text = resp.get("text", "") if isinstance(resp, dict) else str(resp)
            # Try to parse JSON from LLM
            raw_text = raw_text.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
            parsed = json.loads(raw_text)
            llm_summary = parsed.get("summary")
            top_actions = parsed.get("top_actions")
        except Exception as e:
            logger.warning(f"LLM roadmap refinement failed ({e}); using deterministic output.")

    return {
        "recommended_items": selected,
        "weekly_milestones": milestones,
        "total_hours": total_hours,
        "estimated_weeks": estimated_weeks,
        "skills_covered_count": sum(len(c.get("covers_missing", [])) for c in selected),
        "llm_summary": llm_summary,
        "top_actions": top_actions,
    }
