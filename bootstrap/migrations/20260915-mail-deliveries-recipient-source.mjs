// mail_deliveries.recipient_source records whether a delivered address was
// typed by the Owner into a business feature's manual 「由 AIsys 发送」
// override input ('manual'), or came from another source. See
// web/lib/mail/send.ts.
//
// Same idempotent field-add pattern as 20260911-mail-settings.mjs: add any
// field missing from an already-existing collection, then verify every
// field is present.
export async function migrateMailDeliveriesRecipientSource({ request, listMeta }) {
  const deliveriesName = 'mail_deliveries';
  const deliveriesFields = [
    { name: 'recipient_source', type: 'string', interface: 'input', allowNull: true },
  ];
  let actualDeliveries = (await listMeta()).find((c) => c.name === deliveriesName);
  if (!actualDeliveries) throw new Error(`Missing collection ${deliveriesName}`);
  for (const field of deliveriesFields) {
    if (!actualDeliveries?.fields?.some((f) => f.name === field.name)) {
      await request(`collections/${deliveriesName}/fields:create`, { method: 'POST', body: field });
    }
  }
  actualDeliveries = (await listMeta()).find((c) => c.name === deliveriesName);
  for (const field of deliveriesFields) if (!actualDeliveries?.fields?.some((f) => f.name === field.name)) throw new Error(`Missing ${deliveriesName}.${field.name}`);
}
