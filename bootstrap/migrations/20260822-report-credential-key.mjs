export const reportCredentialKeyMigrationId = '20260822_report_credential_key';

// Records which stored credential produced a Report.
//
// `submitted_by` and `submitted_at` already answer "which Agent" and "when".
// This answers the question neither can -- which credential -- which is what
// makes it possible to scope the blast radius of a leaked credential to
// specific Reports rather than to an Agent's entire history.
//
// Nullable on purpose: Reports written through the legacy environment-variable
// path, including every Report that already exists, genuinely had no credential
// row. Recording null is accurate; backfilling a synthetic value would invent a
// fact that never happened.
export const credentialKeyField = {
  name: 'credential_key',
  title: 'Credential key',
  type: 'string',
  interface: 'input',
  allowNull: true,
};

function findCollection(metadata, name) {
  const collection = metadata.find((item) => item.name === name);
  if (!collection) throw new Error('Cannot apply ' + reportCredentialKeyMigrationId + ': ' + name + ' collection metadata is missing.');
  return collection;
}

function findField(collection, name) {
  return (collection.fields || []).find((field) => field.name === name);
}

export async function migrateReportCredentialKey({ request, listMeta }) {
  const reports = findCollection(await listMeta(), 'project_reports');
  if (!findField(reports, credentialKeyField.name)) {
    await request('collections/project_reports/fields:create', {
      method: 'POST',
      body: credentialKeyField,
    });
  }

  const verified = findField(findCollection(await listMeta(), 'project_reports'), credentialKeyField.name);
  if (!verified) {
    throw new Error(reportCredentialKeyMigrationId + ' did not create project_reports.credential_key.');
  }
  if (verified.allowNull !== true) {
    throw new Error(
      reportCredentialKeyMigrationId + ' created project_reports.credential_key without nullability;'
      + ' Reports written through the environment path have no credential and must store null.',
    );
  }
}
