"""Shared contract primitives. Coordinates are page-normalized (0..1)."""

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class ContractModel(BaseModel):
    """Base for every contract model: unknown fields are rejected."""

    model_config = ConfigDict(extra="forbid")


class BBox(ContractModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(ge=0, le=1)
    h: float = Field(ge=0, le=1)


class ErrorDetail(ContractModel):
    code: str
    message: str
    details: dict[str, object] = Field(default_factory=dict)


class ErrorResponse(ContractModel):
    error: ErrorDetail


class ServiceState(StrEnum):
    up = "up"
    down = "down"
    unknown = "unknown"


class OcrState(StrEnum):
    loaded = "loaded"
    not_loaded = "not_loaded"
    not_installed = "not_installed"


class Health(ContractModel):
    status: str = "ok"
    version: str
    ollama: ServiceState
    ollama_model: str
    pix2tex: OcrState
