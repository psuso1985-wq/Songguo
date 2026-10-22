export const shortCodesMigrationId = '20260828_short_codes';

// `id` is an 18-digit snowflake and `project_key` is 24 hex characters. Neither
// can be said out loud or typed from memory, so locating a project means
// reading its full name every time. `code` is the short, stable handle a person
// actually uses: P01, its sub-projects P01-1, its tasks P01-T1.
//
// It is stored rather than derived from row order, because a derived number
// would change the moment anything is created or archived ahead of it -- and a
// handle that moves is worse than none at all.
const codeField = {
  name: 'code', title: 'Short code', type: 'string', interface: 'input', allowNull: true,
};

async function ensureField({ request, listMeta }, collection, index) {
  const before = (await listMeta()).find((item) => item.name === collection);
  if (!before) throw new Error(shortCodesMigrationId + ' requires the ' + collection + ' collection.');
  if (!(before.fields || []).some((field) => field.name === codeField.name)) {
    await request('collections/' + collection + '/fields:create', { method: 'POST', body: codeField });
    if (index) {
      // A duplicate handle defeats the whole point, so projects enforce it.
      // Tasks do not: their codes are unique within a project by construction.
      await request('collections/' + collection + ':update', {
        method: 'POST',
        query: { filterByTk: collection },
        body: { indexes: [...(before.indexes || []), { name: index, fields: ['code'], unique: true }] },
      }).catch(() => undefined);
    }
  }
  const after = (await listMeta()).find((item) => item.name === collection);
  if (!(after?.fields || []).some((field) => field.name === codeField.name)) {
    throw new Error(shortCodesMigrationId + ' did not provide ' + collection + '.code.');
  }
}

export async function migrateShortCodes(context) {
  await ensureField(context, 'projects', 'projects_code_uk');
  await ensureField(context, 'work_tasks', null);
}
