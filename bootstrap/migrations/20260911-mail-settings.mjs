// mail-settings-page-v1. Two new Collections for the Owner-managed mail
// configuration page and any business feature's "由 AIsys 发送" flow:
//
// - mail_settings: a single row (id=1). The SMTP password is never stored in
//   the clear -- password_encrypted holds an AES-256-GCM ciphertext produced
//   by web/lib/mail/crypto.ts using the server-only AISYS_SETTINGS_KEY. No
//   API ever returns password_encrypted's plaintext; see docs/mail-settings.md.
// - mail_deliveries: one row per attempted send (TEST send from the settings
//   page, or a real business-feature send), used for the daily send-limit
//   count and the "最近发送记录" / "已发送 N 封" readbacks.
export async function migrateMailSettings({ request, listMeta }) {
  const settingsName = 'mail_settings';
  const settingsFields = [
    { name: 'id', type: 'bigInt', interface: 'integer', primaryKey: true, autoIncrement: false, allowNull: false },
    { name: 'host', type: 'string', interface: 'input', allowNull: false },
    { name: 'port', type: 'integer', interface: 'integer', allowNull: false },
    { name: 'starttls', type: 'boolean', interface: 'checkbox', allowNull: false, defaultValue: true },
    { name: 'username', type: 'string', interface: 'input', allowNull: true },
    { name: 'password_encrypted', type: 'text', interface: 'textarea', allowNull: true },
    { name: 'from_address', type: 'string', interface: 'input', allowNull: false },
    { name: 'default_cc', type: 'string', interface: 'input', allowNull: true },
    { name: 'daily_limit', type: 'integer', interface: 'integer', allowNull: false, defaultValue: 50 },
    { name: 'tls_insecure', type: 'boolean', interface: 'checkbox', allowNull: false, defaultValue: false },
    { name: 'updated_at', type: 'date', interface: 'datetime', allowNull: true },
    { name: 'updated_by', type: 'string', interface: 'input', allowNull: true },
  ];
  if (!(await listMeta()).some((c) => c.name === settingsName)) {
    await request('collections:create', { method: 'POST', body: { name: settingsName, title: 'Mail settings', autoGenId: false, fields: settingsFields, indexes: [] } });
  }
  let actualSettings = (await listMeta()).find((c) => c.name === settingsName);
  for (const field of settingsFields) {
    if (!actualSettings?.fields?.some((f) => f.name === field.name)) {
      await request(`collections/${settingsName}/fields:create`, { method: 'POST', body: field });
    }
  }
  actualSettings = (await listMeta()).find((c) => c.name === settingsName);
  for (const field of settingsFields) if (!actualSettings?.fields?.some((f) => f.name === field.name)) throw new Error(`Missing ${settingsName}.${field.name}`);

  const deliveriesName = 'mail_deliveries';
  const deliveriesFields = [
    { name: 'id', type: 'bigInt', interface: 'integer', primaryKey: true, autoIncrement: true, allowNull: false },
    { name: 'created_at', type: 'date', interface: 'datetime', allowNull: false },
    { name: 'source', type: 'string', interface: 'input', allowNull: false },
    { name: 'batch_id', type: 'string', interface: 'input', allowNull: true },
    { name: 'recipient', type: 'string', interface: 'input', allowNull: false },
    { name: 'cc', type: 'string', interface: 'input', allowNull: true },
    { name: 'subject', type: 'string', interface: 'input', allowNull: false },
    { name: 'status', type: 'string', interface: 'input', allowNull: false },
    { name: 'error', type: 'text', interface: 'textarea', allowNull: true },
    { name: 'message_id', type: 'string', interface: 'input', allowNull: true },
  ];
  if (!(await listMeta()).some((c) => c.name === deliveriesName)) {
    await request('collections:create', { method: 'POST', body: { name: deliveriesName, title: 'Mail deliveries', autoGenId: false, fields: deliveriesFields, indexes: [] } });
  }
  const actualDeliveries = (await listMeta()).find((c) => c.name === deliveriesName);
  for (const field of deliveriesFields) if (!actualDeliveries?.fields?.some((f) => f.name === field.name)) throw new Error(`Missing ${deliveriesName}.${field.name}`);
}
