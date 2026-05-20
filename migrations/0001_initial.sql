-- Woodhull SWR Scheduler — initial migration
-- Targets Postgres 16 (Railway). Compatible with SQLite for local dev.

CREATE TABLE IF NOT EXISTS panel_types (
    code         TEXT PRIMARY KEY,
    description  TEXT
);

CREATE TABLE IF NOT EXISTS batches (
    code  TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS deliveries (
    id            SERIAL PRIMARY KEY,
    label         TEXT NOT NULL,
    delivery_date DATE
);

CREATE TABLE IF NOT EXISTS delivery_batches (
    delivery_id  INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    batch_code   TEXT NOT NULL REFERENCES batches(code),
    PRIMARY KEY (delivery_id, batch_code)
);

CREATE TABLE IF NOT EXISTS rooms (
    code         TEXT PRIMARY KEY,
    kind         TEXT NOT NULL,
    description  TEXT
);

CREATE TABLE IF NOT EXISTS work_items (
    id           TEXT PRIMARY KEY,
    bay          TEXT NOT NULL,
    batch_code   TEXT NOT NULL REFERENCES batches(code),
    rooms_text   TEXT NOT NULL,
    qty          INTEGER NOT NULL,
    source_day   INTEGER NOT NULL,
    sequence     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS work_item_rooms (
    work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    room_code    TEXT NOT NULL REFERENCES rooms(code),
    PRIMARY KEY (work_item_id, room_code)
);

CREATE TABLE IF NOT EXISTS work_item_panels (
    work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    panel_code   TEXT NOT NULL REFERENCES panel_types(code),
    qty          INTEGER NOT NULL,
    PRIMARY KEY (work_item_id, panel_code)
);

CREATE TABLE IF NOT EXISTS schedule_versions (
    id          SERIAL PRIMARY KEY,
    label       TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    parent_id   INTEGER REFERENCES schedule_versions(id),
    is_active   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS assignments (
    version_id    INTEGER NOT NULL REFERENCES schedule_versions(id) ON DELETE CASCADE,
    work_item_id  TEXT NOT NULL REFERENCES work_items(id),
    day           INTEGER NOT NULL,
    sequence      INTEGER NOT NULL,
    PRIMARY KEY (version_id, work_item_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_v_day ON assignments(version_id, day);

CREATE TABLE IF NOT EXISTS room_unavailability (
    id           SERIAL PRIMARY KEY,
    room_code    TEXT NOT NULL REFERENCES rooms(code),
    day          INTEGER NOT NULL,
    marked_by    TEXT,
    marked_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason       TEXT,
    status       TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_unavail_day ON room_unavailability(day, status);

CREATE TABLE IF NOT EXISTS config (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);
