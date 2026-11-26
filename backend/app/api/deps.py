from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request
from sqlmodel import Session

from app.core.config import Settings
from app.models import User
from app.repositories.learning import get_or_create_default_user
from app.services.jobs.runner import JobRunner


def get_session(request: Request) -> Iterator[Session]:
    with Session(request.app.state.engine) as session:
        yield session


def get_settings_dep(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_runner(request: Request) -> JobRunner:
    runner: JobRunner = request.app.state.runner
    return runner


SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
RunnerDep = Annotated[JobRunner, Depends(get_runner)]


def current_user(session: SessionDep) -> User:
    """Single-user MVP: the local learner. Ownership checks still use user.id everywhere."""
    return get_or_create_default_user(session)


UserDep = Annotated[User, Depends(current_user)]
