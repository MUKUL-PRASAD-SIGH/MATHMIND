from typing import Annotated

from fastapi import APIRouter, Path

from app.api.deps import SessionDep, UserDep
from app.models import NotebookRow, PageRow
from app.repositories import notebooks as repo
from app.schemas.common import ErrorResponse
from app.schemas.notebooks import Background, Notebook, NotebookCreate, Page, PageUpsert

router = APIRouter(prefix="/notebooks", tags=["notebooks"])

IdPath = Annotated[str, Path(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]
ERRORS: dict[int | str, dict[str, object]] = {
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
}


def _notebook(row: NotebookRow) -> Notebook:
    return Notebook(id=row.id, title=row.title, domain=row.domain, created_at=row.created_at, updated_at=row.updated_at)


def _page(session: SessionDep, row: PageRow) -> Page:
    return Page(
        id=row.id,
        notebook_id=row.notebook_id,
        chapter=row.chapter,
        order=row.order,
        title=row.title,
        background=Background(row.background),
        bookmarked=row.bookmarked,
        version=row.version,
        stroke_count=repo.stroke_count(session, row.id),
    )


@router.post("", response_model=Notebook, status_code=201, responses=ERRORS)
def create_notebook(body: NotebookCreate, session: SessionDep, user: UserDep) -> Notebook:
    return _notebook(repo.create_notebook(session, user.id, body.title, body.domain))


@router.get("", response_model=list[Notebook])
def list_notebooks(session: SessionDep, user: UserDep) -> list[Notebook]:
    return [_notebook(r) for r in repo.list_notebooks(session, user.id)]


@router.get("/{notebook_id}/pages", response_model=list[Page], responses=ERRORS)
def list_pages(session: SessionDep, user: UserDep, notebook_id: IdPath) -> list[Page]:
    return [_page(session, p) for p in repo.list_pages(session, user.id, notebook_id)]


@router.put("/{notebook_id}/pages/{page_id}", response_model=Page, responses=ERRORS)
def upsert_page(body: PageUpsert, session: SessionDep, user: UserDep, notebook_id: IdPath, page_id: IdPath) -> Page:
    """Replace page metadata (omitted fields reset to defaults) and upsert an optional stroke batch.

    IndexedDB stays the client's source of truth; this is best-effort sync.
    """
    return _page(session, repo.upsert_page(session, user.id, notebook_id, page_id, body))
