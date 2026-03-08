"""
tests/test_utils.py – Unit tests for Career Compass (LangChain edition).
All tests run without a live LLM or internet connection.
Run with: pytest tests/ -v
"""
import json
import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import utils
from chains.role_matcher_chain import load_roles
from chains.roadmap_generator_chain import load_courses, _select_courses, _build_milestones
from chains.skill_extractor_chain import _keyword_extract, extract_skills
from chains.gap_analysis_chain import compute_skill_match
from chains.interview_generator_chain import _fallback_questions, generate_interview_questions


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def roles():
    return load_roles()

@pytest.fixture
def courses():
    return load_courses()

@pytest.fixture
def ontology(roles):
    return utils.build_skill_ontology(roles)

@pytest.fixture
def vocab(ontology):
    return utils.build_skill_vocabulary(ontology)

@pytest.fixture
def sample_resume_profile():
    path = Path(__file__).parent.parent / "data" / "sample_resume.txt"
    return utils.parse_resume_text(path.read_text())

@pytest.fixture
def sample_synthetic_profile():
    path = Path(__file__).parent.parent / "data" / "sample_synthetic_profile.json"
    return utils.parse_synthetic_profile(json.loads(path.read_text()))


# ── Data loading ──────────────────────────────────────────────────────────────

class TestDataLoading:
    def test_loads_at_least_three_roles(self, roles):
        assert len(roles) >= 3

    def test_each_role_has_required_fields(self, roles):
        for role in roles:
            assert "role_id" in role
            assert "display_name" in role
            assert len(role.get("job_snippets", [])) >= 10
            assert len(role.get("skill_list", [])) >= 5

    def test_skill_importance_values(self, roles):
        for role in roles:
            for skill in role["skill_list"]:
                assert skill["importance"] in ("core", "optional")

    def test_loads_courses(self, courses):
        assert len(courses) >= 10

    def test_courses_required_fields(self, courses):
        required = {"id", "title", "url", "provider", "skills_covered", "hours_estimate", "cost_tag"}
        for c in courses:
            assert not (required - set(c.keys())), f"Course {c.get('id')} missing fields"


# ── Ontology helpers ──────────────────────────────────────────────────────────

class TestOntology:
    def test_ontology_has_entries(self, ontology):
        assert len(ontology) >= 10

    def test_vocab_is_flat_list_of_strings(self, vocab):
        assert isinstance(vocab, list)
        assert all(isinstance(v, str) for v in vocab)
        assert len(vocab) > len({}) # non-empty

    def test_vocab_includes_common_skills(self, vocab):
        vocab_lower = [v.lower() for v in vocab]
        assert "python" in vocab_lower

    def test_ontology_merges_synonyms(self, roles, ontology):
        # Each skill that appears in multiple roles should have merged synonyms
        multi_role_skills = [
            sid for sid, s in ontology.items()
            if len(s.get("synonyms", [])) > 0
        ]
        assert len(multi_role_skills) > 0


# ── Profile parsing ───────────────────────────────────────────────────────────

class TestParsing:
    def test_resume_canonical_shape(self, sample_resume_profile):
        p = sample_resume_profile
        for key in ("headline", "experience", "explicit_skills", "raw_text"):
            assert key in p

    def test_resume_extracts_some_skills(self, sample_resume_profile):
        assert len(sample_resume_profile["explicit_skills"]) >= 3

    def test_synthetic_profile_shape(self, sample_synthetic_profile):
        p = sample_synthetic_profile
        assert p["headline"]
        assert len(p["experience"]) >= 1
        assert len(p["raw_text"]) > 50

    def test_seniority_junior(self):
        p = {"raw_text": "recent graduate python basics", "experience": []}
        assert utils.infer_seniority(p) == "junior"

    def test_seniority_senior(self):
        p = {"raw_text": "senior staff principal architect lead", "experience": []}
        assert utils.infer_seniority(p) == "senior"


# ── Skill extraction ──────────────────────────────────────────────────────────

class TestSkillExtraction:
    def test_keyword_extract_finds_python(self):
        results = _keyword_extract("I use Python for scripting", ["Python", "Docker"])
        labels = [r["skill"] for r in results]
        assert "Python" in labels

    def test_keyword_extract_confidence_range(self):
        results = _keyword_extract("Python Docker", ["Python", "Docker", "Rust"])
        for r in results:
            assert 0 < r["confidence"] <= 1.0

    def test_keyword_extract_no_false_positives(self):
        results = _keyword_extract("I enjoy hiking", ["Python", "Kubernetes"])
        assert len(results) == 0

    def test_extract_skills_no_llm(self, vocab):
        # Must work without LLM
        text = "Python developer with experience in scikit-learn, pandas, and SQL queries."
        results = extract_skills(text, vocab, llm=None)
        assert len(results) >= 2
        labels_lower = [r["skill"].lower() for r in results]
        assert "python" in labels_lower

    def test_extract_skills_sorted_by_confidence(self, vocab):
        text = "Python SQL pandas numpy machine learning"
        results = extract_skills(text, vocab, llm=None)
        confidences = [r["confidence"] for r in results]
        assert confidences == sorted(confidences, reverse=True)

    def test_extract_skills_deduplication(self, vocab):
        # Python appears in label AND synonyms — should only appear once
        text = "Python py python3 scripting"
        results = extract_skills(text, vocab, llm=None)
        labels_lower = [r["skill"].lower() for r in results]
        assert labels_lower.count("python") <= 1


# ── Gap analysis ──────────────────────────────────────────────────────────────

class TestGapAnalysis:
    @pytest.fixture
    def ds_skills(self, roles):
        return next(r for r in roles if r["role_id"] == "data_scientist")["skill_list"]

    def test_gap_returns_required_keys(self, ds_skills):
        result = compute_skill_match("Python SQL pandas", ds_skills)
        for k in ("matched_skills", "missing_core_skills", "missing_optional_skills", "match_score"):
            assert k in result

    def test_match_score_range(self, ds_skills):
        result = compute_skill_match("Python SQL pandas scikit-learn statistics", ds_skills)
        assert 0 <= result["match_score"] <= 100

    def test_keyword_boost_helps_matching(self, ds_skills):
        python_id = next((s["skill_id"] for s in ds_skills if "python" in s["label"].lower()), None)
        if python_id is None:
            pytest.skip("No python skill in data_scientist role")
        result = compute_skill_match(
            "irrelevant text",
            ds_skills,
            extracted_skill_ids={python_id},
        )
        matched_ids = [s["skill_id"] for s in result["matched_skills"]]
        assert python_id in matched_ids

    def test_empty_skill_list_returns_zero(self):
        result = compute_skill_match("Python SQL", [])
        assert result["match_score"] == 0.0
        assert result["matched_skills"] == []


# ── Database helper tests ─────────────────────────────────────────────────────

def test_db_save_and_fetch(tmp_path):
    # point the module at a temp file so tests don't interfere with real data
    import db as _db
    _db.DB_PATH = tmp_path / "test.db"
    _db.init_db()

    payload = {
        "profile": {"headline": "x"},
        "extracted_skills": [],
        "role_recommendations": [],
        "selected_roadmaps": {},
        "mock_questions": [],
        "warnings": [],
    }
    _db.save_analysis("some resume", "https://github.com/abc", ["cloud_engineer"], {"budget": "all"}, payload)
    rows = _db.get_recent(5)
    assert len(rows) == 1
    _id, ts, resume, gh, roles, prefs, result = rows[0]
    assert resume == "some resume"
    assert gh == "https://github.com/abc"
    assert json.loads(roles) == ["cloud_engineer"]
    decoded = json.loads(result)
    assert decoded["profile"]["headline"] == "x"


# ── Roadmap generation ────────────────────────────────────────────────────────

class TestRoadmap:
    def test_selects_courses_for_missing_skill(self, courses):
        selected = _select_courses(["terraform"], courses)
        assert len(selected) >= 1
        all_covered = [s for c in selected for s in c.get("covers_missing", [])]
        assert "terraform" in all_covered

    def test_free_budget_filter(self, courses):
        selected = _select_courses(["ml_fundamentals", "sql"], courses, budget="free")
        for c in selected:
            assert c["cost_tag"] == "free"

    def test_milestones_bucket_correctly(self):
        fake_courses = [
            {"id": "a", "hours_estimate": 5, "covers_missing": ["x"], "covers_new_missing": ["x"]},
            {"id": "b", "hours_estimate": 6, "covers_missing": ["y"], "covers_new_missing": ["y"]},
            {"id": "c", "hours_estimate": 3, "covers_missing": ["z"], "covers_new_missing": ["z"]},
        ]
        milestones = _build_milestones(fake_courses, hours_per_week=10)
        assert len(milestones) >= 1
        for m in milestones:
            assert "week_range" in m
            assert "items" in m
            assert m["total_hours"] > 0

    def test_generate_roadmap_end_to_end(self, courses):
        from chains.roadmap_generator_chain import generate_roadmap
        roadmap = generate_roadmap(
            role_name="Data Scientist",
            missing_skills=["ml_fundamentals", "deep_learning", "sql"],
            preferences={"budget": "all", "hours_per_week": 10},
            courses=courses,
            llm=None,
        )
        assert "recommended_items" in roadmap
        assert "weekly_milestones" in roadmap
        assert roadmap["total_hours"] >= 0


# ── Interview questions ───────────────────────────────────────────────────────

class TestInterviewQuestions:
    def test_fallback_returns_n_questions(self):
        qs = _fallback_questions("Cloud Engineer", ["AWS", "Terraform", "Kubernetes"], "junior", 5)
        assert len(qs) == 5

    def test_fallback_question_shape(self):
        qs = _fallback_questions("Data Scientist", ["Python", "ML", "SQL"], "mid-level", 3)
        for q in qs:
            assert "question" in q and "one_line_answer" in q
            assert len(q["question"]) > 10

    def test_no_llm_uses_fallback(self):
        qs = generate_interview_questions(
            role_name="Frontend Developer",
            skills=["React", "TypeScript", "CSS"],
            level="junior",
            n_questions=5,
            llm=None,
        )
        assert len(qs) == 5
        assert all("question" in q for q in qs)

    def test_pads_to_n_when_few_skills(self):
        qs = _fallback_questions("PM", ["Agile"], "junior", 5)
        assert len(qs) == 5


# ── Text extraction tests ──────────────────────────────────────────────────────
def test_extract_text_from_file_unsupported():
    from text_extraction import extract_text_from_file
    result = extract_text_from_file(b"dummy", "file.xyz")
    assert result is None

def test_extract_text_from_file_txt():
    from text_extraction import extract_text_from_file
    result = extract_text_from_file(b"Hello world", "test.txt")
    assert result == "Hello world"

def test_extract_text_from_file_html():
    from text_extraction import extract_text_from_file
    html = b"<html><body><p>Hello</p><script>ignore me</script></body></html>"
    result = extract_text_from_file(html, "test.html")
    assert "Hello" in result
    assert "ignore me" not in result
