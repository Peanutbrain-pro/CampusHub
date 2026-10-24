"""
API routes for the Daily Quiz feature.
"""

from fastapi import APIRouter, Depends

from core.security import get_current_user
from features.daily_quiz.schemas import (
    QuizSubmissionRequest,
    QuizSubmissionResponse,
)
from features.daily_quiz.service import (
    get_today_questions,
    submit_quiz,
)

router = APIRouter()


@router.get("/today")
async def get_today_quiz(
    current_user: dict = Depends(get_current_user),
):
    """Return today's quiz questions."""

    from datetime import date

    return {
        "date": date.today().isoformat(),
        "questions": get_today_questions(),
    }


@router.post(
    "/submit",
    response_model=QuizSubmissionResponse,
)
async def submit_daily_quiz(
    request: QuizSubmissionRequest,
    current_user: dict = Depends(get_current_user),
):
    """Evaluate a student's quiz answers."""

    return submit_quiz(request)