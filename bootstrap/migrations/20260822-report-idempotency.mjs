export const reportIdempotencyMigrationId = '20260822_report_idempotency';

export const idempotencyKeyField = {
  name: 'idempotency_key',
  title: 'Idempotency key',
  type: 'string',
  interface: 'input',
  allowNull: true,
};

export const requestFingerprintField = {
  name: 'request_fingerprint',
  title: 'Request fingerprint',
  type: 'string',
  interface: 'input',
  allowNull: true,
};

const addedFields = [idempotencyKeyField, requestFingerprintField];

function findCollection(metadata, name) {
  const collection = metadata.find((item) => item.name === name);
  if (!collection) throw new Error('Cannot apply ' + reportIdempotencyMigrationId + ': ' + name + ' collection metadata is missing.');
  return collection;
}

function findField(collection, name) {
  return (collection.fields || []).find((field) => field.name === name);
}

export async function migrateReportIdempotency({ request, listMeta }) {
  let metadata = await listMeta();
  let reports = findCollection(metadata, 'project_reports');

  for (const field of addedFields) {
    if (!findField(reports, field.name)) {
      await request('collections/project_reports/fields:create', {
        method: 'POST',
        body: field,
      });
      metadata = await listMeta();
      reports = findCollection(metadata, 'project_reports');
    }
  }

  const verified = findCollection(await listMeta(), 'project_reports');
  for (const field of addedFields) {
    const actual = findField(verified, field.name);
    if (!actual) {
      throw new Error(reportIdempotencyMigrationId + ' did not create project_reports.' + field.name + '.');
    }
    if (actual.allowNull !== true) {
      throw new Error(
        reportIdempotencyMigrationId + ' created project_reports.' + field.name
        + ' without nullability; existing Reports and callers that send no key require null.',
      );
    }
  }
}
