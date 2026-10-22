export const skillAuthorMigrationId = '20260901_skill_author';

// Owner's request: a Skill should record which named Agent made it.
//
// `source_project_id` already exists on `skills`, but a Project is not a
// person -- it names what the Skill came out of, not who wrote it. NocoBase's
// own `createdBy` is no substitute either: every Skill row so far was created
// through the same database account, so `createdBy` reads as one identity for
// every Skill regardless of which Agent actually authored it. Neither field
// can answer "which Agent made this."
//
// This relation is additive and nullable, and stays that way: every Skill
// that predates this migration keeps an empty author and is never backfilled.
// Inventing a historical maker for those rows would make the record less
// trustworthy, not more -- nobody registered who wrote them, and guessing one
// now would present a guess as a fact.
export const skillAuthorField = {
  name: 'created_by_agent',
  title: 'Created by agent',
  type: 'belongsTo',
  interface: 'm2o',
  target: 'agents',
  foreignKey: 'created_by_agent_id',
  targetKey: 'id',
  allowNull: true,
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE',
  constraints: true,
};

function getSkills(metadata) {
  const skills = metadata.find((collection) => collection.name === 'skills');
  if (!skills) {
    throw new Error('Cannot apply ' + skillAuthorMigrationId + ': skills collection metadata is missing.');
  }
  return skills;
}

function getField(skills, name) {
  return (skills.fields || []).find((field) => field.name === name);
}

export async function migrateSkillAuthor({ request, listMeta }) {
  let metadata = await listMeta();
  let skills = getSkills(metadata);

  if (!getField(skills, skillAuthorField.name)) {
    await request('collections/skills/fields:create', {
      method: 'POST',
      body: skillAuthorField,
    });
    metadata = await listMeta();
    skills = getSkills(metadata);
  }

  const author = getField(skills, skillAuthorField.name);
  if (
    author?.foreignKey !== skillAuthorField.foreignKey
    || author?.allowNull !== true
    || author?.target !== 'agents'
    || author?.onDelete !== 'SET NULL'
  ) {
    throw new Error(skillAuthorMigrationId + ' did not create the safe skills.created_by_agent relation.');
  }
}
