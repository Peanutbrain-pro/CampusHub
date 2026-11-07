from __future__ import annotations

import logging
from google.genai import errors

logger = logging.getLogger(__name__)

HIGH_DEMAND_MSG = (
    "The AI model is currently experiencing high demand. Please wait a moment and try again."
)
QUOTA_EXCEEDED_MSG = (
    "The AI model rate limit or quota has been reached. Please wait a moment before retrying."
)
GENERIC_AI_ERROR_MSG = "The AI service encountered an issue. Please try again."


def parse_gemini_error(exc: Exception) -> tuple[int, str]:
    """Inspects a Gemini or general exception and returns (status_code, user_facing_message)."""
    exc_str = str(exc).lower()

    if isinstance(exc, errors.APIError):
        # 503 Service Unavailable / Overloaded
        if (
            exc.code == 503
            or exc.status == "UNAVAILABLE"
            or "overloaded" in exc_str
            or "high demand" in exc_str
        ):
            return 503, HIGH_DEMAND_MSG

        # 429 Quota / Rate limit
        if exc.code == 429 or exc.status == "RESOURCE_EXHAUSTED" or "quota" in exc_str:
            return 429, QUOTA_EXCEEDED_MSG

        # Generic API Error with status
        if exc.message:
            return exc.code or 502, f"AI model error: {exc.message}"

    # Also catch string indicators if exception was wrapped or from HTTP client
    if "overloaded" in exc_str or "high demand" in exc_str or "503" in exc_str or "unavailable" in exc_str:
        return 503, HIGH_DEMAND_MSG

    if "resource_exhausted" in exc_str or "quota" in exc_str or "rate limit" in exc_str:
        return 429, QUOTA_EXCEEDED_MSG

    return 502, GENERIC_AI_ERROR_MSG
