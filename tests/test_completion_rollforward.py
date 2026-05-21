"""
Tests for the four roll-forward bugs in app/completion.py.

These are written BEFORE the fix on purpose. We EXPECT them to fail right
now -- that red is the proof each bug is real. Once completion.py is fixed
they should all turn green, and then they stay forever as regression tests
(they will scream if anyone re-breaks this code later).

Shared scenario for most tests:
  One work item "W1" scheduled on day 5, 7 windows across 2 rooms, with
  neither room marked done. Ending day 5 must roll both rooms forward.
"""
from app.db import fetch_one
from app.completion import end_day, project_progress, mark_room
from app.swap_engine import get_work_item_panels
from tests.helpers import make_version, make_work_item


def _total_windows(version_id):
    """Sum of window quantities across every work item placed in a version."""
    return fetch_one("""
        SELECT COALESCE(SUM(wi.qty), 0) AS total
        FROM assignments a
        JOIN work_items wi ON wi.id = a.work_item_id
        WHERE a.version_id = :v
    """, v=version_id)["total"]


def test_rollforward_conserves_total_windows(db):
    """
    BUG 1 -- lossy split. Each room's share is rounded, so windows get
    invented or lost. A 7-window item over 2 rooms must STILL be 7 windows
    after both rooms roll forward.
    """
    v1 = make_version("v1", active=True)
    make_work_item(v1, "W1", day=5, qty=7, rooms=["RM-01", "RM-02"])

    result = end_day(5)
    new_v = result["new_version_id"]

    total = _total_windows(new_v)
    assert total == 7, f"windows not conserved: 7 became {total}"


def test_rolled_room_is_not_scheduled_twice(db):
    """
    BUG 2 -- double scheduling. A rolled room is split into a new work item
    but is never removed from the original, so it ends up on TWO days.
    The project should still contain exactly 2 rooms, not 4.
    """
    v1 = make_version("v1", active=True)
    make_work_item(v1, "W1", day=5, qty=7, rooms=["RM-01", "RM-02"])

    end_day(5)
    progress = project_progress()

    assert progress["rooms_total"] == 2, (
        f"rooms double-counted: expected 2, got {progress['rooms_total']}"
    )


def test_end_day_is_idempotent(db):
    """
    BUG 3 -- not idempotent. Closing the same day twice rolls the rooms
    forward AGAIN. The second call should find nothing left to roll.
    """
    v1 = make_version("v1", active=True)
    make_work_item(v1, "W1", day=5, qty=7, rooms=["RM-01", "RM-02"])

    end_day(5)            # first close -- rolls both rooms
    second = end_day(5)   # second close -- should be a no-op

    rolled_again = second.get("rolled_count", 0)
    assert second.get("all_finished") is True or rolled_again == 0, (
        f"end_day not idempotent: second call rolled {rolled_again} rooms"
    )


def test_split_work_item_carries_its_panels(db):
    """
    BUG 4 -- panels lost. The split-out work item is created with no panel
    records, so the rolled room becomes invisible to the swap engine and to
    panel-mix matching. The split must carry panels.
    """
    v1 = make_version("v1", active=True)
    make_work_item(v1, "W1", day=5, qty=7, rooms=["RM-01", "RM-02"],
                   panels={"S1": 4, "S2": 3})

    end_day(5)
    split_panels = get_work_item_panels("W1-R-RM-01")

    assert split_panels, "split work item W1-R-RM-01 has no panel records"


def test_partial_day_keeps_finished_rooms_with_the_parent(db):
    """
    Mixed case: some rooms done, some not. Only the unfinished rooms should
    roll forward; the finished room stays with the original work item, and
    the windows still add up to the original total.
    """
    v1 = make_version("v1", active=True)
    make_work_item(v1, "W1", day=5, qty=9,
                   rooms=["RM-01", "RM-02", "RM-03"])

    # The installer finished RM-02 only.
    mark_room("W1", "RM-02", day=5, done=True)

    result = end_day(5)
    new_v = result["new_version_id"]

    # Exactly two rooms rolled (RM-01 and RM-03); RM-02 stayed.
    assert result["rolled_count"] == 2

    # Windows conserved: still 9 across the whole schedule.
    assert _total_windows(new_v) == 9

    # The project still has exactly 3 rooms -- none lost, none duplicated.
    assert project_progress()["rooms_total"] == 3
