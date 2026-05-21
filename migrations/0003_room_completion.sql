-- Per-room install completion tracking.
--
-- The installer marks each room done as they finish it. At end of day,
-- any room scheduled for that day that is NOT marked done is "unfinished"
-- and gets rolled forward to the earliest cap-safe, conflict-free day.
--
-- Completion is tied to a (work_item, room, day) so it is unambiguous even
-- when a room appears in more than one work item.

CREATE TABLE IF NOT EXISTS room_completion (
    id            SERIAL PRIMARY KEY,
    work_item_id  TEXT NOT NULL REFERENCES work_items(id),
    room_code     TEXT NOT NULL,
    day           INTEGER NOT NULL,        -- the day the room was scheduled on
    status        TEXT NOT NULL DEFAULT 'done',  -- 'done'
    marked_by     TEXT,                    -- 'installer'
    marked_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (work_item_id, room_code, day)
);

CREATE INDEX IF NOT EXISTS idx_completion_day ON room_completion(day);
CREATE INDEX IF NOT EXISTS idx_completion_wi  ON room_completion(work_item_id);

-- Audit log of end-of-day roll-forwards: which room moved, from where to
-- where, so the schedule history is traceable.
CREATE TABLE IF NOT EXISTS unfinished_rollovers (
    id            SERIAL PRIMARY KEY,
    work_item_id  TEXT NOT NULL REFERENCES work_items(id),
    room_code     TEXT NOT NULL,
    from_day      INTEGER NOT NULL,
    to_day        INTEGER NOT NULL,
    version_id    INTEGER REFERENCES schedule_versions(id),
    rolled_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rollover_day ON unfinished_rollovers(from_day);
