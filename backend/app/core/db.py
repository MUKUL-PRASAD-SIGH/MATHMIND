"""Database engine + session helpers (SQLite by default)."""

from collections.abc import Iterator
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, event
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

MEMORY_URLS = ("sqlite://", "sqlite:///:memory:")


def _install_sqlite_pragmas(engine: Engine, *, wal: bool) -> None:
    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_conn: Any, _: Any) -> None:
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        if wal:
            # WAL lets API requests read while job workers write.
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA busy_timeout=15000")
        cur.close()


def make_engine(database_url: str) -> Engine:
    if not database_url.startswith("sqlite"):
        return create_engine(database_url)
    if database_url in MEMORY_URLS:
        # Tests only: one shared connection, so keep background-thread tests on a file DB.
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        _install_sqlite_pragmas(engine, wal=False)
        return engine
    Path(database_url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(database_url, connect_args={"check_same_thread": False, "timeout": 15})
    _install_sqlite_pragmas(engine, wal=True)
    return engine


def init_db(engine: Engine) -> None:
    from app import models  # noqa: F401  (register tables)

    SQLModel.metadata.create_all(engine)


def session_scope(engine: Engine) -> Iterator[Session]:
    with Session(engine) as session:
        yield session
