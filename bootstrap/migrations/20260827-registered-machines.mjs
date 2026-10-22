export const registeredMachinesMigrationId = '20260827_registered_machines';

const fields = [
  { name: 'id', title: 'ID', type: 'bigInt', interface: 'integer', primaryKey: true, autoIncrement: true, allowNull: false },
  { name: 'createdAt', title: 'Created at', type: 'date', interface: 'createdAt', allowNull: true },
  { name: 'updatedAt', title: 'Updated at', type: 'date', interface: 'updatedAt', allowNull: true },
  { name: 'machine_key', title: 'Machine key', type: 'string', interface: 'input', allowNull: false },
  { name: 'display_name', title: 'Display name', type: 'string', interface: 'input', allowNull: false },
  { name: 'hostname', title: 'Hostname metadata', type: 'string', interface: 'input', allowNull: true },
  { name: 'platform', title: 'Platform metadata', type: 'string', interface: 'input', allowNull: true },
  { name: 'status', title: 'Status', type: 'string', interface: 'select', allowNull: false,
    uiSchema: { type: 'string', title: 'Status', 'x-component': 'Select', enum: ['PENDING', 'ACTIVE', 'REVOKED'].map((value) => ({ label: value, value })) } },
  { name: 'machine_token_hash', title: 'Machine credential verifier', type: 'string', interface: 'input', allowNull: true },
  { name: 'enrollment_code_hash', title: 'Enrollment code verifier', type: 'string', interface: 'input', allowNull: true },
  { name: 'enrollment_expires_at', title: 'Enrollment expires at', type: 'date', interface: 'datetime', allowNull: true, timezone: true },
  { name: 'activated_at', title: 'Activated at', type: 'date', interface: 'datetime', allowNull: true, timezone: true },
  { name: 'last_seen_at', title: 'Last seen at', type: 'date', interface: 'datetime', allowNull: true, timezone: true },
];

export async function migrateRegisteredMachines({ request, listMeta }) {
  const meta = await listMeta();
  if (!meta.some((item) => item.name === 'registered_machines')) {
    await request('collections:create', {
      method: 'POST',
      body: {
        name: 'registered_machines',
        title: 'Registered machines',
        autoGenId: false,
        fields,
        indexes: [{ name: 'registered_machines_machine_key_uk', fields: ['machine_key'], unique: true }],
      },
    });
  }
  const created = (await listMeta()).find((item) => item.name === 'registered_machines');
  const names = new Set((created?.fields || []).map((field) => field.name));
  for (const required of ['machine_key', 'status', 'machine_token_hash', 'enrollment_code_hash', 'enrollment_expires_at']) {
    if (!names.has(required)) throw new Error(registeredMachinesMigrationId + ' did not provide registered_machines.' + required + '.');
  }
}