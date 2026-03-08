import sqlite3
import json
from pathlib import Path
from typing import Optional, Any, List, Tuple

# simple SQLite-backed storage for analysis requests/results

DB_PATH = Path(__file__).parent / "career_compass.db"


def init_db() -> None:
    """Create the database and table if they don't already exist.

    Also add the `techs` column if it is missing from an older schema.
    """
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # create table if needed
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
            resume_text TEXT,
            github_url TEXT,
            target_roles TEXT,
            preferences TEXT,
            techs TEXT,
            result TEXT
        )
        """
    )
    # ensure techs column exists for older databases
    c.execute("PRAGMA table_info(analyses)")
    cols = [row[1] for row in c.fetchall()]
    if "techs" not in cols:
        c.execute("ALTER TABLE analyses ADD COLUMN techs TEXT")
    conn.commit()
    conn.close()


def save_analysis(
    resume_text: Optional[str],
    github_url: Optional[str],
    target_roles: Optional[List[str]],
    preferences: Optional[dict],
    techs: Optional[List[str]],
    result: dict,
) -> None:
    """Insert a new row containing the request inputs and the computed
    result. All list/dict values are JSON-encoded to keep the schema simple.
    """
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        """
        INSERT INTO analyses (resume_text, github_url, target_roles, preferences, techs, result)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            resume_text,
            github_url,
            json.dumps(target_roles) if target_roles else None,
            json.dumps(preferences) if preferences else None,
            json.dumps(techs) if techs else None,
            json.dumps(result),
        ),
    )
    conn.commit()
    conn.close()


def get_recent(n: int = 10) -> List[Tuple[Any, ...]]:
    """Return the most recent *n* analyses as raw rows.

    The caller is responsible for decoding any JSON.
    """
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "SELECT id, timestamp, resume_text, github_url, target_roles, preferences, result "
        "FROM analyses ORDER BY id DESC LIMIT ?",
        (n,),
    )
    rows = c.fetchall()
    conn.close()
    return rows
