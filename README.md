# Career Compass – Skill Gap Analyzer & Learning Roadmap

> Paste a resume → get skill gaps, a personalized learning roadmap, and mock interview questions.
> Powered by **LangChain + sentence-transformers + FAISS** — no Azure, no paid API required.

---

## Architecture

```
/backend      FastAPI (Python) — LangChain pipeline + embeddings
/frontend     Next.js 14 (App Router) + Tailwind CSS — single-page UI
```

### Backend Pipeline
```
POST /analyze
  │
  ├─ utils.parse_resume_text / parse_synthetic_profile
  ├─ chains/skill_extractor_chain.extract_skills
  │    └─ keyword regex → sentence-transformer embeddings → LLM fallback (optional)
  ├─ chains/role_matcher_chain.match_roles
  │    └─ FAISS flat inner-product index over job_snippets (numpy fallback)
  ├─ chains/gap_analysis_chain.compute_skill_match
  │    └─ embedding similarity per skill + keyword-boost override
  ├─ chains/roadmap_generator_chain.generate_roadmap
  │    └─ greedy course selection + weekly bucketing + optional LLM summary
  └─ chains/interview_generator_chain.generate_interview_questions
       └─ LangChain LLMChain or deterministic template fallback
```

---

## Quick Start

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env if you want LLM features (see LLM Backend section)
uvicorn main:app --reload --port 8000
```

On first run, `sentence-transformers` will download **all-mpnet-base-v2** (~420 MB) automatically.

Backend: `http://localhost:8000` · Swagger docs: `http://localhost:8000/docs`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

---

## LLM Backend (optional)

The API runs fully without an LLM — all extraction, matching, and question generation use deterministic algorithms. To enable richer text generation, set `LLM_BACKEND` in `.env`:

| `LLM_BACKEND` | Required env | Notes |
|---|---|---|
| `none` (default) | — | Fully deterministic, zero cost |
| `huggingface` | `HUGGINGFACEHUB_API_TOKEN`, `HF_REPO_ID` | Free tier available |
| `openai` | `OPENAI_API_KEY` | Optional if you have credits |
| `local` | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Run any model via Ollama |

---

## API Reference

### `GET /roles`
Returns metadata for all loaded roles.

### `POST /analyze`

**Request:**
```json
{
  "resume_text": "Jane Doe\n...",
  "github_url": "https://github.com/janedoe",
  "target_roles": ["data_scientist"],
  "preferences": {
    "budget": "free",
    "hours_per_week": 8,
    "certification_focus": false
  }
}
```

**Response:**
```json
{
  "profile": { "headline": "...", "seniority_inferred": "junior" },
  "extracted_skills": [{ "skill_id": "python", "label": "Python", "confidence": 0.95, "source": "keyword" }],
  "role_recommendations": [{ "role_id": "data_scientist", "match_score": 68.5, "missing_core_skills": [...] }],
  "selected_roadmaps": { "data_scientist": { "recommended_items": [...], "total_hours": 90 } },
  "mock_questions": [{ "question": "...", "one_line_answer": "..." }],
  "warnings": []
}
```

### Example curl

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "resume_text": "Jane Doe. Python developer 2 years. Built ML models with scikit-learn, pandas, SQL. AWS S3, Docker basics. PyTorch NLP project.",
    "target_roles": ["data_scientist"],
    "preferences": { "budget": "free", "hours_per_week": 10 }
  }'
```

---

## Running Tests

```bash
cd backend
pytest tests/ -v
```

All tests run **without** a live LLM, internet, or API keys.

---

## Data Files

| Path | Contents |
|---|---|
| `backend/data/roles/*.json` | 5 role definitions (Cloud Engineer, Data Scientist, Frontend Dev, Product Manager, DevOps) |
| `backend/data/courses.json` | 30 curated courses mapped to skill IDs |
| `backend/data/sample_resume.txt` | Sample free-text resume |
| `backend/data/sample_synthetic_profile.json` | Sample structured JSON profile |

### Adding a Role

Create `backend/data/roles/my_role.json`:
```json
{
  "role_id": "my_role",
  "display_name": "My Role",
  "job_snippets": ["snippet 1", "..."],
  "skill_list": [
    { "skill_id": "python", "label": "Python", "importance": "core", "synonyms": ["py", "python3"] }
  ]
}
```
Restart the server — it auto-loads.

---

## Deployment

| Component | Suggested Platform |
|---|---|
| Frontend | Vercel (set `NEXT_PUBLIC_API_URL`) |
| Backend | Render, Railway, or Azure App Service |
| Demo | `ngrok http 8000` for local tunnel |

---

## Post-MVP Improvements

- [ ] Replace numpy fallback with persistent FAISS index on disk
- [ ] Persist roadmaps with shareable links (Redis or DB)
- [ ] Streaming LLM responses via SSE
- [ ] Automated job-board ingestion pipeline
- [ ] Mentor view: export PDF, annotate roadmap
