"""FastAPI app factory.  Run:  uvicorn app.main:app --reload --port 8000"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.api.v1 import health, learners, notebooks, submissions
from app.core.config import Settings, get_settings
from app.core.db import init_db, make_engine
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.repositories.learning import get_or_create_default_user
from app.seed import seed
from app.services.jobs.runner import JobRunner
from app.services.jobs.stages import install_real_stages

log = logging.getLogger(__name__)
API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None, *, synchronous_jobs: bool = False) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        configure_logging()
        engine = make_engine(settings.database_url)
        init_db(engine)
        with Session(engine) as s:
            get_or_create_default_user(s)
        if settings.seed_on_startup:
            try:
                n_c, n_p = seed(engine, settings.datasets_dir)
                log.info("seeded %d concepts, %d problems", n_c, n_p)
            except Exception:
                log.exception("seeding failed; continuing without seed data")
        runner = JobRunner(engine, settings, synchronous=synchronous_jobs)
        recovered = runner.recover_interrupted()
        if recovered:
            log.warning("marked %d interrupted submissions as failed", recovered)
        app.state.engine = engine
        app.state.runner = runner
        yield
        runner.shutdown()
        engine.dispose()

    app = FastAPI(
        title="MathMind API",
        version=settings.app_version,
        description="Intelligent mathematics notebook — local-first API. Contract: shared/contracts/.",
        lifespan=lifespan,
        separate_input_output_schemas=False,
    )
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)
    for module in (health, notebooks, submissions, learners):
        app.include_router(module.router, prefix=API_PREFIX)
    return app


install_real_stages()
app = create_app()
