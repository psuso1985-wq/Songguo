-- NocoBase owns the projects collection and parent_project_id relation.
-- This narrow PostgreSQL guard only rejects a row referencing itself.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_parent_project_not_self_ck'
      AND conrelid = 'projects'::regclass
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_parent_project_not_self_ck
      CHECK (parent_project_id IS NULL OR parent_project_id <> id);
  END IF;
END
$$;
