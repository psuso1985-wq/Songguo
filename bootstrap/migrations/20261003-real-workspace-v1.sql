-- Append-only result history: one decision and one successor per submitted
-- version. Nullable legacy rows are unaffected. Decision is authoritative;
-- task review state is derived from this ledger rather than dual-written.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_operation_uk
  ON project_reports (workspace_id, operation_key)
  WHERE workspace_id IS NOT NULL AND operation_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_review_uk
  ON project_reports (workspace_id, reviewed_report_id)
  WHERE workspace_id IS NOT NULL AND reviewed_report_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_revision_uk
  ON project_reports (workspace_id, supplements_report_id)
  WHERE workspace_id IS NOT NULL AND supplements_report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS workspace_reports_scope_idx ON project_reports (workspace_id, project_id, task_id);
CREATE INDEX IF NOT EXISTS workspace_tasks_scope_idx ON work_tasks (workspace_id, project_id);
CREATE INDEX IF NOT EXISTS workspace_agents_scope_idx ON agents (workspace_id);
CREATE INDEX IF NOT EXISTS workspace_projects_scope_idx ON projects (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_key_uk ON workspaces (workspace_key);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_member_uk ON workspace_members (workspace_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitation_token_uk ON workspace_invitations (token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_project_user_uk ON project_user_members (project_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_project_agent_uk ON project_members (workspace_id, project_id, agent_id) WHERE workspace_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_initial_result_uk ON project_reports (workspace_id, task_id) WHERE workspace_id IS NOT NULL AND task_id IS NOT NULL AND report_type = 'PROGRESS';
CREATE UNIQUE INDEX IF NOT EXISTS workspace_event_key_uk ON workspace_events (workspace_id, event_key);
CREATE INDEX IF NOT EXISTS workspace_events_project_idx ON workspace_events (workspace_id, project_id, occurred_at);

CREATE OR REPLACE FUNCTION songguo_workspace_event_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Workspace events are immutable';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS songguo_workspace_event_immutable ON workspace_events;
CREATE TRIGGER songguo_workspace_event_immutable BEFORE UPDATE OR DELETE ON workspace_events FOR EACH ROW EXECUTE FUNCTION songguo_workspace_event_immutable();

CREATE OR REPLACE FUNCTION songguo_workspace_report_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.workspace_id IS NOT NULL THEN RAISE EXCEPTION 'Workspace reports are immutable'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS songguo_workspace_report_immutable ON project_reports;
CREATE TRIGGER songguo_workspace_report_immutable BEFORE UPDATE OR DELETE ON project_reports FOR EACH ROW EXECUTE FUNCTION songguo_workspace_report_immutable();

-- Project state is an append-only PROJECT_EVENT; serialize task creation and
-- explicit completion on the existing Project row. A task accepted by another
-- request cannot implicitly finish a Project.
CREATE OR REPLACE FUNCTION songguo_workspace_project_guard() RETURNS trigger AS $$
DECLARE latest_status text; open_tasks bigint;
BEGIN
  IF NEW.workspace_id IS NULL OR NEW.project_id IS NULL THEN RETURN NEW; END IF;
  PERFORM id FROM projects WHERE id = NEW.project_id AND workspace_id = NEW.workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace project mismatch'; END IF;
  SELECT structured->>'status' INTO latest_status FROM project_reports
    WHERE project_id = NEW.project_id AND workspace_id = NEW.workspace_id AND report_type = 'PROJECT_EVENT'
    ORDER BY id DESC LIMIT 1;
  IF TG_TABLE_NAME = 'work_tasks' AND latest_status = 'COMPLETED' THEN RAISE EXCEPTION 'Project is completed'; END IF;
  IF TG_TABLE_NAME = 'project_reports' THEN
   IF NEW.report_type = 'PROJECT_EVENT' AND NEW.structured->>'status' = 'COMPLETED' THEN
    SELECT count(*) INTO open_tasks FROM work_tasks t
    WHERE t.workspace_id = NEW.workspace_id AND t.project_id = NEW.project_id AND NOT EXISTS (
      SELECT 1 FROM project_reports decision WHERE decision.workspace_id = t.workspace_id AND decision.task_id = t.id
      AND decision.report_type = 'DECISION' AND decision.decision_outcome = 'ACCEPT'
      AND decision.reviewed_report_id = (SELECT id FROM project_reports r WHERE r.task_id = t.id AND r.workspace_id = t.workspace_id AND r.report_type IN ('PROGRESS', 'CORRECTION') ORDER BY id DESC LIMIT 1)
    );
    IF open_tasks > 0 OR NOT EXISTS (SELECT 1 FROM work_tasks WHERE project_id = NEW.project_id AND workspace_id = NEW.workspace_id) THEN RAISE EXCEPTION 'Project has unaccepted work'; END IF;
  END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS songguo_workspace_task_project_guard ON work_tasks;
CREATE TRIGGER songguo_workspace_task_project_guard BEFORE INSERT ON work_tasks FOR EACH ROW EXECUTE FUNCTION songguo_workspace_project_guard();
DROP TRIGGER IF EXISTS songguo_workspace_report_project_guard ON project_reports;
CREATE TRIGGER songguo_workspace_report_project_guard BEFORE INSERT ON project_reports FOR EACH ROW EXECUTE FUNCTION songguo_workspace_project_guard();
