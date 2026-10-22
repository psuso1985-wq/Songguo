export const projectWaitingSinceMigrationId = '20260822_project_waiting_since';

// When a Project started waiting on a human decision.
//
// This deliberately replaces only the useful part of the legacy `waitingFor`
// object. That field mixed three different things -- who is being waited on,
// what was asked, and why -- into one blob. The durable, answerable question is
// "how long has this been sitting with the Owner", and that needs one timestamp.
//
// It is not a due date, an SLA, or a reminder. It records when waiting began;
// the duration is derived at read time.
//
// Nullable: a Project that is not waiting has no such moment, and inventing one
// would fabricate a fact.
export const waitingSinceField = {
  name: 'waiting_since',
  title: 'Waiting since',
  type: 'date',
  interface: 'datetime',
  allowNull: true,
  timezone: true,
};

function findCollection(metadata, name) {
  const collection = metadata.find((item) => item.name === name);
  if (!collection) throw new Error('Cannot apply ' + projectWaitingSinceMigrationId + ': ' + name + ' collection metadata is missing.');
  return collection;
}

function findField(collection, name) {
  return (collection.fields || []).find((field) => field.name === name);
}

export async function migrateProjectWaitingSince({ request, listMeta }) {
  const projects = findCollection(await listMeta(), 'projects');
  if (!findField(projects, waitingSinceField.name)) {
    await request('collections/projects/fields:create', {
      method: 'POST',
      body: waitingSinceField,
    });
  }

  const verified = findField(findCollection(await listMeta(), 'projects'), waitingSinceField.name);
  if (!verified) {
    throw new Error(projectWaitingSinceMigrationId + ' did not create projects.waiting_since.');
  }
  if (
    verified.type !== 'date'
    || verified.interface !== 'datetime'
    || verified.allowNull !== true
    || verified.timezone !== true
  ) {
    throw new Error(
      projectWaitingSinceMigrationId + ' created projects.waiting_since with the wrong metadata;'
      + ' it must be a nullable timezone-aware datetime.',
    );
  }
}
