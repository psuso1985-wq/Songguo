-- Turn-Based AI mode records a monotonic Issue version only for TURN_BASED_AI Rooms.
-- Standard V3 rooms deliberately retain their existing behavior.
UPDATE discussion_rooms
SET mode = 'STANDARD'
WHERE mode IS NULL;

UPDATE discussion_issues
SET discussion_version = 0
WHERE discussion_version IS NULL;

ALTER TABLE discussion_issues
  ALTER COLUMN discussion_version SET DEFAULT 0;

ALTER TABLE discussion_issues
  ALTER COLUMN discussion_version SET NOT NULL;

CREATE OR REPLACE FUNCTION aisys_require_current_turn_based_generation()
RETURNS trigger
LANGUAGE plpgsql
AS $generation_guard$
DECLARE
  current_version integer;
  room_mode text;
BEGIN
  IF NEW.author_type <> 'AI_ROLE' THEN
    RETURN NEW;
  END IF;

  SELECT issue.discussion_version, room.mode
  INTO current_version, room_mode
  FROM discussion_issues AS issue
  JOIN discussion_rooms AS room ON room.id = issue.room_id
  WHERE issue.id = NEW.issue_id;

  IF room_mode <> 'TURN_BASED_AI'
    OR NEW.generation_base_version IS NULL
    OR NEW.generation_base_version <> current_version THEN
    RAISE EXCEPTION 'Turn-based generation is stale; retry with the latest Discussion Version.'
      USING ERRCODE = '40001';
  END IF;

  RETURN NEW;
END;
$generation_guard$;

DROP TRIGGER IF EXISTS aisys_turn_based_generation_guard ON discussion_messages;
CREATE TRIGGER aisys_turn_based_generation_guard
BEFORE INSERT ON discussion_messages
FOR EACH ROW EXECUTE FUNCTION aisys_require_current_turn_based_generation();

CREATE OR REPLACE FUNCTION aisys_bump_turn_based_discussion_version()
RETURNS trigger
LANGUAGE plpgsql
AS $version_bump$
DECLARE
  target_issue_id bigint;
BEGIN
  IF TG_TABLE_NAME = 'discussion_messages' OR TG_TABLE_NAME = 'discussion_statements' THEN
    target_issue_id := NEW.issue_id;
  ELSE
    SELECT statement_row.issue_id INTO target_issue_id
    FROM discussion_statements AS statement_row
    WHERE statement_row.id = NEW.statement_id;
  END IF;

  UPDATE discussion_issues AS issue
  SET discussion_version = issue.discussion_version + 1
  FROM discussion_rooms AS room
  WHERE issue.id = target_issue_id
    AND room.id = issue.room_id
    AND room.mode = 'TURN_BASED_AI';

  RETURN NEW;
END;
$version_bump$;

DROP TRIGGER IF EXISTS aisys_turn_based_version_messages ON discussion_messages;
CREATE TRIGGER aisys_turn_based_version_messages
AFTER INSERT ON discussion_messages
FOR EACH ROW EXECUTE FUNCTION aisys_bump_turn_based_discussion_version();

DROP TRIGGER IF EXISTS aisys_turn_based_version_statements ON discussion_statements;
CREATE TRIGGER aisys_turn_based_version_statements
AFTER INSERT ON discussion_statements
FOR EACH ROW EXECUTE FUNCTION aisys_bump_turn_based_discussion_version();

DROP TRIGGER IF EXISTS aisys_turn_based_version_evidence ON discussion_evidence;
CREATE TRIGGER aisys_turn_based_version_evidence
AFTER INSERT ON discussion_evidence
FOR EACH ROW EXECUTE FUNCTION aisys_bump_turn_based_discussion_version();

DROP TRIGGER IF EXISTS aisys_turn_based_version_verifications ON discussion_verifications;
CREATE TRIGGER aisys_turn_based_version_verifications
AFTER INSERT ON discussion_verifications
FOR EACH ROW EXECUTE FUNCTION aisys_bump_turn_based_discussion_version();

DROP TRIGGER IF EXISTS aisys_turn_based_version_confirmations ON discussion_confirmations;
CREATE TRIGGER aisys_turn_based_version_confirmations
AFTER INSERT ON discussion_confirmations
FOR EACH ROW EXECUTE FUNCTION aisys_bump_turn_based_discussion_version();

DROP TRIGGER IF EXISTS aisys_turn_based_version_promotions ON discussion_promotions;
CREATE TRIGGER aisys_turn_based_version_promotions
AFTER INSERT ON discussion_promotions
FOR EACH ROW EXECUTE FUNCTION aisys_bump_turn_based_discussion_version();

CREATE UNIQUE INDEX IF NOT EXISTS discussion_ai_invocations_one_running_per_issue_uk
ON discussion_ai_invocations (issue_id)
WHERE status = 'RUNNING';
