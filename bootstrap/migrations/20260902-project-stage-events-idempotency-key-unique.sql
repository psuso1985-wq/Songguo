-- NocoBase owns the project_stage_events collection and its columns.
-- bootstrap/migrations/20260902-agent-stage-events.mjs declares
-- `indexes: [{ name: 'project_stage_events_idempotency_key_uk', fields:
-- ['idempotency_key'], unique: true }]` on that collection, but a NocoBase
-- `indexes:[...]` entry created through `collections:create` is metadata
-- only -- it never becomes a real PostgreSQL constraint. This is a general
-- property of this NocoBase version's collections API, not specific to any
-- one collection: see bootstrap/diagnose-agents-index.mjs and
-- docs/phase-1-operation.md's "Diagnosing a verify-phase-1 index mismatch"
-- section (verified on a disposable stack, 2026-09-02). Before this file,
-- `project_reports_submitter_idempotency_uk`
-- (20260822-report-idempotency-unique.sql) and
-- `discussion_ai_invocations_one_running_per_issue_uk`
-- (20260823-turn-based-ai-discussion-version.sql) were the only two unique
-- indexes on this schema with a real physical counterpart.
--
-- web/app/api/agent-stage-events/route.ts's replay lookup
-- (`project_stage_events:list?filter[idempotency_key]=<key>`, route.ts:136)
-- is scoped to idempotency_key ALONE, not per-submitter -- unlike
-- project_reports, where the route scopes by (submitted_by_id,
-- idempotency_key) and the physical index matches that. A Stage Event's
-- idempotency_key is therefore meant to be globally unique, and this index
-- is a single-column index to match, not a composite one.
--
-- Application-level "look up the key, then insert" is a race: two concurrent
-- retries can both observe no existing row before either inserts. The
-- database constraint is what actually holds the guarantee; the route's
-- lookup only produces the friendly 201/replay/409 response.
--
-- project_stage_events.idempotency_key is NOT NULL at the NocoBase field
-- level (agentStageEventFields in 20260902-agent-stage-events.mjs; every
-- caller must supply one, unlike project_reports.idempotency_key), so unlike
-- the report-idempotency guard there is no NULL-exclusion concern here.
--
-- If duplicate idempotency_key values already exist -- which should never
-- happen given the route's own dedup check, but this migration must not
-- assume that check has never had a bug or a manual data fix -- creating the
-- index outright would abort with an error and, under `schema-guard`'s
-- `ON_ERROR_STOP=1` loop, would also block every migration file that runs
-- after this one. Instead: check first, and if duplicates exist, report them
-- with RAISE NOTICE and leave the table unindexed rather than fail loudly
-- mid-deployment or silently delete data.
DO $$
DECLARE
  duplicate_count integer;
  duplicate_keys text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'project_stage_events'
      AND indexname = 'project_stage_events_idempotency_key_uk'
  ) THEN
    SELECT count(*), string_agg(duplicated.idempotency_key, ', ' ORDER BY duplicated.idempotency_key)
      INTO duplicate_count, duplicate_keys
    FROM (
      SELECT idempotency_key
      FROM project_stage_events
      GROUP BY idempotency_key
      HAVING count(*) > 1
    ) AS duplicated;

    IF duplicate_count > 0 THEN
      RAISE NOTICE 'project_stage_events_idempotency_key_uk NOT created: % duplicate idempotency_key value(s) exist: %',
        duplicate_count, duplicate_keys;
    ELSE
      CREATE UNIQUE INDEX project_stage_events_idempotency_key_uk
        ON project_stage_events (idempotency_key);
    END IF;
  END IF;
END
$$;
