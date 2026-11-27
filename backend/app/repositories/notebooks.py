"""Notebook / page / stroke persistence. Every read is scoped by owner_id."""

from sqlmodel import Session, col, func, select

from app.core.errors import AppError, not_found
from app.models import NotebookRow, PageRow, StrokeRow, utcnow
from app.schemas.notebooks import PageUpsert


def create_notebook(session: Session, owner_id: str, title: str, domain: str | None) -> NotebookRow:
    row = NotebookRow(owner_id=owner_id, title=title, domain=domain)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def list_notebooks(session: Session, owner_id: str) -> list[NotebookRow]:
    stmt = select(NotebookRow).where(NotebookRow.owner_id == owner_id).order_by(col(NotebookRow.updated_at).desc())
    return list(session.exec(stmt))


def get_owned_notebook(session: Session, owner_id: str, notebook_id: str) -> NotebookRow:
    row = session.get(NotebookRow, notebook_id)
    if row is None or row.owner_id != owner_id:
        raise not_found("Notebook", notebook_id)
    return row


def list_pages(session: Session, owner_id: str, notebook_id: str) -> list[PageRow]:
    get_owned_notebook(session, owner_id, notebook_id)
    stmt = select(PageRow).where(PageRow.notebook_id == notebook_id).order_by(col(PageRow.order))
    return list(session.exec(stmt))


def stroke_count(session: Session, page_id: str) -> int:
    stmt = (
        select(func.count())
        .select_from(StrokeRow)
        .where(StrokeRow.page_id == page_id, col(StrokeRow.deleted).is_(False))
    )
    return int(session.exec(stmt).one())


def upsert_page(session: Session, owner_id: str, notebook_id: str, page_id: str, body: PageUpsert) -> PageRow:
    """Optimistic concurrency: body.version must equal the stored version (0 for new pages)."""
    notebook = get_owned_notebook(session, owner_id, notebook_id)
    page = session.get(PageRow, page_id)

    if page is not None and page.notebook_id != notebook_id:
        raise not_found("Page", page_id)

    current_version = page.version if page is not None else 0
    if body.version != current_version:
        raise AppError(
            409,
            "version_conflict",
            "Page was changed elsewhere; reload and retry",
            {"expected_version": current_version, "received_version": body.version},
        )

    if page is None:
        page = PageRow(id=page_id, notebook_id=notebook_id)

    page.chapter = body.chapter
    page.order = body.order
    page.title = body.title
    page.background = str(body.background)
    page.bookmarked = body.bookmarked
    page.version = current_version + 1
    page.updated_at = utcnow()
    session.add(page)
    session.flush()  # parent first: FK from strokes -> pages

    for stroke in body.strokes or []:
        if stroke.page_id != page_id:
            raise AppError(422, "stroke_page_mismatch", "Stroke belongs to another page", {"stroke_id": stroke.id})
        existing = session.get(StrokeRow, stroke.id)
        if existing is not None and existing.page_id != page_id:
            raise AppError(422, "stroke_page_mismatch", "Stroke belongs to another page", {"stroke_id": stroke.id})
        row = existing or StrokeRow(
            id=stroke.id, page_id=page_id, points=[], tool="pen", color="#000000", width=1, bbox={}
        )
        row.points = stroke.points
        row.pressure = stroke.pressure
        row.timestamps = stroke.timestamps
        row.tool = str(stroke.tool)
        row.color = stroke.color
        row.width = stroke.width
        row.bbox = stroke.bbox.model_dump()
        row.deleted = stroke.deleted
        session.add(row)

    notebook.updated_at = utcnow()
    session.add(notebook)
    session.commit()
    session.refresh(page)
    return page
