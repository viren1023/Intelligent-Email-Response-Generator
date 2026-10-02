import sqlite3
import json
import os
from typing import List, Dict, Any, Optional

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data")
os.makedirs(DB_DIR, exist_ok=True)
DB_PATH = os.path.join(DB_DIR, "chat_sessions.db")

def init_chat_db():
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                messages TEXT NOT NULL DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(email_id, user_id)
            )
        """)
        conn.commit()

init_chat_db()

class ChatDB:
    @staticmethod
    def get_session(email_id: str, user_id: int) -> List[Dict[str, Any]]:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT messages FROM chat_sessions WHERE email_id = ? AND user_id = ?",
                (email_id, user_id)
            )
            row = cursor.fetchone()
            if row and row[0]:
                try:
                    return json.loads(row[0])
                except Exception:
                    return []
            return []

    @staticmethod
    def save_session(email_id: str, user_id: int, messages: List[Dict[str, Any]]):
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO chat_sessions (email_id, user_id, messages, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(email_id, user_id) DO UPDATE SET
                    messages = excluded.messages,
                    updated_at = CURRENT_TIMESTAMP
            """, (email_id, user_id, json.dumps(messages)))
            conn.commit()

    @staticmethod
    def clear_session(email_id: str, user_id: int):
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM chat_sessions WHERE email_id = ? AND user_id = ?",
                (email_id, user_id)
            )
            conn.commit()
