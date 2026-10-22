-- NocoBase owns the registered_machines collection and its columns.
-- bootstrap/migrations/20260827-registered-machines.mjs declares
-- `indexes: [{ name: 'registered_machines_machine_key_uk', fields:
-- ['machine_key'], unique: true }]` on that collection, but a NocoBase
-- `indexes:[...]` entry created through `collections:create` is metadata
-- only -- it never becomes a real PostgreSQL constraint. This is a general
-- property of this NocoBase version's collections API, not specific to any
-- one collection: see bootstrap/diagnose-agents-index.mjs and
-- docs/phase-1-operation.md's "Diagnosing a verify-phase-1 index mismatch"
-- section (verified on a disposable stack, 2026-09-02).
--
-- web/app/api/machine-registrations/route.ts:50-53 (findMachine) and
-- web/app/api/agent-stage-events/route.ts:68 (findMachine) both look a
-- machine up by machine_key alone with no other scoping field on the
-- collection (registered_machines has no owner/tenant column), so
-- machine_key is meant to be globally unique and this is a single-column
-- index.
--
-- machine_key is server-generated (`'machine-' + randomBytes(8).toString
-- ('hex')`, web/app/api/machine-registrations/route.ts:93) rather than
-- caller-supplied, so a collision is astronomically unlikely in practice --
-- but "unlikely" is exactly the case a uniqueness guarantee exists for, and
-- an application-level "look up, then insert" is still a race between two
-- concurrent enrollment requests. The database constraint is what actually
-- holds the guarantee.
--
-- registered_machines.machine_key is NOT NULL at the NocoBase field level
-- (`fields` in 20260827-registered-machines.mjs), so there is no
-- NULL-exclusion concern here.
--
-- If duplicate machine_key values already exist, creating the index outright
-- would abort with an error and, under `schema-guard`'s `ON_ERROR_STOP=1`
-- loop, would also block every migration file that runs after this one.
-- Instead: check first, and if duplicates exist, report them with RAISE
-- NOTICE and leave the table unindexed rather than fail loudly mid-deployment
-- or silently delete data.
DO $$
DECLARE
  duplicate_count integer;
  duplicate_keys text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'registered_machines'
      AND indexname = 'registered_machines_machine_key_uk'
  ) THEN
    SELECT count(*), string_agg(duplicated.machine_key, ', ' ORDER BY duplicated.machine_key)
      INTO duplicate_count, duplicate_keys
    FROM (
      SELECT machine_key
      FROM registered_machines
      GROUP BY machine_key
      HAVING count(*) > 1
    ) AS duplicated;

    IF duplicate_count > 0 THEN
      RAISE NOTICE 'registered_machines_machine_key_uk NOT created: % duplicate machine_key value(s) exist: %',
        duplicate_count, duplicate_keys;
    ELSE
      CREATE UNIQUE INDEX registered_machines_machine_key_uk
        ON registered_machines (machine_key);
    END IF;
  END IF;
END
$$;
