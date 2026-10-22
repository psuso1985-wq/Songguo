export const reportAttachmentsMigrationId = '20260827_report_attachments';

// Lets a progress entry carry the files it produced.
//
// `deliverable_references` already records where an output lives, but it is
// text: it can name a locator, it cannot hold the file. An Agent that produces
// evidence has nowhere in AIsys to put it, so the evidence lives outside and
// the entry points at something the reader may not be able to open.
//
// This is a relation to NocoBase's own `attachments` collection rather than a
// new store: file storage already exists and is configured, so adding one is
// how a second, competing store gets created.
//
// Nothing existing changes. The field is additive and every current Report
// simply has no attachments, which is accurate — they were written before a
// Report could carry one.
export const reportAttachmentsField = {
  name: 'attachments',
  title: 'Attachments',
  interface: 'attachment',
  type: 'belongsToMany',
  target: 'attachments',
  through: 'project_report_attachments',
  foreignKey: 'project_report_id',
  otherKey: 'attachment_id',
  sourceKey: 'id',
  targetKey: 'id',
};

function findCollection(metadata, name) {
  const collection = metadata.find((item) => item.name === name);
  if (!collection) throw new Error('Cannot apply ' + reportAttachmentsMigrationId + ': ' + name + ' collection metadata is missing.');
  return collection;
}

function findField(collection, name) {
  return (collection.fields || []).find((field) => field.name === name);
}

export async function migrateReportAttachments({ request, listMeta }) {
  // `attachments` is a NocoBase system collection, so it never appears in
  // collections:listMeta. Probing its data endpoint is the check that actually
  // proves the target exists before a relation is pointed at it.
  try {
    await request('attachments:list', { query: { pageSize: '1' } });
  } catch (error) {
    throw new Error(
      'Cannot apply ' + reportAttachmentsMigrationId + ': the attachments collection is unavailable ('
      + (error instanceof Error ? error.message : String(error)) + ').',
    );
  }

  const reports = findCollection(await listMeta(), 'project_reports');

  if (!findField(reports, reportAttachmentsField.name)) {
    await request('collections/project_reports/fields:create', {
      method: 'POST',
      body: reportAttachmentsField,
    });
  }

  const verified = findField(findCollection(await listMeta(), 'project_reports'), reportAttachmentsField.name);
  if (!verified) {
    throw new Error(reportAttachmentsMigrationId + ' did not create project_reports.attachments.');
  }
  if (verified.target !== 'attachments') {
    throw new Error(
      reportAttachmentsMigrationId + ' created project_reports.attachments against ' + String(verified.target)
      + ' instead of the existing attachments collection; a second file store must not be introduced.',
    );
  }
}
