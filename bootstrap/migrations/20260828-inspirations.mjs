export const inspirationsMigrationId = '20260828_inspirations';

// An inspiration is the holding pen before a Request: an idea worth keeping,
// but not yet a decision to build anything. The two fields the legacy pool
// lacked are `status` and `promoted_project_id` -- without them nothing ever
// leaves the pool, and a capture list nobody closes out becomes a graveyard.
const fields = [
  { name: 'id', title: 'ID', type: 'bigInt', interface: 'integer', primaryKey: true, autoIncrement: true, allowNull: false },
  { name: 'createdAt', title: 'Created at', type: 'date', interface: 'createdAt', allowNull: true },
  { name: 'updatedAt', title: 'Updated at', type: 'date', interface: 'updatedAt', allowNull: true },
  { name: 'title', title: 'Title', type: 'string', interface: 'input', allowNull: false },
  { name: 'source', title: 'Source', type: 'string', interface: 'select', allowNull: false,
    uiSchema: { type: 'string', title: 'Source', 'x-component': 'Select', enum: ['MANUAL', 'MAIL', 'TODO', 'AI_DIALOGUE', 'FILE', 'OTHER'].map((value) => ({ label: value, value })) } },
  { name: 'content', title: 'Content', type: 'text', interface: 'textarea', allowNull: true },
  { name: 'conversation', title: 'Conversation record', type: 'text', interface: 'textarea', allowNull: true },
  { name: 'status', title: 'Status', type: 'string', interface: 'select', allowNull: false,
    uiSchema: { type: 'string', title: 'Status', 'x-component': 'Select', enum: ['OPEN', 'PROMOTED', 'DROPPED'].map((value) => ({ label: value, value })) } },
  { name: 'captured_at', title: 'Captured at', type: 'date', interface: 'datetime', allowNull: true, timezone: true },
  { name: 'promoted_project_id', title: 'Promoted project ID', type: 'bigInt', interface: 'integer', allowNull: true },
  { name: 'promoted_project', title: 'Promoted project', type: 'belongsTo', interface: 'm2o',
    target: 'projects', foreignKey: 'promoted_project_id', targetKey: 'id', allowNull: true },
];

export async function migrateInspirations({ request, listMeta }) {
  const meta = await listMeta();
  if (!meta.some((item) => item.name === 'inspirations')) {
    await request('collections:create', {
      method: 'POST',
      body: { name: 'inspirations', title: 'Inspirations', autoGenId: false, fields },
    });
  }
  const created = (await listMeta()).find((item) => item.name === 'inspirations');
  const names = new Set((created?.fields || []).map((field) => field.name));
  for (const required of ['title', 'source', 'status', 'captured_at', 'promoted_project_id']) {
    if (!names.has(required)) throw new Error(inspirationsMigrationId + ' did not provide inspirations.' + required + '.');
  }
}
