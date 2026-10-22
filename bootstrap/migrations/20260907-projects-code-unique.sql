-- NocoBase owns the projects collection and its columns.
-- bootstrap/migrations/20260828-short-codes.mjs declares
-- `indexes: [{ name: 'projects_code_uk', fields: ['code'], unique: true }]`
-- on the projects collection, but a NocoBase `indexes:[...]` entry created
-- through `collections/<name>/fields:create` + `collections/<name>:update` is
-- metadata only -- it never becomes a real PostgreSQL constraint. This is a
-- general property of this NocoBase version's collections API, not specific
-- to any one collection: see bootstrap/diagnose-agents-index.mjs and
-- docs/phase-1-operation.md's "Diagnosing a verify-phase-1 index mismatch"
-- section (verified on a disposable stack, 2026-09-02). Before this file,
-- `project_reports_submitter_idempotency_uk`
-- (20260822-report-idempotency-unique.sql),
-- `discussion_ai_invocations_one_running_per_issue_uk`
-- (20260823-turn-based-ai-discussion-version.sql),
-- `project_stage_events_idempotency_key_uk`
-- (20260902-project-stage-events-idempotency-key-unique.sql) and
-- `registered_machines_machine_key_uk`
-- (20260902-registered-machines-machine-key-unique.sql) were the physical
-- unique indexes with a real PostgreSQL counterpart on this schema.
--
-- web/app/api/agent-projects/route.ts's code-assignment path
-- (project-code-required-autoassign-v1) looks up a candidate `code` with
-- `projects:list?filter[code]=<candidate>` before creating, but that
-- check-then-create is a race between two concurrent creates that both
-- observe no existing row before either inserts (this is exactly what the
-- concurrent-child e2e proves must not silently duplicate a code). The
-- database constraint is what actually holds the guarantee; the route's own
-- lookup only produces the friendly assign/retry/409 response, and retries
-- up to 5 times against the next candidate when this constraint rejects one.
--
-- Unlike every migration above, projects.code is deliberately NOT NOT NULL
-- (bootstrap/migrations/20260828-short-codes.mjs: `allowNull: true` -- every
-- Agent-created Project before project-code-required-autoassign-v1 has no
-- code, and is never backfilled by a migration; assigning one is an Owner
-- decision made through NocoBase, or the one-time backfill the Owner does by
-- hand). A standard PostgreSQL unique index does not apply to NULL values
-- (two, or two thousand, NULL codes coexist under it without conflict), so
-- this is a plain single-column unique index, not a partial one -- no
-- `WHERE code IS NOT NULL` clause is needed for that reason.
--
-- If duplicate non-NULL code values already exist, creating the index
-- outright would abort with an error and, under `schema-guard`'s
-- `ON_ERROR_STOP=1` loop, would also block every migration file that runs
-- after this one. Instead: check first, and if duplicates exist, report them
-- with RAISE NOTICE and leave the table unindexed rather than fail loudly
-- mid-deployment or silently delete data.
DO $$
DECLARE
  duplicate_count integer;
  duplicate_codes text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'projects'
      AND indexname = 'projects_code_uk'
  ) THEN
    SELECT count(*), string_agg(duplicated.code, ', ' ORDER BY duplicated.code)
      INTO duplicate_count, duplicate_codes
    FROM (
      SELECT code
      FROM projects
      WHERE code IS NOT NULL
      GROUP BY code
      HAVING count(*) > 1
    ) AS duplicated;

    IF duplicate_count > 0 THEN
      RAISE NOTICE 'projects_code_uk NOT created: % duplicate code value(s) exist: %',
        duplicate_count, duplicate_codes;
    ELSE
      CREATE UNIQUE INDEX projects_code_uk
        ON projects (code);
    END IF;
  END IF;
END
$$;
