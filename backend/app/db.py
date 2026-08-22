from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def _ensure_sqlite_dir(url: str) -> None:
    if not url.startswith("sqlite:///"):
        return
    raw_path = url.replace("sqlite:///", "", 1)
    if raw_path in {":memory:", ""}:
        return
    path = Path(raw_path)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.parent.mkdir(parents=True, exist_ok=True)


settings = get_settings()
_ensure_sqlite_dir(settings.database_url)

sqlite = settings.database_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if sqlite else {}
engine_kwargs = {"connect_args": connect_args}
if sqlite and ":memory:" in settings.database_url:
    engine_kwargs["poolclass"] = StaticPool
engine = create_engine(settings.database_url, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
