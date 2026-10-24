"""Helper functions for calculating Daily Quiz streaks."""

from datetime import date, timedelta


def calculate_streak(
    current_streak: int,
    last_completed_date: date | None,
    today: date,
) -> int:
    """Calculate the streak after a quiz is completed."""

    if last_completed_date is None:
        return 1

    if last_completed_date == today:
        return current_streak

    if last_completed_date == today - timedelta(days=1):
        return current_streak + 1

    return 1
