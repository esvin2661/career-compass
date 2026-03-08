"""
prompt_templates.py – Canonical prompt strings (for reference / documentation).
Actual LangChain PromptTemplate objects are defined in each chain module.
These constants can be imported for logging/QA or if you want a single source of truth.
"""

# Used in chains/skill_extractor_chain.py
SKILL_EXTRACTION = (
    "Extract concise technical skills, tools, and technologies from the following "
    "text as a comma-separated list. Output only the list, no commentary:\n\n"
    "{profile_text}"
)

# Used in chains/interview_generator_chain.py
INTERVIEW_GENERATION = (
    "Generate {n_questions} concise technical interview questions for a {level} candidate "
    "targeting the role: {role_name}.\n"
    "Focus on these skills: {skills}.\n"
    "For each question include a one-line expected answer.\n"
    "Format each line strictly as: Q: <question> | A: <expected answer>\n"
    "Number each line. Output only the numbered list, nothing else."
)

# Used in chains/roadmap_generator_chain.py
ROADMAP_REFINEMENT = (
    "You are a career coach. Generate a brief motivational roadmap summary (2-3 sentences) "
    "and the top 3 immediate action items for a candidate aiming for the role: {role_name}.\n"
    "Missing skills to address: {missing_skills}\n"
    "Available resources: {courses_json}\n"
    "Candidate preferences: {preferences}\n\n"
    "Respond in JSON with keys: summary (string), top_actions (list of 3 strings)."
)

# Role inference fallback (used only when FAISS/numpy unavailable)
ROLE_INFERENCE = (
    "Given this candidate profile summary, suggest the top 3 most suitable job roles "
    "from the following list: {role_list}.\n"
    "Respond with only the role IDs as a comma-separated list, most suitable first.\n\n"
    "Profile: {profile_summary}"
)
