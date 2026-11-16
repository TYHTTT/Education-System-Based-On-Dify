import secrets
import uuid
from datetime import UTC, datetime, timedelta

from app.core.exceptions import AdminUnauthorizedError
from app.core.admin_preview import admin_preview_student_id
from app.core.security import hash_password, hash_session_token, verify_password
from app.db.database import PostgresDatabase

PUBLIC_COLUMNS = "id, username, display_name, created_at, last_active_at"


class AdminRepository:
    """Administrator accounts, with one revocable active session per account."""

    def __init__(self, database_url: str) -> None:
        self.database = PostgresDatabase(database_url)

    @staticmethod
    def _session():
        now = datetime.now(UTC)
        token = secrets.token_urlsafe(32)
        return (
            token,
            hash_session_token(token),
            now.isoformat(),
            (now + timedelta(days=30)).isoformat(),
        )

    def register(self, *, username: str, password: str, display_name: str) -> dict:
        token, token_hash, now, expires = self._session()
        password_hash = hash_password(password)
        with self.database.connect() as connection:
            row = connection.execute(
                f"""INSERT INTO administrators(
                    id,username,display_name,password_hash,session_token_hash,
                    session_expires_at,created_at,last_active_at
                ) VALUES (?,?,?,?,?,?,?,?) RETURNING {PUBLIC_COLUMNS}""",
                (
                    str(uuid.uuid4()),
                    username.lower(),
                    display_name.strip(),
                    password_hash,
                    token_hash,
                    expires,
                    now,
                    now,
                ),
            ).fetchone()
        return {**dict(row), "access_token": token}

    def login(self, *, username: str, password: str) -> dict | None:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT id,password_hash FROM administrators WHERE username=? AND active=1",
                (username.strip().lower(),),
            ).fetchone()
        if row is None or not verify_password(password, row["password_hash"]):
            return None
        token, token_hash, now, expires = self._session()
        with self.database.connect() as connection:
            account = connection.execute(
                f"""UPDATE administrators SET session_token_hash=?,session_expires_at=?,last_active_at=?
                    WHERE id=? AND active=1 AND password_hash=? RETURNING {PUBLIC_COLUMNS}""",
                (token_hash, expires, now, row["id"], row["password_hash"]),
            ).fetchone()
        return {**dict(account), "access_token": token} if account else None

    def from_token(self, token: str) -> dict:
        now = datetime.now(UTC).isoformat()
        with self.database.connect() as connection:
            account = connection.execute(
                f"""UPDATE administrators SET last_active_at=?
                    WHERE session_token_hash=? AND session_expires_at>? AND active=1
                    RETURNING {PUBLIC_COLUMNS}""",
                (now, hash_session_token(token), now),
            ).fetchone()
        if account is None:
            raise AdminUnauthorizedError()
        return dict(account)

    def logout(self, token: str) -> None:
        with self.database.connect() as connection:
            connection.execute(
                "UPDATE administrators SET session_token_hash=NULL,session_expires_at=NULL WHERE session_token_hash=?",
                (hash_session_token(token),),
            )

    def delete_current(self, *, token: str, password: str) -> bool:
        now = datetime.now(UTC).isoformat()
        with self.database.connect() as connection:
            account = connection.execute(
                """SELECT id,password_hash FROM administrators
                    WHERE session_token_hash=? AND session_expires_at>? AND active=1
                    FOR UPDATE""",
                (hash_session_token(token), now),
            ).fetchone()
            if account is None:
                raise AdminUnauthorizedError()
            if not verify_password(password, account["password_hash"]):
                return False
            connection.execute(
                "DELETE FROM students WHERE id=?",
                (admin_preview_student_id(account["id"]),),
            )
            connection.execute(
                "DELETE FROM administrators WHERE id=?", (account["id"],)
            )
        return True

    def change_password(
        self, *, token: str, current_password: str, new_password: str
    ) -> bool:
        now = datetime.now(UTC).isoformat()
        with self.database.connect() as connection:
            account = connection.execute(
                """SELECT id,password_hash FROM administrators
                    WHERE session_token_hash=? AND session_expires_at>? AND active=1
                    FOR UPDATE""",
                (hash_session_token(token), now),
            ).fetchone()
            if account is None:
                raise AdminUnauthorizedError()
            if not verify_password(current_password, account["password_hash"]):
                return False
            connection.execute(
                """UPDATE administrators SET password_hash=?,session_token_hash=NULL,
                    session_expires_at=NULL WHERE id=?""",
                (hash_password(new_password), account["id"]),
            )
        return True
