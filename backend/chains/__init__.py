"""
Career Compass LangChain pipeline chains.
Each module is independently importable and has deterministic fallbacks
so the API stays functional even without an LLM backend configured.
"""
from .skill_extractor_chain import extract_skills
from .role_matcher_chain import build_role_index, match_roles
from .gap_analysis_chain import compute_skill_match
from .roadmap_generator_chain import generate_roadmap, load_courses
from .interview_generator_chain import generate_interview_questions

__all__ = [
    "extract_skills",
    "build_role_index",
    "match_roles",
    "compute_skill_match",
    "generate_roadmap",
    "load_courses",
    "generate_interview_questions",
]
