export const teamMembersMigrationId = '20260828_team_members';

// Generic member metadata; no roster records or contact details are seeded.
const fields = [
  { name: 'id', title: 'ID', type: 'bigInt', interface: 'integer', primaryKey: true, autoIncrement: true, allowNull: false },
  { name: 'createdAt', title: 'Created at', type: 'date', interface: 'createdAt', allowNull: true },
  { name: 'updatedAt', title: 'Updated at', type: 'date', interface: 'updatedAt', allowNull: true },
  { name: 'name', title: 'Name', type: 'string', interface: 'input', allowNull: false },
  { name: 'department', title: 'Department', type: 'string', interface: 'input', allowNull: false },
  { name: 'role_title', title: 'Role title', type: 'string', interface: 'input', allowNull: true },
  { name: 'grade', title: 'Grade', type: 'string', interface: 'input', allowNull: true },
  { name: 'member_type', title: 'Member type', type: 'string', interface: 'select', allowNull: false,
    uiSchema: { type: 'string', title: 'Member type', 'x-component': 'Select', enum: ['EMPLOYEE', 'EXTERNAL_CONTRACTOR'].map((value) => ({ label: value, value })) } },
  { name: 'status', title: 'Status', type: 'string', interface: 'select', allowNull: false,
    uiSchema: { type: 'string', title: 'Status', 'x-component': 'Select', enum: ['ACTIVE', 'TRANSFERRED'].map((value) => ({ label: value, value })) } },
  { name: 'effective_date', title: 'Effective date', type: 'date', interface: 'datetime', allowNull: true, timezone: true },
  { name: 'moved_to', title: 'Moved to', type: 'string', interface: 'input', allowNull: true },
  { name: 'source_note', title: 'Source note', type: 'text', interface: 'textarea', allowNull: true },
  { name: 'sort_order', title: 'Sort order', type: 'integer', interface: 'integer', allowNull: true },
];

export async function migrateTeamMembers({ request, listMeta }) {
  const meta = await listMeta();
  if (!meta.some((item) => item.name === 'team_members')) {
    await request('collections:create', {
      method: 'POST',
      body: {
        name: 'team_members',
        title: 'Team members',
        autoGenId: false,
        fields,
        indexes: [{ name: 'team_members_department_name_uk', fields: ['department', 'name'], unique: true }],
      },
    });
  }
  const created = (await listMeta()).find((item) => item.name === 'team_members');
  const names = new Set((created?.fields || []).map((field) => field.name));
  for (const required of ['name', 'department', 'member_type', 'status', 'sort_order']) {
    if (!names.has(required)) throw new Error(teamMembersMigrationId + ' did not provide team_members.' + required + '.');
  }
}
