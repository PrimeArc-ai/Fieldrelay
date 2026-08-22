from __future__ import annotations

from dataclasses import dataclass

from app.config import get_settings

SUPPORTED = "supported"
UNSUPPORTED = "unsupported"
UNAVAILABLE = "unavailable"


@dataclass
class ServiceAreaResult:
    status: str
    zip: str | None


class ServiceAreaService:
    """Backend is the source of truth for coverage. The model must not guess."""

    def __init__(self) -> None:
        self.force_unavailable = False

    def check(self, zip_code: str | None) -> ServiceAreaResult:
        if self.force_unavailable:
            return ServiceAreaResult(status=UNAVAILABLE, zip=zip_code)
        if not zip_code:
            return ServiceAreaResult(status=UNAVAILABLE, zip=zip_code)
        normalized = zip_code.strip()
        if normalized in get_settings().zip_allowlist:
            return ServiceAreaResult(status=SUPPORTED, zip=normalized)
        return ServiceAreaResult(status=UNSUPPORTED, zip=normalized)

    def reset(self) -> None:
        self.force_unavailable = False


service_area_service = ServiceAreaService()
