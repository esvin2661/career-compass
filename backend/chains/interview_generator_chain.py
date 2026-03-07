"""
backend/chains/interview_generator_chain.py

Generates mock technical interview questions via LangChain LLMChain.
Falls back to deterministic template-based questions if LLM is unavailable.

Expected LLM output format (one line per Q&A):
    1. Q: <question> | A: <one-line answer>
    2. Q: <question> | A: <one-line answer>
    ...
"""
import logging
import re
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

try:
    from langchain.prompts import PromptTemplate
    INTERVIEW_PROMPT = PromptTemplate(
        input_variables=["role_name", "level", "skills", "n_questions"],
        template=(
            "Generate {n_questions} concise technical interview questions for a {level} candidate "
            "targeting the role: {role_name}.\n"
            "Focus on these skills: {skills}.\n"
            "For each question include a one-line expected answer.\n"
            "Format each line strictly as: Q: <question> | A: <expected answer>\n"
            "Number each line. Output only the numbered list, nothing else."
        ),
    )
except ImportError:
    INTERVIEW_PROMPT = None


# ── Parsing ───────────────────────────────────────────────────────────────────
def _parse_qa_response(text: str) -> List[Dict]:
    """
    Parse LLM output lines of the form:
        1. Q: <question> | A: <answer>
    Handles minor formatting variations.
    """
    results: List[Dict] = []
    for line in text.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        # Strip leading number/dot
        line = re.sub(r"^\d+[.)]\s*", "", line)

        if "|" in line:
            parts = line.split("|", 1)
            q_part = re.sub(r"^[Qq]:\s*", "", parts[0]).strip()
            a_part = re.sub(r"^[Aa]:\s*", "", parts[1]).strip()
            if q_part:
                results.append({"question": q_part, "one_line_answer": a_part})
        elif line.lower().startswith("q:"):
            q_part = re.sub(r"^[Qq]:\s*", "", line).strip()
            if q_part:
                results.append({"question": q_part, "one_line_answer": ""})
        elif len(line) > 15:
            # Plain line — treat whole line as question
            results.append({"question": line, "one_line_answer": ""})

    return results


# ── Deterministic fallback ─────────────────────────────────────────────────
_FALLBACK_TEMPLATES = [
    ("Explain {skill} and describe a concrete use case from your experience.",
     "Look for both conceptual understanding and a specific, measurable example."),
    ("What are the key trade-offs between {skill} and its common alternatives?",
     "Assesses ecosystem awareness and decision-making ability."),
    ("Describe a production issue you debugged involving {skill}.",
     "Reveals systematic debugging approach and tool familiarity."),
    ("What best practices do you follow when working with {skill}?",
     "Indicates depth of experience and professional standards."),
    ("How does {skill} behave under high load or at scale? What are its limits?",
     "Tests system-design thinking and knowledge of failure modes."),
    ("How would you set up {skill} from scratch in a new project?",
     "Evaluates hands-on setup experience and opinionated defaults."),
    ("How would you explain {skill} to a non-technical stakeholder?",
     "Tests communication and conceptual clarity under simplicity constraints."),
]


def _fallback_questions(
    role_name: str,
    skills: List[str],
    level: str,
    n: int,
) -> List[Dict]:
    out: List[Dict] = []
    for i, skill in enumerate(skills[:n]):
        tpl_q, tpl_a = _FALLBACK_TEMPLATES[i % len(_FALLBACK_TEMPLATES)]
        out.append({
            "question": tpl_q.format(skill=skill),
            "one_line_answer": tpl_a,
        })
    # Pad if n > len(skills)
    while len(out) < n:
        out.append({
            "question": f"For a {level} {role_name}: walk through how you'd approach a new project end-to-end.",
            "one_line_answer": "Look for structured thinking, ownership mindset, and clear communication.",
        })
    return out[:n]


# ── Public API ────────────────────────────────────────────────────────────────
def generate_interview_questions(
    role_name: str,
    skills: List[str],
    level: str = "junior",
    n_questions: int = 7,
    llm=None,
) -> List[Dict]:
    """
    Generate n_questions interview Q&A pairs for a candidate.

    Args:
        role_name:    Target role (e.g. "Data Scientist").
        skills:       List of skill labels to focus on (missing + matched).
        level:        Candidate seniority: junior | mid-level | senior.
        n_questions:  Number of questions to generate.
        llm:          Optional LangChain LLM. If None, uses deterministic fallback.

    Returns:
        List of {question: str, one_line_answer: str}
    """
    if llm is None or INTERVIEW_PROMPT is None:
        logger.info("No LLM configured; using fallback interview questions.")
        return _fallback_questions(role_name, skills, level, n_questions)

    try:
        from langchain.chains import LLMChain
        chain = LLMChain(llm=llm, prompt=INTERVIEW_PROMPT)
        resp = chain.invoke({
            "role_name": role_name,
            "level": level,
            "skills": ", ".join(skills[:10]),
            "n_questions": str(n_questions),
        })
        raw = resp.get("text", "") if isinstance(resp, dict) else str(resp)
        parsed = _parse_qa_response(raw)

        if len(parsed) >= max(3, n_questions // 2):
            return parsed[:n_questions]

        logger.warning(f"LLM returned only {len(parsed)} parseable questions; mixing with fallback.")
        fallback = _fallback_questions(role_name, skills, level, n_questions)
        # Fill remaining slots with fallback questions
        combined = parsed + [q for q in fallback if q not in parsed]
        return combined[:n_questions]

    except Exception as e:
        logger.warning(f"LLM interview generation failed ({e}); using deterministic fallback.")
        return _fallback_questions(role_name, skills, level, n_questions)
