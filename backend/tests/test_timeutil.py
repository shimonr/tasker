from datetime import datetime, timedelta, timezone

from app.timeutil import as_utc


def test_as_utc_treats_naive_values_as_utc():
    assert as_utc(datetime(2026, 11, 16, 9, 30)) == datetime(2026, 11, 16, 9, 30, tzinfo=timezone.utc)


def test_as_utc_converts_aware_values_to_utc():
    plus_two = timezone(timedelta(hours=2))
    result = as_utc(datetime(2026, 11, 16, 11, 30, tzinfo=plus_two))
    assert result == datetime(2026, 11, 16, 9, 30, tzinfo=timezone.utc)
    assert result.utcoffset() == timedelta(0)
