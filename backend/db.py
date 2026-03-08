import sqlite3
import json
import os
import logging
from pathlib import Path
from typing import Optional, Any, List, Tuple

# simple SQLite-backed storage for analysis requests/results

DB_PATH = Path(os.environ.get("CAREER_DB_PATH", Path(__file__).parent / "career_compass.db"))
logger = logging.getLogger("career_compass_db")

def _db_path_str() -> str:
    """Get the resolved absolute path to the database."""
    p = Path(DB_PATH).resolve()
    return str(p)


def init_db() -> None:
    """Create the database and table if they don't already exist.

    Also add the `techs` column if it is missing from an older schema.
    """
    db_path = _db_path_str()
    logger.info("Initializing database at %s", db_path)
    try:
        conn = sqlite3.connect(db_path)
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
        logger.info("Database initialization complete")
    except Exception as e:
        logger.exception("Error initializing database")
        raise
    finally:
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
    db_path = _db_path_str()
    logger.info("Saving analysis to database at %s", db_path)
    conn = sqlite3.connect(db_path)
    try:
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
        logger.info("Analysis saved successfully")
    except Exception as e:
        logger.exception("Error saving analysis")
        raise
    finally:
        conn.close()


def get_recent(n: int = 10) -> List[Tuple[Any, ...]]:
    """Return the most recent *n* analyses as raw rows.

    The caller is responsible for decoding any JSON.
    """
    db_path = _db_path_str()
    logger.info("Reading from database at %s", db_path)
    conn = sqlite3.connect(db_path)
    try:
        c = conn.cursor()
        c.execute(
            "SELECT id, timestamp, resume_text, github_url, target_roles, preferences, result "
            "FROM analyses ORDER BY id DESC LIMIT ?",
            (n,),
        )
        rows = c.fetchall()
        logger.info("Retrieved %d rows from database", len(rows))
        return rows
    except Exception as e:
        logger.exception("Error reading from database")
        raise
    finally:
        conn.close()


def merge_from(other_db_path: str) -> None:
    """Copy rows from other_db_path into the canonical DB if they don't exist.
    
    This is useful for migrating data from a different database location.
    """
    src = str(Path(other_db_path).resolve())
    dst = _db_path_str()
    logger.info("Merging from %s into %s", src, dst)
    
    if src == dst:
        logger.warning("Source and destination are the same, skipping merge")
        return
    
    s_conn = sqlite3.connect(src)
    d_conn = sqlite3.connect(dst)
    try:
        s_cur = s_conn.cursor()
        d_cur = d_conn.cursor()
        s_cur.execute("SELECT id, timestamp, resume_text, github_url, target_roles, preferences, techs, result FROM analyses")
        rows = s_cur.fetchall()
        logger.info("Found %d rows in source database", len(rows))
        
        copied = 0
        for r in rows:
            # Check for duplicate by timestamp and resume_text
            d_cur.execute(
                "SELECT COUNT(*) FROM analyses WHERE timestamp=? AND resume_text=?",
                (r[1], r[2]),
            )
            if d_cur.fetchone()[0] == 0:
                d_cur.execute(
                    "INSERT INTO analyses (timestamp, resume_text, github_url, target_roles, preferences, techs, result) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (r[1], r[2], r[3], r[4], r[5], r[6], r[7]),
                )
                copied += 1
        
        d_conn.commit()
        logger.info("Merge complete: copied %d rows", copied)
    except Exception as e:
        logger.exception("Error during merge")
        raise
    finally:
        s_conn.close()
        d_conn.close()
