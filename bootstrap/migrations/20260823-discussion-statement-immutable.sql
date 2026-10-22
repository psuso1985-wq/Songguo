-- Discussion Statements are append-only decision-chain facts.
-- A changed position must be represented by a new version linked through
-- supersedes_statement_id; the original Statement is never rewritten.
CREATE OR REPLACE FUNCTION aisys_prevent_discussion_statement_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'discussion_statements are immutable; create a superseding Statement instead';
END;
$$;

DROP TRIGGER IF EXISTS discussion_statements_immutable ON discussion_statements;
CREATE TRIGGER discussion_statements_immutable
BEFORE UPDATE ON discussion_statements
FOR EACH ROW
EXECUTE FUNCTION aisys_prevent_discussion_statement_update();
