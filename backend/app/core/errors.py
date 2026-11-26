"""Uniform error body: {"error": {"code", "message", "details"}}."""

import re
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}


def not_found(what: str, ident: str) -> AppError:
    # 404 (not 403) for objects that don't exist OR aren't owned by the caller.
    return AppError(404, "not_found", f"{what} not found", {"id": ident})


def _body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details or {}}}


_HTTP_METHODS = {"get", "put", "post", "delete", "patch", "head", "options", "trace"}


def _allowed_methods(request: Request) -> list[str]:
    """Every method served at this path. Starlette's 405 only lists the first matching route's methods,
    which is wrong when GET and POST on one path are separate routes."""
    # Read from the app's (cached) OpenAPI document: public API, and exactly what the contract promises.
    path = request.url.path
    methods: set[str] = set()
    for template, operations in request.app.openapi().get("paths", {}).items():
        literal_parts = re.split(r"\{[^/}]+\}", template)  # "/a/{id}/b" -> ["/a/", "/b"]
        pattern = "[^/]+".join(re.escape(part) for part in literal_parts)
        if re.fullmatch(pattern, path):
            methods.update(m.upper() for m in operations if m in _HTTP_METHODS)
    return sorted(methods)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=_body(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [{"loc": list(e.get("loc", [])), "msg": e.get("msg", "")} for e in exc.errors()]
        return JSONResponse(status_code=422, content=_body("validation_error", "Invalid request", {"errors": errors}))

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        headers = dict(exc.headers or {})  # keep Starlette's headers (e.g. Retry-After)
        if exc.status_code == 405:
            headers["Allow"] = ", ".join(_allowed_methods(request))  # required by RFC 9110
        return JSONResponse(status_code=exc.status_code, content=_body("http_error", str(exc.detail)), headers=headers)
