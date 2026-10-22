// Real HTTP -> NocoBase -> PostgreSQL acceptance, no mocked storage/auth.
// Creates isolated disposable accounts and retains their history for inspection.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:13001';
const run = randomUUID();
const password = randomUUID() + '!aA7';
function client() {
  let cookie = '';
  return async (path, body, expected = 200, bearer) => {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: base, Cookie: bearer ? '' : cookie, ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }), redirect: 'manual' });
    const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
    const content = response.headers.get('content-type') || '';
    const data = content.includes('json') ? await response.json() : await response.text();
    assert.ok((Array.isArray(expected) ? expected : [expected]).includes(response.status), `${path}: ${response.status} ${JSON.stringify(data)}`);
    return { data, response };
  };
}
const a = client(), b = client(), outsider = client(), anonymous = client();
const A = (await a('/api/v1/auth/register', { name: 'Owner A', email: `a-${run}@example.invalid`, password })).data.user;
const B = (await b('/api/v1/auth/register', { name: '成员 B', email: `b-${run}@example.invalid`, password })).data.user;
const backend = process.env.NOCOBASE_URL || 'http://127.0.0.1:13000';
const nativeLogin = await fetch(backend + '/api/auth:signIn', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Authenticator': 'basic' }, body: JSON.stringify({ account: B.email, password }) });
assert.equal(nativeLogin.status, 200);
const nativeToken = (await nativeLogin.json()).data.token;
for (const collection of ['workspaces', 'workspace_members', 'workspace_invitations', 'project_user_members', 'project_resources', 'workspace_events']) {
  const nativeRead = await fetch(backend + '/api/' + collection + ':list', { headers: { Authorization: 'Bearer ' + nativeToken, 'X-Role': 'member' } });
  assert.equal(nativeRead.status, 403, 'Native member ACL must deny ' + collection);
}
await outsider('/api/v1/auth/register', { name: '另一个团队负责人', email: `other-${run}@example.invalid`, password });
const workspace = (await a('/api/v1/workspaces', { name: '真实工作空间验收 ' + run, description: '比较 Asana、Trello 与 Notion 的资料组织和团队交接能力。' }, 201)).data.workspace;
const ws = '/api/v1/workspaces/' + workspace.workspace_key;
const invitation = (await a(ws + '/invitations', { email: B.email }, 201)).data;
const token = new URL(invitation.invite_url).searchParams.get('invite');
await outsider('/api/v1/invitations/accept', { token }, 403);
await b('/api/v1/invitations/accept', { token });
await b('/api/v1/invitations/accept', { token }); // harmless replay
const project = (await a(ws + '/projects', { name: '竞品研究', goal: '分析三个产品如何组织资料并完成工作交接', acceptance_criteria: '官网来源、比较表、局限与查阅日期齐全。' }, 201)).data;
const agent = (await a(ws + '/agents', { name: '研究助理 C', responsibilities: '整理来源与研究结果', standard_inputs: '项目目标、官网资料', standard_outputs: '比较表、引用与结论', responsible_user_id: A.id }, 201)).data;
assert.equal(agent.connection_status, 'NOT_CONNECTED');
await b(ws + '/agents', { name: '越权登记' }, 403);
await a(ws + '/projects/' + project.id + '/participants', { user_id: B.id }, 201);
await a(ws + '/projects/' + project.id + '/participants', { agent_id: agent.id }, 201);
const source = (await a(ws + '/projects/' + project.id + '/resources', { name: 'Asana 官方功能资料', source: 'https://asana.com/features', kind: 'URL', purpose: '核对团队工作分配与审批能力' }, 201)).data;
const form = new FormData(); form.set('name', '研究任务简报'); form.set('purpose', '明确比较范围和验收标准');
form.set('file', new File(['# 竞品研究\n比较三个产品的工作分配、资料引用与成果确认方式。\n来源：https://asana.com/features、https://trello.com/tour、https://www.notion.com/product\n'], '竞品研究简报.md', { type: 'text/markdown' }));
const file = (await a(ws + '/projects/' + project.id + '/files', form, 201)).data;
assert.match(file.sha256, /^[a-f0-9]{64}$/);
const download = await b(ws + '/resources/' + file.id + '/download');
assert.match(download.data, /竞品研究/); assert.match(download.response.headers.get('content-disposition'), /filename\*=UTF-8/);
await anonymous(ws + '/resources/' + file.id + '/download', undefined, 401);
await outsider(ws + '/resources/' + file.id + '/download', undefined, 404);
await outsider(ws, undefined, 404);
const task = (await a(ws + '/projects/' + project.id + '/tasks', { title: '产品功能比较', summary: '依据官网制作比较表', executor_user_id: B.id, responsible_user_id: B.id, reviewer_user_id: A.id, input_resource_ids: [source.id, file.id] }, 201)).data;
const body = { summary: 'Asana 支持任务与审批；Trello 以看板卡片组织协作；Notion 将文档与数据库放在同一工作空间。', result_summary: '第一版比较说明，尚缺来源查阅日期。', evidence_resource_ids: [source.id, file.id], operation_key: randomUUID() };
const report = (await b(ws + '/tasks/' + task.id + '/results', body, 201)).data;
assert.equal(report.receipt.verification, 'PASS'); assert.match(report.receipt.canonical_url, /view=projects/);
assert.equal((await b(ws + '/tasks/' + task.id + '/results', body, 201)).data.id, report.id);
await b(ws + '/reports/' + report.id + '/review', { outcome: 'ACCEPT', reason: '越权验收', operation_key: randomUUID() }, 403);
await a(ws + '/reports/' + report.id + '/review', { outcome: 'RETURN', reason: '补充来源查阅日期与各产品的使用限制。', operation_key: randomUUID() }, 201);
const revision = (await b(ws + '/tasks/' + task.id + '/results', { ...body, summary: body.summary + '\n已补充查阅日期和限制：官网资料描述功能，不代表各订阅方案均包含该能力；采购前需要核对方案与权限。', result_summary: '修订版比较说明：来源、限制、查阅日期完整。', supplements_report_id: report.id, operation_key: randomUUID() }, 201)).data;
const decisions = await Promise.all([
  a(ws + '/reports/' + revision.id + '/review', { outcome: 'ACCEPT', reason: '来源与限制齐全，接受此成果。', operation_key: randomUUID() }, [201, 409]),
  a(ws + '/reports/' + revision.id + '/review', { outcome: 'RETURN', reason: '并发决定应被拒绝。', operation_key: randomUUID() }, [201, 409]),
]);
assert.deepEqual(decisions.map((r) => r.response.status).sort(), [201, 409]);
// Which request wins is nondeterministic; enforce one durable decision.
const afterRace = (await a(ws)).data;
assert.equal(afterRace.reports.filter((r) => String(r.reviewed_report_id) === String(revision.id)).length, 1);
if (afterRace.tasks.find((t) => t.id === task.id).effective_status === 'NEEDS_REVISION') {
  const next = (await b(ws + '/tasks/' + task.id + '/results', { ...body, summary: '并发决定后重新提交确认。', supplements_report_id: revision.id, operation_key: randomUUID() }, 201)).data;
  await a(ws + '/reports/' + next.id + '/review', { outcome: 'ACCEPT', reason: '确认接受', operation_key: randomUUID() }, 201);
}
let data = (await a(ws)).data;
assert.equal(data.tasks.find((t) => t.id === task.id).effective_status, 'COMPLETED');
assert.equal(data.projects.find((p) => p.id === project.id).status, 'ACTIVE');
assert.equal(data.projects.find((p) => p.id === project.id).phase_status, 'ACTIVE', 'Accepting one result must not complete the phase');
// A registered Agent can be assigned, but registration never starts execution.
const agentTask = (await a(ws + '/projects/' + project.id + '/tasks', { title: '复核研究来源', summary: '检查资料来源', holder_agent_id: agent.id, responsible_user_id: A.id, reviewer_user_id: A.id, input_resource_ids: [source.id] }, 201)).data;
const secondAgentTask = (await a(ws + '/projects/' + project.id + '/tasks', { title: '核查方案限制', summary: '说明官网内容适用范围', holder_agent_id: agent.id, responsible_user_id: A.id, reviewer_user_id: A.id, input_resource_ids: [source.id] }, 201)).data;
data = (await a(ws)).data; assert.equal(data.agents[0].connection_status, 'NOT_CONNECTED');
const connection = (await a(ws + '/agents/' + agent.id + '/connect', {})).data;
const connected = (await anonymous('/api/v1/agent/connect', {}, 200, connection.token)).data;
assert.equal(connected.agent.connection_status, 'AVAILABLE');
assert.equal(connected.receipt.verification, 'PASS');
assert.match(connection.receipt.canonical_url, /#agent-\d+$/);
assert.equal((await a(ws)).data.agents[0].connection_status, 'AVAILABLE');
await anonymous('/api/v1/agent/tasks/' + agentTask.id + '/start', {}, 200, connection.token);
await anonymous('/api/v1/agent/tasks/' + secondAgentTask.id + '/start', {}, 200, connection.token);
assert.equal((await a(ws)).data.agents[0].connection_status, 'RUNNING');
const agentReport = (await anonymous('/api/v1/agent/tasks/' + agentTask.id + '/results', { ...body, summary: '已复核官网来源。', operation_key: randomUUID() }, 201, connection.token)).data;
assert.equal((await a(ws)).data.agents[0].connection_status, 'RUNNING', 'Another assigned task is still executing');
const secondAgentReport = (await anonymous('/api/v1/agent/tasks/' + secondAgentTask.id + '/results', { ...body, summary: '已核查方案限制。', operation_key: randomUUID() }, 201, connection.token)).data;
assert.equal((await a(ws)).data.agents[0].connection_status, 'AVAILABLE');
await a(ws + '/reports/' + agentReport.id + '/review', { outcome: 'ACCEPT', reason: '来源复核通过', operation_key: randomUUID() }, 201);
await a(ws + '/reports/' + secondAgentReport.id + '/review', { outcome: 'ACCEPT', reason: '方案限制核查通过', operation_key: randomUUID() }, 201);
await a(ws + '/setup', { step: 'DONE' });
await a('/api/v1/auth/logout', {});
await a('/api/v1/auth/login', { email: A.email, password });
data = (await a(ws)).data;
assert.equal(data.members.length, 2); assert.equal(data.resources.length, 2); assert.ok(data.workspace.setup_completed_at);
assert.ok(data.reports.some((r) => r.summary.includes('补充来源查阅日期')));
assert.ok(data.reports.some((r) => r.report_type === 'CORRECTION'));
await a(ws + '/projects/' + project.id + '/state', { status: 'ACTIVE', phase: '研究完成', phase_status: 'COMPLETED', current_summary: '研究阶段已明确完成，项目仍待最终确认。', next_action: '确认项目完成', operation_key: randomUUID() }, 201);
data = (await a(ws)).data;
assert.equal(data.projects[0].phase_status, 'COMPLETED');
assert.equal(data.projects[0].status, 'ACTIVE', 'Completing a phase must not complete the Project');
await a(ws + '/projects/' + project.id + '/state', { status: 'COMPLETED', phase: '交付完成', phase_status: 'COMPLETED', current_summary: '比较说明与来源复核均已验收。', operation_key: randomUUID() }, 201);
assert.equal((await a(ws)).data.projects[0].status, 'COMPLETED');
await a(ws + '/agents/' + agent.id + '/revoke', {});
data = (await a(ws)).data;
for (const eventType of ['INVITATION_PENDING', 'INVITATION_ACCEPTED', 'AGENT_CONNECTED', 'AGENT_REVOKED', 'TASK_STARTED']) assert.ok(data.events.some((event) => event.event_type === eventType), 'Missing append-only event ' + eventType);
await anonymous('/api/v1/agent', undefined, 401, connection.token);
const otherWorkspace = (await outsider('/api/v1/workspaces', { name: '其它团队的私有工作空间' }, 201)).data.workspace;
await b('/api/v1/workspaces/' + otherWorkspace.workspace_key, undefined, 404);
await b('/api/v1/workspaces/' + otherWorkspace.workspace_key + '/projects', { name: '越权创建' }, 404);
for (const path of ['/api/work-management', '/api/agent-attachments/1', '/storage/uploads/test.md']) await b(path, undefined, 404);
await a(ws + '/projects/' + project.id + '/resources', { name: '拒绝脚本链接', purpose: '测试', source: 'javascript:alert(1)' }, 409);
console.log(JSON.stringify({ status: 'PASS', workspace: workspace.workspace_key, project_id: project.id, checks: 'registration, invitation, human+Agent execution, file download, return/revision/accept, concurrent decisions, receipt, re-login persistence, isolation, legacy route denial, explicit project completion' }));
