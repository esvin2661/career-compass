"""
main.py – Career Compass FastAPI backend (LangChain edition)

Pipeline:
  startup  -> load roles, courses; build FAISS index; optionally init LLM
  /analyze -> parse -> extract_skills -> match_roles -> gap_analysis
           -> generate_roadmap -> generate_interview_questions -> return JSON
"""
import logging
import os
import json
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from chains.skill_extractor_chain import extract_skills
from chains.role_matcher_chain import build_role_index, load_roles, match_roles
from chains.gap_analysis_chain import compute_skill_match
from chains.roadmap_generator_chain import generate_roadmap, load_courses
from chains.interview_generator_chain import generate_interview_questions

from utils import (
    parse_resume_text,
    parse_synthetic_profile,
    build_skill_ontology,
    build_skill_vocabulary,
    infer_seniority,
    fetch_github_profile,
)

# persistent storage
import db
# text extraction
from text_extraction import extract_text_from_file

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Career Compass API",
    description="LangChain-powered skill gap analysis, learning roadmap & mock interviews",
    version="2.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

STATE: dict = {}


def _build_llm():
    """
    Build optional LangChain LLM from env.
    Set LLM_BACKEND to: huggingface | openai | local | none (default)
    """
    backend = os.getenv("LLM_BACKEND", "none").lower()

    if backend == "huggingface":
        try:
            from langchain_community.llms import HuggingFaceHub
            llm = HuggingFaceHub(
                repo_id=os.getenv("HF_REPO_ID", "mistralai/Mistral-7B-Instruct-v0.2"),
                huggingfacehub_api_token=os.getenv("HUGGINGFACEHUB_API_TOKEN"),
                model_kwargs={"temperature": 0.5, "max_new_tokens": 1024},
            )
            logger.info(f"LLM: HuggingFaceHub ({os.getenv('HF_REPO_ID')})")
            return llm
        except Exception as e:
            logger.warning(f"HuggingFace LLM init failed: {e}")

    elif backend == "gemini":
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            llm = ChatGoogleGenerativeAI(
                model=os.getenv("GEMINI_MODEL", "gemini-1.5-pro"),
                google_api_key=os.getenv("GEMINI_API_KEY"),
                temperature=0.5,
            )
            logger.info("LLM: Google Gemini ChatGoogleGenerativeAI")
            return llm
        except Exception as e:
            logger.warning(f"Google Gemini LLM init failed: {e}")

    elif backend == "openai":
        try:
            from langchain_openai import ChatOpenAI
            llm = ChatOpenAI(
                model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                api_key=os.getenv("OPENAI_API_KEY"),
                temperature=0.5,
            )
            logger.info("LLM: OpenAI ChatOpenAI")
            return llm
        except Exception as e:
            logger.warning(f"OpenAI LLM init failed: {e}")

    elif backend == "local":
        try:
            from langchain_community.llms import Ollama
            llm = Ollama(
                base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
                model=os.getenv("OLLAMA_MODEL", "mistral"),
            )
            logger.info(f"LLM: Ollama ({os.getenv('OLLAMA_MODEL', 'mistral')})")
            return llm
        except Exception as e:
            logger.warning(f"Ollama LLM init failed: {e}")

    logger.info("LLM_BACKEND=none — fully deterministic mode.")
    return None


@app.on_event("startup")
async def startup():
    # ensure database exists before anything else
    db.init_db()

    roles = load_roles()
    courses = load_courses()
    ontology = build_skill_ontology(roles)
    vocab = build_skill_vocabulary(ontology)
    index, embeddings, meta = build_role_index(roles)
    llm = _build_llm()
    STATE.update({
        "roles": roles, "courses": courses, "ontology": ontology,
        "vocab": vocab, "faiss_index": index, "faiss_meta": meta, "llm": llm,
    })
    logger.info(f"Ready: {len(roles)} roles, {len(courses)} courses, {len(vocab)} vocab terms, "
                f"FAISS={'ready' if index else 'numpy fallback'}, LLM={'on' if llm else 'off'}")


# ── Pydantic models ──────────────────────────────────────────────────────────

class Preferences(BaseModel):
    budget: str = Field(default="all")
    hours_per_week: int = Field(default=10, ge=1, le=80)
    certification_focus: bool = False


class AnalyzeRequest(BaseModel):
    resume_text: Optional[str] = None
    synthetic_profile: Optional[dict] = None
    github_url: Optional[str] = None
    target_roles: Optional[list[str]] = None
    techs: Optional[list[str]] = None
    preferences: Optional[Preferences] = None


class AnalyzeResponse(BaseModel):
    profile: dict
    extracted_skills: list[dict]
    role_recommendations: list[dict]
    selected_roadmaps: dict
    mock_questions: list[dict]
    warnings: list[str] = []


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    llm_st = "configured" if STATE.get("llm") else "disabled (deterministic fallbacks)"
    faiss_st = "ready" if STATE.get("faiss_index") is not None else "numpy fallback"
    return {"message": "Career Compass API (LangChain)", "version": "2.0.0",
            "llm": llm_st, "vector_store": faiss_st}


@app.get("/roles")
async def get_roles():
    return [
        {"role_id": r["role_id"], "display_name": r["display_name"],
         "skill_count": len(r.get("skill_list", [])),
         "core_skills": [s["label"] for s in r.get("skill_list", []) if s["importance"] == "core"][:5]}
        for r in STATE.get("roles", [])
    ]


@app.get("/courses")
async def get_courses():
    return STATE.get("courses", [])


@app.get("/analyses")
async def list_analyses(limit: int = 20):
    """Return the most recent analyze requests/results (for debugging & sharing).

    The stored rows include JSON-encoded inputs and outputs. This endpoint is
    intentionally simple and unauthenticated since the MVP doesn't have user
    accounts; avoid sending sensitive data here in production.
    """
    rows = db.get_recent(limit)
    # decode JSON fields before returning
    parsed = []
    for r in rows:
        _id, ts, resume, gh, roles, prefs, techs, result = r
        parsed.append({
            "id": _id,
            "timestamp": ts,
            "resume_text": resume,
            "github_url": gh,
            "target_roles": json.loads(roles) if roles else None,
            "techs": json.loads(techs) if techs else None,
            "preferences": json.loads(prefs) if prefs else None,
            "result": json.loads(result) if result else None,
        })
    return parsed


@app.post("/extract-text")
async def extract_text(file: UploadFile = File(...)):
    """Extract text from an uploaded resume file.

    Supports PDF, DOCX, DOC, HTML, TXT formats.
    Returns the extracted text as plain string.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Read file content
    content = await file.read()

    # Extract text
    extracted = extract_text_from_file(content, file.filename)
    if extracted is None:
        raise HTTPException(status_code=400, detail=f"Could not extract text from {file.filename}. Supported formats: PDF, DOCX, DOC, HTML, TXT")

    return {"text": extracted}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    warnings: list[str] = []
    llm = STATE.get("llm")
    roles = STATE.get("roles", [])
    courses = STATE.get("courses", [])
    ontology = STATE.get("ontology", {})
    vocab: list[str] = STATE.get("vocab", [])
    faiss_index = STATE.get("faiss_index")
    faiss_meta = STATE.get("faiss_meta")

    # 1. Parse profile
    if req.synthetic_profile:
        profile = parse_synthetic_profile(req.synthetic_profile)
        target_roles_from_profile = profile.pop("target_roles", [])
        prefs_from_profile = profile.pop("preferences", {})
    elif req.resume_text:
        profile = parse_resume_text(req.resume_text)
        target_roles_from_profile = []
        prefs_from_profile = {}
    else:
        raise HTTPException(status_code=422, detail="Provide resume_text or synthetic_profile")

    target_roles = req.target_roles or target_roles_from_profile or []
    prefs_dict = {**prefs_from_profile}
    if req.preferences:
        prefs_dict.update(req.preferences.model_dump())
    prefs = Preferences(**{k: v for k, v in prefs_dict.items() if k in Preferences.model_fields})

    # 2. GitHub enrichment
    if req.github_url:
        try:
            github_text = await fetch_github_profile(req.github_url)
            if github_text:
                profile["raw_text"] = profile.get("raw_text", "") + " " + github_text
            else:
                warnings.append("GitHub fetch returned no data; using resume only.")
        except Exception as e:
            warnings.append(f"GitHub fetch failed ({e}); using resume only.")

    profile_text = profile.get("raw_text", "")

    # 3. Skill extraction
    extracted = extract_skills(profile_text=profile_text, skill_vocabulary=vocab, llm=llm)
    if not extracted:
        warnings.append("No skills detected — check profile content.")

    extracted_skills_api = []
    for item in extracted:
        label_lower = item["skill"].lower()
        matched_entry = next((v for v in ontology.values() if v["label"].lower() == label_lower), None)
        sid = matched_entry["skill_id"] if matched_entry else label_lower.replace(" ", "_")
        extracted_skills_api.append({
            "skill_id": sid, "label": item["skill"],
            "confidence": item["confidence"], "source": item.get("source", "unknown"),
        })

    extracted_skill_ids = {s["skill_id"] for s in extracted_skills_api}
    logger.info(f"Extracted {len(extracted_skills_api)} skills")

    # 4. Role matching (FAISS / numpy)
    matched_roles = match_roles(
        profile_text=profile_text, roles=roles,
        index=faiss_index, meta=faiss_meta, top_k=3,
    )

    # Inject user-specified roles if not already in top-3
    if target_roles:
        present_ids = {r["role_id"] for r in matched_roles}
        role_lookup = {r["role_id"]: r for r in roles}
        for rid in target_roles:
            if rid not in present_ids and rid in role_lookup:
                r = role_lookup[rid]
                matched_roles.insert(0, {
                    "role_id": rid, "display_name": r["display_name"],
                    "score": 999.0, "skill_list": r.get("skill_list", []),
                })
        matched_roles = matched_roles[:3]

    # 5. Gap analysis
    role_recommendations = []
    for role_match in matched_roles:
        gap = compute_skill_match(
            profile_text=profile_text,
            role_skill_list=role_match.get("skill_list", []),
            extracted_skill_ids=extracted_skill_ids,
        )
        faiss_score = role_match.get("score", 0)
        faiss_contrib = min(faiss_score / 5, 20) if faiss_score < 900 else 0
        combined = round(gap["match_score"] * 0.8 + faiss_contrib, 1)
        role_recommendations.append({
            "role_id": role_match["role_id"],
            "display_name": role_match["display_name"],
            "match_score": min(combined, 100.0),
            "matched_skills": gap["matched_skills"],
            "missing_core_skills": gap["missing_core_skills"],
            "missing_optional_skills": gap["missing_optional_skills"],
        })
    role_recommendations.sort(key=lambda x: x["match_score"], reverse=True)

    # 6. Roadmap generation
    selected_roadmaps = {}
    for rec in role_recommendations[:2]:
        missing_ids = (
            [s["skill_id"] for s in rec["missing_core_skills"]] +
            [s["skill_id"] for s in rec["missing_optional_skills"]]
        )
        selected_roadmaps[rec["role_id"]] = generate_roadmap(
            role_name=rec["display_name"],
            missing_skills=missing_ids,
            preferences=prefs.model_dump(),
            courses=courses,
            llm=llm,
        )

    # 7. Mock interview questions
    mock_questions = []
    if role_recommendations:
        top = role_recommendations[0]
        focus = (
            [s["label"] for s in top["missing_core_skills"][:5]] +
            [s["label"] for s in top["matched_skills"][:3]]
        ) or [s["label"] for s in extracted_skills_api[:7]]
        mock_questions = generate_interview_questions(
            role_name=top["display_name"],
            skills=focus,
            level=infer_seniority(profile),
            n_questions=7,
            llm=llm,
        )

    # 8. Output
    output_profile = {
        "headline": profile.get("headline", ""),
        "education": profile.get("education", []),
        "projects": profile.get("projects", []),
        "experience_bullets": profile.get("experience", [])[:15],
        "explicit_skills": profile.get("explicit_skills", [])[:30],
        "seniority_inferred": infer_seniority(profile),
    }

    # build the raw dict so it's easy to save and also to feed back into the
    # response model
    result_dict = {
        "profile": output_profile,
        "extracted_skills": extracted_skills_api,
        "role_recommendations": role_recommendations,
        "selected_roadmaps": selected_roadmaps,
        "mock_questions": mock_questions,
        "warnings": warnings,
    }

    # persist a copy of the request + result (non-blocking)
    try:
        db.save_analysis(
            resume_text=req.resume_text,
            github_url=req.github_url,
            target_roles=target_roles,
            techs=req.techs or [],
            preferences=prefs.model_dump() if prefs else None,
            result=result_dict,
        )
    except Exception as e:  # pragma: no cover - db issues shouldn't break API
        logger.warning(f"Failed to save analysis to DB: {e}")

    return AnalyzeResponse(**result_dict)


# ── Additional Content Generation Endpoints ──────────────────────────────────

class ContentRequest(BaseModel):
    role_name: str
    user_profile: dict
    skills_data: dict
    context: str = Field(default="")


@app.post("/generate-gap-summary")
async def generate_gap_summary(req: ContentRequest):
    """Generate a personalized summary for the gap analysis page."""
    llm = STATE.get("llm")
    if not llm:
        return {"summary": "Gap analysis shows your current skill level compared to job requirements. Review the matched and missing skills below to understand your career progression opportunities."}

    try:
        from langchain_core.prompts import PromptTemplate
        prompt = PromptTemplate(
            input_variables=["role_name", "profile", "skills"],
            template=(
                "Based on this user's profile and skills analysis for the {role_name} role, "
                "write a personalized 2-3 sentence summary explaining their gap analysis results. "
                "Focus on their strengths, key gaps, and next steps. Be encouraging and actionable.\n\n"
                "User Profile: {profile}\n"
                "Skills Analysis: {skills}\n\n"
                "Summary:"
            ),
        )
        chain = prompt | llm
        result = await chain.ainvoke({
            "role_name": req.role_name,
            "profile": json.dumps(req.user_profile),
            "skills": json.dumps(req.skills_data),
        })
        return {"summary": result.content.strip()}
    except Exception as e:
        logger.warning(f"Gap summary generation failed: {e}")
        return {"summary": f"Your gap analysis for {req.role_name} reveals important insights about your current skill level and areas for growth."}


@app.post("/generate-interview-intro")
async def generate_interview_intro(req: ContentRequest):
    """Generate a personalized introduction for the mock interview page."""
    llm = STATE.get("llm")
    if not llm:
        return {"introduction": f"Practice your interview skills for the {req.role_name} position with these tailored questions based on your profile."}

    try:
        from langchain_core.prompts import PromptTemplate
        prompt = PromptTemplate(
            input_variables=["role_name", "profile", "level"],
            template=(
                "Write a personalized 2-3 sentence introduction for a mock interview practice page. "
                "The user is preparing for {role_name} interviews at a {level} level. "
                "Make it encouraging, explain the value of practice, and mention that questions are tailored to their background.\n\n"
                "User Profile Summary: {profile}\n\n"
                "Introduction:"
            ),
        )
        chain = prompt | llm
        result = await chain.ainvoke({
            "role_name": req.role_name,
            "profile": json.dumps(req.user_profile),
            "level": req.user_profile.get("seniority_inferred", "mid-level"),
        })
        return {"introduction": result.content.strip()}
    except Exception as e:
        logger.warning(f"Interview intro generation failed: {e}")
        return {"introduction": f"Sharpen your interview skills for {req.role_name} with these personalized practice questions."}


@app.post("/generate-roadmap-intro")
async def generate_roadmap_intro(req: ContentRequest):
    """Generate a personalized introduction for the learning roadmap page."""
    llm = STATE.get("llm")
    if not llm:
        return {"introduction": f"Your personalized learning roadmap for becoming a {req.role_name}, designed around your current skills and available time."}

    try:
        from langchain_core.prompts import PromptTemplate
        prompt = PromptTemplate(
            input_variables=["role_name", "profile", "roadmap"],
            template=(
                "Write a personalized 2-3 sentence introduction for a learning roadmap page. "
                "The user wants to become a {role_name} and has this learning plan. "
                "Make it motivating, explain the plan's structure, and emphasize how it's customized to their background.\n\n"
                "User Profile: {profile}\n"
                "Roadmap Summary: {roadmap}\n\n"
                "Introduction:"
            ),
        )
        chain = prompt | llm
        result = await chain.ainvoke({
            "role_name": req.role_name,
            "profile": json.dumps(req.user_profile),
            "roadmap": json.dumps(req.skills_data),
        })
        return {"introduction": result.content.strip()}
    except Exception as e:
        logger.warning(f"Roadmap intro generation failed: {e}")
        return {"introduction": f"Follow this customized learning path to advance your career as a {req.role_name}."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
