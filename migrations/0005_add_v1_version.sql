-- Woodhull SWR Scheduler — migration 0005
-- Add the V1 "whole bays" 28-day schedule and make it the active version.
--
-- WHY: the deployed schedule is V2 (cap-exact, bays split across days, 23
-- working days). Hospital coordination is easier on V1: whole bays, no
-- splitting, 28 days, bays installed in ascending order 01..83. The day route
-- is copied exactly from the woodhull_walk Version 1 layout.
--
-- HOW: a schedule "version" is a set of assignments mapping each existing
-- work_item to a (day, sequence). We reuse the 93 work_items already in the
-- DB (rooms & panels hang off work_item_id, so they come along for free) and
-- only re-date them. V2 is left intact and can be re-activated later.
--
-- SAFETY: migrations run BEFORE seed(), so on a brand-new empty DB the
-- work_items don't exist yet. Every statement below is therefore guarded so
-- that on an empty DB this migration is a clean no-op (seed() will create the
-- normal 'Original' version instead). On the existing prod DB the work_items
-- are already present, so it runs in full. The whole file is ONE transaction.

-- 1. Only one active version is allowed (migration 0004). Deactivate the
--    current active version first — but only if this DB is populated.
UPDATE schedule_versions SET is_active = FALSE
WHERE is_active AND EXISTS (SELECT 1 FROM work_items);

-- 2. Create the V1 version row (active) — only if the DB is populated.
INSERT INTO schedule_versions(label, is_active)
SELECT 'V1 — Whole Bays (28 day)', TRUE
WHERE EXISTS (SELECT 1 FROM work_items);

-- 3. Assign every work_item to its V1 (day, sequence). Written as
--    INSERT ... SELECT joined to work_items, so a row is inserted ONLY when
--    both the V1 version and that work_item exist. On an empty DB: 0 rows,
--    no foreign-key violation. version_id is resolved by label (SERIAL ids
--    differ between Postgres prod and SQLite dev).

-- Day 1 (5 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 1, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W01-001';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 1, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W01-002';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 1, 3
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W01-003';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 1, 4
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W01-004';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 1, 5
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W01-005';

-- Day 2 (1 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 2, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W02-007';

-- Day 3 (2 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 3, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W01-006';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 3, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W02-008';

-- Day 4 (1 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 4, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W03-010';

-- Day 5 (3 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 5, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W03-011';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 5, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W02-009';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 5, 3
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W04-012';

-- Day 6 (2 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 6, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W04-013';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 6, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W04-014';

-- Day 7 (1 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 7, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W05-015';

-- Day 8 (1 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 8, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W05-016';

-- Day 9 (3 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 9, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W06-017';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 9, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W06-018';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 9, 3
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W06-019';

-- Day 10 (2 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 10, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W06-020';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 10, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W07-021';

-- Day 11 (3 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 11, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W07-022';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 11, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W07-023';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 11, 3
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W08-024';

-- Day 12 (2 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 12, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W08-025';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 12, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W08-026';

-- Day 13 (6 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 13, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W09-027';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 13, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W09-028';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 13, 3
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W09-029';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 13, 4
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W09-030';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 13, 5
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W09-031';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 13, 6
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W09-032';

-- Day 14 (4 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 14, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W10-033';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 14, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W11-036';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 14, 3
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W12-039';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 14, 4
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W10-034';

-- Day 15 (2 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 15, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W10-035';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 15, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W11-037';

-- Day 16 (2 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 16, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W11-038';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 16, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W12-040';

-- Day 17 (5 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 17, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W12-041';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 17, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W12-042';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 17, 3
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W13-043';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 17, 4
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W13-044';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 17, 5
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W13-045';

-- Day 18 (7 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 18, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W13-046';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 18, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W13-047';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 18, 3
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W13-048';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 18, 4
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W13-049';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 18, 5
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W14-050';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 18, 6
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W15-054';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 18, 7
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W14-051';

-- Day 19 (2 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 19, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W14-052';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 19, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W14-053';

-- Day 20 (3 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 20, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W15-055';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 20, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W15-056';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 20, 3
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W15-057';

-- Day 21 (5 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 21, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W16-059';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 21, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W16-060';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 21, 3
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W16-061';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 21, 4
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W15-058';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 21, 5
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W16-062';

-- Day 22 (6 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 22, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W17-063';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 22, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W17-064';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 22, 3
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W17-065';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 22, 4
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W17-066';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 22, 5
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W17-067';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 22, 6
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W17-068';

-- Day 23 (2 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 23, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W18-069';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 23, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W18-070';

-- Day 24 (3 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 24, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W18-071';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 24, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W19-072';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 24, 3
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W19-073';

-- Day 25 (7 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 25, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W19-074';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 25, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W19-075';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 25, 3
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W19-076';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 25, 4
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W20-077';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 25, 5
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W20-078';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 25, 6
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W20-079';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 25, 7
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W20-080';

-- Day 26 (6 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 26, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W20-081';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 26, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W21-084';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 26, 3
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W20-082';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 26, 4
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W20-083';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 26, 5
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W21-085';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 26, 6
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W21-086';

-- Day 27 (6 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 27, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W21-087';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 27, 2
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W21-088';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 27, 3
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W21-089';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 27, 4
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W22-090';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 27, 5
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W22-091';
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 27, 6
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W22-092';

-- Day 28 (1 work items)
INSERT INTO assignments(version_id, work_item_id, day, sequence)
SELECT v.id, wi.id, 28, 1
FROM schedule_versions v, work_items wi
WHERE v.label = 'V1 — Whole Bays (28 day)' AND wi.id = 'W22-093';
