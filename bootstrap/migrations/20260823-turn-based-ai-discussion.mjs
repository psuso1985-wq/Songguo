export const turnBasedDiscussionMigrationId = '20260823_turn_based_ai_discussion';

const roomModes = ['STANDARD', 'TURN_BASED_AI'];
const authorTypes = ['OWNER', 'AGENT', 'TEST', 'AI_ROLE'];

const roomModeField = {
  name: 'mode',
  title: 'Mode',
  type: 'string',
  interface: 'select',
  allowNull: false,
  defaultValue: 'STANDARD',
  uiSchema: {
    type: 'string',
    title: 'Mode',
    'x-component': 'Select',
    enum: roomModes.map((value) => ({ label: value, value })),
  },
};

const issueVersionField = {
  name: 'discussion_version',
  title: 'Discussion version',
  type: 'integer',
  interface: 'integer',
  allowNull: false,
  defaultValue: 0,
};

const messageBaseVersionField = {
  name: 'generation_base_version',
  title: 'Generation base version',
  type: 'integer',
  interface: 'integer',
  allowNull: true,
};

const messageAuthorRoleField = {
  name: 'author_role',
  title: 'Author AI Role',
  type: 'belongsTo',
  interface: 'm2o',
  target: 'discussion_ai_roles',
  foreignKey: 'author_role_id',
  targetKey: 'id',
  allowNull: true,
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE',
  constraints: true,
};

function collection(metadata, name) {
  const found = metadata.find((item) => item.name === name);
  if (!found) throw new Error('Cannot apply ' + turnBasedDiscussionMigrationId + ': missing ' + name + '.');
  return found;
}
function field(parent, name) {
  return (parent.fields || []).find((item) => item.name === name);
}
function values(input) {
  return (input?.uiSchema?.enum || []).map((item) => item.value);
}
async function ensureField(request, collectionName, definition, listMeta) {
  const current = collection(await listMeta(), collectionName);
  if (!field(current, definition.name)) {
    await request('collections/' + collectionName + '/fields:create', { method: 'POST', body: definition });
  }
}

export async function migrateTurnBasedDiscussion({ request, listMeta }) {
  await ensureField(request, 'discussion_rooms', roomModeField, listMeta);
  await ensureField(request, 'discussion_issues', issueVersionField, listMeta);
  await ensureField(request, 'discussion_messages', messageBaseVersionField, listMeta);
  await ensureField(request, 'discussion_messages', messageAuthorRoleField, listMeta);

  let metadata = await listMeta();
  const rooms = collection(metadata, 'discussion_rooms');
  const messages = collection(metadata, 'discussion_messages');
  const mode = field(rooms, 'mode');
  const authorType = field(messages, 'author_type');
  if (!mode || JSON.stringify(values(mode)) !== JSON.stringify(roomModes)) {
    await request('collections/discussion_rooms/fields:update', {
      method: 'POST',
      query: { filterByTk: 'mode' },
      body: { uiSchema: roomModeField.uiSchema },
    });
  }
  if (!authorType || JSON.stringify(values(authorType)) !== JSON.stringify(authorTypes)) {
    await request('collections/discussion_messages/fields:update', {
      method: 'POST',
      query: { filterByTk: 'author_type' },
      body: { uiSchema: { ...(authorType.uiSchema || {}), enum: authorTypes.map((value) => ({ label: value, value })) } },
    });
  }

  metadata = await listMeta();
  const verifiedMode = field(collection(metadata, 'discussion_rooms'), 'mode');
  const verifiedVersion = field(collection(metadata, 'discussion_issues'), 'discussion_version');
  const verifiedBaseVersion = field(collection(metadata, 'discussion_messages'), 'generation_base_version');
  const verifiedRole = field(collection(metadata, 'discussion_messages'), 'author_role');
  if (
    !verifiedMode
    || verifiedMode.allowNull !== false
    || JSON.stringify(values(verifiedMode)) !== JSON.stringify(roomModes)
  ) throw new Error(turnBasedDiscussionMigrationId + ' did not create discussion_rooms.mode.');
  if (!verifiedVersion || verifiedVersion.type !== 'integer' || verifiedVersion.allowNull !== false) {
    throw new Error(turnBasedDiscussionMigrationId + ' did not create discussion_issues.discussion_version.');
  }
  if (!verifiedBaseVersion || verifiedBaseVersion.type !== 'integer' || verifiedBaseVersion.allowNull === false) {
    throw new Error(turnBasedDiscussionMigrationId + ' did not create discussion_messages.generation_base_version.');
  }
  if (
    !verifiedRole
    || verifiedRole.foreignKey !== 'author_role_id'
    || verifiedRole.target !== 'discussion_ai_roles'
    || verifiedRole.allowNull !== true
  ) throw new Error(turnBasedDiscussionMigrationId + ' did not create discussion_messages.author_role.');
}
