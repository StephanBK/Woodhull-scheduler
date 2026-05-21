-- Tier 2 #5: guarantee at most ONE active schedule version.
--
-- This app has three roles (Hospital, Installer, INOVUES). Every schedule
-- change does "deactivate the old version, insert a new active one". But
-- nothing stopped two of those happening at once -- a race could leave two
-- rows with is_active = TRUE, and the app would silently pick one with
-- ORDER BY id DESC, quietly dropping the other change.
--
-- A partial unique index covers only the rows where is_active is true and
-- requires them to be unique. Since they would all carry the same value,
-- at most one such row can exist. A second concurrent activation now fails
-- loudly with an integrity error (and can be retried) instead of corrupting
-- the schedule in silence.

-- Repair first: if the table already holds more than one active version,
-- keep only the newest and deactivate the rest, so the index can be built.
UPDATE schedule_versions SET is_active = FALSE
WHERE is_active
  AND id <> (SELECT MAX(id) FROM schedule_versions WHERE is_active);

-- The constraint itself. Works on both SQLite and Postgres.
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_versions_one_active
    ON schedule_versions (is_active)
    WHERE is_active;
