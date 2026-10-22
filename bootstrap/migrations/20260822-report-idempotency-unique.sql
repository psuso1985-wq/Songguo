-- NocoBase owns the project_reports collection, its columns and relations.
-- This narrow PostgreSQL guard adds only the uniqueness that makes Agent
-- Report idempotency correct under concurrency.
--
-- Application-level "look up the key, then insert" is a race: two concurrent
-- retries can both observe no existing row before either inserts. The database
-- constraint is what actually holds the guarantee; the route's lookup only
-- produces the friendly 200/409 response.
--
-- Uniqueness is scoped per submitting Agent, not global: two Agents may
-- independently generate the same key string for unrelated facts.
--
-- Rows with a NULL idempotency_key are unconstrained, because in PostgreSQL
-- NULL is never equal to NULL. Callers that send no key -- including every
-- Report written before this constraint existed -- keep working unchanged.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'project_reports'
      AND indexname = 'project_reports_submitter_idempotency_uk'
  ) THEN
    CREATE UNIQUE INDEX project_reports_submitter_idempotency_uk
      ON project_reports (submitted_by_id, idempotency_key);
  END IF;
END
$$;
