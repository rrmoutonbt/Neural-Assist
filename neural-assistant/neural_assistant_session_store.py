"""
Neural Assistant Session Persistence
SQLite-backed session storage so conversations survive server restarts.
"""

import json
import logging
import os
import sqlite3
import threading
import time
from datetime import datetime
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

DB_PATH = os.environ.get(
    'NEURAL_ASSISTANT_SESSION_DB',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sessions.db'),
)


class SessionStore:
    """SQLite-backed session persistence with write-through caching."""

    def __init__(self, db_path: str = DB_PATH):
        self._db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self):
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS sessions (
                        session_id TEXT PRIMARY KEY,
                        messages TEXT NOT NULL DEFAULT '[]',
                        context_window INTEGER NOT NULL DEFAULT 8192,
                        token_count INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        last_activity TEXT NOT NULL
                    )
                """)
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_sessions_last_activity
                    ON sessions(last_activity)
                """)
                conn.commit()
            finally:
                conn.close()
        logger.info(f"Session store initialized: {self._db_path}")

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self._db_path)

    def save_session(self, session_id: str, messages: List[Dict[str, Any]],
                     context_window: int = 8192, token_count: int = 0,
                     created_at: Optional[datetime] = None):
        """Save or update a session."""
        now = datetime.now().isoformat()
        created = (created_at or datetime.now()).isoformat()

        # Serialize messages — convert datetime objects to strings
        serializable = []
        for msg in messages:
            m = dict(msg)
            if isinstance(m.get('timestamp'), datetime):
                m['timestamp'] = m['timestamp'].isoformat()
            serializable.append(m)

        with self._lock:
            conn = self._conn()
            try:
                conn.execute("""
                    INSERT INTO sessions (session_id, messages, context_window, token_count, created_at, last_activity)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(session_id) DO UPDATE SET
                        messages = excluded.messages,
                        token_count = excluded.token_count,
                        last_activity = excluded.last_activity
                """, (session_id, json.dumps(serializable), context_window,
                      token_count, created, now))
                conn.commit()
            finally:
                conn.close()

    def load_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Load a session by ID. Returns None if not found."""
        with self._lock:
            conn = self._conn()
            try:
                row = conn.execute(
                    "SELECT messages, context_window, token_count, created_at, last_activity "
                    "FROM sessions WHERE session_id = ?",
                    (session_id,),
                ).fetchone()
            finally:
                conn.close()

        if not row:
            return None

        messages = json.loads(row[0])
        return {
            'session_id': session_id,
            'messages': messages,
            'context_window': row[1],
            'token_count': row[2],
            'created_at': row[3],
            'last_activity': row[4],
        }

    def delete_session(self, session_id: str) -> bool:
        with self._lock:
            conn = self._conn()
            try:
                cursor = conn.execute(
                    "DELETE FROM sessions WHERE session_id = ?", (session_id,),
                )
                conn.commit()
                return cursor.rowcount > 0
            finally:
                conn.close()

    def list_sessions(self, limit: int = 100) -> List[Dict[str, Any]]:
        """List recent sessions (metadata only, no messages)."""
        with self._lock:
            conn = self._conn()
            try:
                rows = conn.execute(
                    "SELECT session_id, context_window, token_count, created_at, last_activity "
                    "FROM sessions ORDER BY last_activity DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            finally:
                conn.close()

        return [
            {
                'session_id': r[0],
                'context_window': r[1],
                'token_count': r[2],
                'created_at': r[3],
                'last_activity': r[4],
            }
            for r in rows
        ]

    def cleanup_old_sessions(self, max_age_hours: int = 72) -> int:
        """Delete sessions older than max_age_hours. Returns count deleted."""
        cutoff = datetime.fromtimestamp(
            time.time() - max_age_hours * 3600
        ).isoformat()
        with self._lock:
            conn = self._conn()
            try:
                cursor = conn.execute(
                    "DELETE FROM sessions WHERE last_activity < ?", (cutoff,),
                )
                conn.commit()
                return cursor.rowcount
            finally:
                conn.close()

    def session_count(self) -> int:
        with self._lock:
            conn = self._conn()
            try:
                row = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()
                return row[0]
            finally:
                conn.close()
