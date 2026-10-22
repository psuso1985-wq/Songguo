-- Read-only verification of required physical unique indexes.
-- Backend metadata alone does not establish PostgreSQL enforcement.
-- Run after migrations using the standalone schema-guard service.
DO $$
DECLARE
  missing text[] := ARRAY[]::text[];
  expectation record;
BEGIN
  FOR expectation IN
    SELECT * FROM (VALUES
      ('project_reports_submitter_idempotency_uk', 'project_reports'),
      ('discussion_ai_invocations_one_running_per_issue_uk', 'discussion_ai_invocations'),
      ('project_stage_events_idempotency_key_uk', 'project_stage_events'),
      ('registered_machines_machine_key_uk', 'registered_machines'),
      ('projects_code_uk', 'projects'),
      ('workspace_operation_uk', 'project_reports'),
      ('workspace_review_uk', 'project_reports'),
      ('workspace_revision_uk', 'project_reports'),
      ('workspace_initial_result_uk', 'project_reports'),
      ('workspace_key_uk', 'workspaces'),
      ('workspace_member_uk', 'workspace_members'),
      ('workspace_invitation_token_uk', 'workspace_invitations'),
      ('workspace_project_user_uk', 'project_user_members'),
      ('workspace_project_agent_uk', 'project_members')
    ) AS expected(indexname, tablename)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = expectation.tablename
        AND indexname = expectation.indexname
    ) THEN
      missing := missing || (expectation.indexname || ' on ' || expectation.tablename);
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'Missing physical unique index(es): %. See the corresponding bootstrap/migrations/*.sql file -- if it reported duplicate values via RAISE NOTICE instead of creating the index, that duplicate data must be resolved before physical enforcement exists.',
      array_to_string(missing, ', ');
  END IF;

  RAISE NOTICE 'verify-physical-indexes: all % expected physical unique index(es) are present.', 14;
END
$$;
