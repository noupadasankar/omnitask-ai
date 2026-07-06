"""
Database Tracker Module
Manages SQLite database for tracking job applications and sessions.
"""

import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Optional, Any
from pathlib import Path
import os


class DatabaseTracker:
    """Tracks job applications and portal sessions in SQLite database."""
    
    def __init__(self, db_path: str = "data/applications.db"):
        """Initialize database connection and create tables if needed."""
        self.db_path = db_path
        
        # Ensure data directory exists
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row  # Return rows as dictionaries
        self.cursor = self.conn.cursor()
        self._create_tables()
    
    def _create_tables(self):
        """Create necessary database tables if they don't exist."""
        
        # Applications table
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                portal TEXT NOT NULL,
                company TEXT NOT NULL,
                role TEXT NOT NULL,
                job_url TEXT UNIQUE NOT NULL,
                job_id TEXT,
                applied_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'applied',
                job_description TEXT,
                location TEXT,
                salary TEXT,
                match_score FLOAT,
                application_method TEXT,
                notes TEXT
            )
        ''')
        
        # Sessions table for storing portal cookies
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS sessions (
                portal TEXT PRIMARY KEY,
                cookies TEXT,
                local_storage TEXT,
                session_storage TEXT,
                last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_valid BOOLEAN DEFAULT 1
            )
        ''')
        
        # Daily stats table
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS daily_stats (
                date DATE PRIMARY KEY,
                total_applications INTEGER DEFAULT 0,
                applications_by_portal TEXT,
                jobs_viewed INTEGER DEFAULT 0,
                jobs_matched INTEGER DEFAULT 0
            )
        ''')
        
        # Portal errors/issues table
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS portal_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                portal TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                log_level TEXT,
                message TEXT,
                details TEXT
            )
        ''')

        # Screening answers table — records what the auto-filler answered per job
        # (the "answers" table from the target architecture: question/answer/job).
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_url TEXT,
                portal TEXT,
                question TEXT,
                answer TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        self.conn.commit()
    
    def add_application(self, 
                       portal: str,
                       company: str,
                       role: str,
                       job_url: str,
                       job_id: Optional[str] = None,
                       job_description: Optional[str] = None,
                       location: Optional[str] = None,
                       salary: Optional[str] = None,
                       match_score: Optional[float] = None,
                       application_method: str = "automated",
                       notes: Optional[str] = None) -> bool:
        """Add a new job application to the database."""
        try:
            self.cursor.execute('''
                INSERT INTO applications 
                (portal, company, role, job_url, job_id, job_description, 
                 location, salary, match_score, application_method, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (portal, company, role, job_url, job_id, job_description,
                  location, salary, match_score, application_method, notes))
            
            self.conn.commit()
            self._update_daily_stats(portal)
            return True
        except sqlite3.IntegrityError:
            # Job already exists (duplicate URL)
            return False
        except Exception as e:
            print(f"Error adding application: {e}")
            return False
    
    def add_answer(self, job_url: str, portal: str, question: str, answer: str) -> None:
        """Record a screening question/answer the auto-filler supplied for a job."""
        try:
            self.cursor.execute(
                'INSERT INTO answers (job_url, portal, question, answer) VALUES (?, ?, ?, ?)',
                (job_url, portal, (question or '')[:500], (answer or '')[:1000]),
            )
            self.conn.commit()
        except Exception as e:
            print(f"Error adding answer: {e}")

    def is_already_applied(self, job_url: str) -> bool:
        """Check if we've already applied to this job."""
        self.cursor.execute(
            'SELECT id FROM applications WHERE job_url = ?',
            (job_url,)
        )
        return self.cursor.fetchone() is not None
    
    def get_applications_today(self, portal: Optional[str] = None) -> int:
        """Get count of applications made today."""
        today = datetime.now().date()
        
        if portal:
            self.cursor.execute('''
                SELECT COUNT(*) as count FROM applications
                WHERE DATE(applied_date) = ? AND portal = ?
            ''', (today, portal))
        else:
            self.cursor.execute('''
                SELECT COUNT(*) as count FROM applications
                WHERE DATE(applied_date) = ?
            ''', (today,))
        
        result = self.cursor.fetchone()
        return result['count'] if result else 0
    
    def get_recent_applications(self, limit: int = 10) -> List[Dict]:
        """Get recent applications."""
        self.cursor.execute('''
            SELECT * FROM applications
            ORDER BY applied_date DESC
            LIMIT ?
        ''', (limit,))
        
        return [dict(row) for row in self.cursor.fetchall()]
    
    def update_application_status(self, job_url: str, status: str, notes: Optional[str] = None):
        """Update the status of an application."""
        if notes:
            self.cursor.execute('''
                UPDATE applications
                SET status = ?, notes = ?
                WHERE job_url = ?
            ''', (status, notes, job_url))
        else:
            self.cursor.execute('''
                UPDATE applications
                SET status = ?
                WHERE job_url = ?
            ''', (status, job_url))
        
        self.conn.commit()
    
    def save_session(self, portal: str, cookies: List[Dict], 
                    local_storage: Optional[Dict] = None,
                    session_storage: Optional[Dict] = None):
        """Save portal session data (cookies, storage)."""
        cookies_json = json.dumps(cookies)
        local_storage_json = json.dumps(local_storage) if local_storage else None
        session_storage_json = json.dumps(session_storage) if session_storage else None
        
        self.cursor.execute('''
            INSERT OR REPLACE INTO sessions 
            (portal, cookies, local_storage, session_storage, last_used, is_valid)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
        ''', (portal, cookies_json, local_storage_json, session_storage_json))
        
        self.conn.commit()
    
    def get_session(self, portal: str) -> Optional[Dict]:
        """Retrieve saved session data for a portal."""
        self.cursor.execute('''
            SELECT * FROM sessions WHERE portal = ? AND is_valid = 1
        ''', (portal,))
        
        row = self.cursor.fetchone()
        if row:
            return {
                'portal': row['portal'],
                'cookies': json.loads(row['cookies']),
                'local_storage': json.loads(row['local_storage']) if row['local_storage'] else None,
                'session_storage': json.loads(row['session_storage']) if row['session_storage'] else None,
                'last_used': row['last_used']
            }
        return None
    
    def invalidate_session(self, portal: str):
        """Mark a session as invalid (e.g., after logout or error)."""
        self.cursor.execute('''
            UPDATE sessions SET is_valid = 0 WHERE portal = ?
        ''', (portal,))
        self.conn.commit()
    
    def _update_daily_stats(self, portal: str):
        """Update daily statistics."""
        today = datetime.now().date()
        
        # Get current stats
        self.cursor.execute('''
            SELECT applications_by_portal FROM daily_stats WHERE date = ?
        ''', (today,))
        
        row = self.cursor.fetchone()
        
        if row:
            # Update existing
            portal_stats = json.loads(row['applications_by_portal']) if row['applications_by_portal'] else {}
            portal_stats[portal] = portal_stats.get(portal, 0) + 1
            
            self.cursor.execute('''
                UPDATE daily_stats
                SET total_applications = total_applications + 1,
                    applications_by_portal = ?
                WHERE date = ?
            ''', (json.dumps(portal_stats), today))
        else:
            # Insert new
            portal_stats = {portal: 1}
            self.cursor.execute('''
                INSERT INTO daily_stats (date, total_applications, applications_by_portal)
                VALUES (?, 1, ?)
            ''', (today, json.dumps(portal_stats)))
        
        self.conn.commit()
    
    def get_daily_stats(self, date: Optional[str] = None) -> Optional[Dict]:
        """Get statistics for a specific date or today."""
        if not date:
            date = datetime.now().date()
        
        self.cursor.execute('''
            SELECT * FROM daily_stats WHERE date = ?
        ''', (date,))
        
        row = self.cursor.fetchone()
        if row:
            return dict(row)
        return None
    
    def log_portal_event(self, portal: str, log_level: str, message: str, details: Optional[str] = None):
        """Log portal events/errors."""
        self.cursor.execute('''
            INSERT INTO portal_logs (portal, log_level, message, details)
            VALUES (?, ?, ?, ?)
        ''', (portal, log_level, message, details))
        self.conn.commit()
    
    def get_application_stats(self) -> Dict[str, Any]:
        """Get overall application statistics."""
        stats = {}
        
        # Total applications
        self.cursor.execute('SELECT COUNT(*) as count FROM applications')
        stats['total_applications'] = self.cursor.fetchone()['count']
        
        # By portal
        self.cursor.execute('''
            SELECT portal, COUNT(*) as count 
            FROM applications 
            GROUP BY portal
        ''')
        stats['by_portal'] = {row['portal']: row['count'] for row in self.cursor.fetchall()}
        
        # By status
        self.cursor.execute('''
            SELECT status, COUNT(*) as count 
            FROM applications 
            GROUP BY status
        ''')
        stats['by_status'] = {row['status']: row['count'] for row in self.cursor.fetchall()}
        
        # Average match score
        self.cursor.execute('SELECT AVG(match_score) as avg FROM applications WHERE match_score IS NOT NULL')
        result = self.cursor.fetchone()
        stats['avg_match_score'] = round(result['avg'], 2) if result['avg'] else None
        
        return stats
    
    def close(self):
        """Close database connection."""
        self.conn.close()
    
    def __enter__(self):
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()


if __name__ == "__main__":
    # Test the database
    db = DatabaseTracker()
    print("Database initialized successfully!")
    print(f"Stats: {db.get_application_stats()}")
    db.close()
