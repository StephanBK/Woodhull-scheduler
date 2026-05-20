-- Same-day swap audit log.
-- When the installer arrives at a bay that's locked, INOVUES (or auto)
-- swaps in a future bay whose panels are already on the floor.

CREATE TABLE IF NOT EXISTS same_day_swaps (
    id              SERIAL PRIMARY KEY,
    day             INTEGER NOT NULL,         -- the day on which the swap happened
    locked_work_id  TEXT NOT NULL REFERENCES work_items(id),  -- the one we couldn't install
    swap_in_work_id TEXT NOT NULL REFERENCES work_items(id),  -- the one we installed instead
    triggered_by    TEXT,                     -- 'installer', 'inovues', 'auto'
    triggered_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_swaps_day ON same_day_swaps(day);
