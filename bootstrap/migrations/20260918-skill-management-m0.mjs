export const skillManagementM0MigrationId = '20260918_skill_management_m0';

// Skill Management 1.0 M0 adds only Owner-facing descriptive facts to the
// existing Skill Registry. They stay nullable because every Skill registered
// before this migration genuinely has no recorded value; guessing a Chinese
// display name, usage guide, or usage scope would turn inference into fact.
export const skillDisplayNameZhField = {
  name: 'display_name_zh',
  title: '中文显示名',
  type: 'string',
  interface: 'input',
  allowNull: true,
};

export const skillUsageGuideField = {
  name: 'usage_guide',
  title: '使用说明',
  type: 'text',
  interface: 'textarea',
  allowNull: true,
};

export const skillScopeTypes = [
  { value: 'AGENT_BOUND', label: 'Agent 绑定型' },
  { value: 'REPOSITORY_WIDE', label: '仓库级' },
  { value: 'GLOBAL_UTILITY', label: '全局工具' },
];

export const skillScopeTypeField = {
  name: 'scope_type',
  title: '使用范围',
  type: 'string',
  interface: 'select',
  allowNull: true,
  uiSchema: {
    type: 'string',
    title: '使用范围',
    'x-component': 'Select',
    enum: skillScopeTypes.map(({ value, label }) => ({ label, value })),
  },
};

function getSkills(metadata) {
  const skills = metadata.find((collection) => collection.name === 'skills');
  if (!skills) {
    throw new Error('Cannot apply ' + skillManagementM0MigrationId + ': skills collection metadata is missing.');
  }
  return skills;
}

function getField(collection, name) {
  return (collection.fields || []).find((field) => field.name === name);
}

export async function migrateSkillManagementM0({ request, listMeta }) {
  let metadata = await listMeta();
  let skills = getSkills(metadata);

  for (const field of [skillDisplayNameZhField, skillUsageGuideField, skillScopeTypeField]) {
    if (!getField(skills, field.name)) {
      await request('collections/skills/fields:create', {
        method: 'POST',
        body: field,
      });
      metadata = await listMeta();
      skills = getSkills(metadata);
    }
  }

  const displayNameZh = getField(skills, skillDisplayNameZhField.name);
  const usageGuide = getField(skills, skillUsageGuideField.name);
  const scopeType = getField(skills, skillScopeTypeField.name);

  for (const field of [displayNameZh, usageGuide, scopeType]) {
    if (!field || field.allowNull !== true) {
      throw new Error(skillManagementM0MigrationId + ' must keep all new skills fields nullable.');
    }
  }

  const knownValues = skillScopeTypes.map((entry) => entry.value);
  const options = scopeType?.uiSchema?.enum || [];
  for (const option of options) {
    if (!knownValues.includes(option.value)) {
      throw new Error(skillManagementM0MigrationId + ' found unversioned skills.scope_type value ' + option.value + '.');
    }
  }
  const canonicalEnum = skillScopeTypes.map(({ value, label }) => ({ label, value }));
  const matchesCanonical = options.length === canonicalEnum.length
    && canonicalEnum.every((entry, index) => options[index]?.value === entry.value && options[index]?.label === entry.label);
  if (!matchesCanonical) {
    await request('collections/skills/fields:update', {
      method: 'POST',
      query: { filterByTk: skillScopeTypeField.name },
      body: { name: skillScopeTypeField.name, uiSchema: { ...(scopeType?.uiSchema || {}), enum: canonicalEnum } },
    });
  }
}
