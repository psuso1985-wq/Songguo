-- NocoBase owns these six early Collections' columns and metadata (agents,
-- projects, skills, project_members, project_reports, agent_skills). This
-- narrow PostgreSQL guard adds the physical NOT NULL constraint for exactly
-- the columns phase-1.schema.json declares required and
-- bootstrap/reconcile-early-metadata.mjs's `targetFields` reconciles in
-- NocoBase's own field metadata.
--
-- bootstrap/reconcile-early-metadata.mjs writes NocoBase's metadata, but --
-- consistent with what bootstrap/diagnose-agents-index.mjs already found for
-- declared unique indexes ("NocoBase says unique: true is not proof
-- PostgreSQL enforces it") -- NocoBase's own metadata is not proof PostgreSQL
-- enforces anything either. This file is the physical enforcement, applied
-- through the existing `schema-guard` Compose profile, same as every other
-- .sql file in this directory.
--
-- Every column is guarded by its own null-count check rather than assumed
-- clean: this repository has no backfill policy for legacy data (see every
-- "must stay nullable for existing ..." comment in
-- bootstrap/verify-phase-1.mjs), so a column phase-1.schema.json calls
-- required can still hold pre-existing null rows on some environment this
-- file was never specifically audited against. Where that is true, SET NOT
-- NULL is skipped and a NOTICE names the column and the row count instead of
-- aborting the whole schema-guard run over one column -- this file is safe
-- to apply blind, without bootstrap/reconcile-early-metadata.mjs having
-- checked first. Re-running this file after it already applied is a
-- harmless no-op: PostgreSQL accepts SET NOT NULL on an already-NOT-NULL
-- column without error.

DO $$
BEGIN
  IF (SELECT count(*) FROM agents WHERE agent_key IS NULL) = 0 THEN
    ALTER TABLE agents ALTER COLUMN agent_key SET NOT NULL;
  ELSE
    RAISE NOTICE 'agents.agent_key: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM agents WHERE agent_key IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM agents WHERE name IS NULL) = 0 THEN
    ALTER TABLE agents ALTER COLUMN name SET NOT NULL;
  ELSE
    RAISE NOTICE 'agents.name: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM agents WHERE name IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM agents WHERE platform IS NULL) = 0 THEN
    ALTER TABLE agents ALTER COLUMN platform SET NOT NULL;
  ELSE
    RAISE NOTICE 'agents.platform: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM agents WHERE platform IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM agents WHERE agent_type IS NULL) = 0 THEN
    ALTER TABLE agents ALTER COLUMN agent_type SET NOT NULL;
  ELSE
    RAISE NOTICE 'agents.agent_type: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM agents WHERE agent_type IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM agents WHERE status IS NULL) = 0 THEN
    ALTER TABLE agents ALTER COLUMN status SET NOT NULL;
  ELSE
    RAISE NOTICE 'agents.status: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM agents WHERE status IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM agents WHERE responsibilities IS NULL) = 0 THEN
    ALTER TABLE agents ALTER COLUMN responsibilities SET NOT NULL;
  ELSE
    RAISE NOTICE 'agents.responsibilities: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM agents WHERE responsibilities IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM projects WHERE project_key IS NULL) = 0 THEN
    ALTER TABLE projects ALTER COLUMN project_key SET NOT NULL;
  ELSE
    RAISE NOTICE 'projects.project_key: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM projects WHERE project_key IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM projects WHERE name IS NULL) = 0 THEN
    ALTER TABLE projects ALTER COLUMN name SET NOT NULL;
  ELSE
    RAISE NOTICE 'projects.name: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM projects WHERE name IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM projects WHERE status IS NULL) = 0 THEN
    ALTER TABLE projects ALTER COLUMN status SET NOT NULL;
  ELSE
    RAISE NOTICE 'projects.status: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM projects WHERE status IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM projects WHERE current_summary IS NULL) = 0 THEN
    ALTER TABLE projects ALTER COLUMN current_summary SET NOT NULL;
  ELSE
    RAISE NOTICE 'projects.current_summary: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM projects WHERE current_summary IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM skills WHERE skill_key IS NULL) = 0 THEN
    ALTER TABLE skills ALTER COLUMN skill_key SET NOT NULL;
  ELSE
    RAISE NOTICE 'skills.skill_key: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM skills WHERE skill_key IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM skills WHERE name IS NULL) = 0 THEN
    ALTER TABLE skills ALTER COLUMN name SET NOT NULL;
  ELSE
    RAISE NOTICE 'skills.name: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM skills WHERE name IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM skills WHERE description IS NULL) = 0 THEN
    ALTER TABLE skills ALTER COLUMN description SET NOT NULL;
  ELSE
    RAISE NOTICE 'skills.description: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM skills WHERE description IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM skills WHERE locator IS NULL) = 0 THEN
    ALTER TABLE skills ALTER COLUMN locator SET NOT NULL;
  ELSE
    RAISE NOTICE 'skills.locator: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM skills WHERE locator IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM skills WHERE status IS NULL) = 0 THEN
    ALTER TABLE skills ALTER COLUMN status SET NOT NULL;
  ELSE
    RAISE NOTICE 'skills.status: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM skills WHERE status IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM project_members WHERE member_role IS NULL) = 0 THEN
    ALTER TABLE project_members ALTER COLUMN member_role SET NOT NULL;
  ELSE
    RAISE NOTICE 'project_members.member_role: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM project_members WHERE member_role IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM project_reports WHERE report_type IS NULL) = 0 THEN
    ALTER TABLE project_reports ALTER COLUMN report_type SET NOT NULL;
  ELSE
    RAISE NOTICE 'project_reports.report_type: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM project_reports WHERE report_type IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM project_reports WHERE summary IS NULL) = 0 THEN
    ALTER TABLE project_reports ALTER COLUMN summary SET NOT NULL;
  ELSE
    RAISE NOTICE 'project_reports.summary: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM project_reports WHERE summary IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM agent_skills WHERE relationship_type IS NULL) = 0 THEN
    ALTER TABLE agent_skills ALTER COLUMN relationship_type SET NOT NULL;
  ELSE
    RAISE NOTICE 'agent_skills.relationship_type: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM agent_skills WHERE relationship_type IS NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM agent_skills WHERE status IS NULL) = 0 THEN
    ALTER TABLE agent_skills ALTER COLUMN status SET NOT NULL;
  ELSE
    RAISE NOTICE 'agent_skills.status: % null row(s) present, NOT NULL not applied.', (SELECT count(*) FROM agent_skills WHERE status IS NULL);
  END IF;
END
$$;
