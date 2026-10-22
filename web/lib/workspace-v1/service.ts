import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  hashSecret,
  splitCredentialToken,
  verifyCredential,
} from "../agent-credentials";
import {
  assertSafeFilename,
  assertSafeSize,
  sha256Hex,
} from "../attachment-policy";
import { contentDispositionHeader } from "../content-disposition";
import { appOrigin, email } from "./auth";
import {
  backendUrl,
  bridgeToken,
  create,
  createScoped,
  first,
  id,
  noco,
  requireWorkspaceOwner,
  rows,
  sameId,
  scopedOne,
  scopedRows,
  update,
  updateScoped,
  WorkspaceError,
  type Row,
  type Scope,
  type User,
} from "./store";
import { projectProjection, taskProjection } from "./model";

const invalid = (message: string) =>
  new WorkspaceError("invalid_input", message);
export function text(
  value: unknown,
  label: string,
  max = 2000,
  optional = false,
) {
  if (optional && (value == null || value === "")) return "";
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)
  )
    throw invalid(`${label}不能为空，最多 ${max} 个字符。`);
  return value.trim();
}
const key = (prefix: string) => prefix + "-" + randomUUID();
const inviteHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const pick = (row: Row, fields: string[]) =>
  Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
const workspaceFields = [
  "id",
  "workspace_key",
  "name",
  "owner_user_id",
  "description",
  "team_type",
  "setup_step",
  "setup_completed_at",
  "createdAt",
];
const memberFields = [
  "id",
  "user_id",
  "role",
  "display_name",
  "email",
  "status",
];
const agentFields = [
  "id",
  "agent_key",
  "name",
  "responsible_user_id",
  "responsibilities",
  "standard_inputs",
  "standard_outputs",
  "connection_status",
  "last_connected_at",
  "connection_error",
  "createdAt",
];
const projectFields = [
  "id",
  "project_key",
  "name",
  "owner_user_id",
  "goal",
  "acceptance_criteria",
  "phase",
  "phase_status",
  "status",
  "current_summary",
  "next_action",
  "blocker",
  "createdAt",
  "completed_at",
];
const taskFields = [
  "id",
  "task_key",
  "project_id",
  "title",
  "summary",
  "holder_type",
  "holder_agent_id",
  "executor_user_id",
  "responsible_user_id",
  "reviewer_user_id",
  "due_at",
  "completed_at",
  "status",
  "effective_status",
  "input_resource_ids",
  "latest_report_id",
  "latest_decision_id",
  "latest_decision",
  "createdAt",
];
const resourceFields = [
  "id",
  "project_id",
  "name",
  "kind",
  "source",
  "purpose",
  "filename",
  "sha256",
  "size",
  "added_by_user_id",
  "added_by_agent_id",
  "createdAt",
];
const reportFields = [
  "id",
  "project_id",
  "task_id",
  "report_type",
  "summary",
  "result_summary",
  "submitted_by_user_id",
  "submitted_by_id",
  "submitted_at",
  "supplements_report_id",
  "reviewed_report_id",
  "decision_outcome",
  "input_resource_ids",
  "evidence_resource_ids",
  "structured",
];
const invitationFields = [
  "id",
  "email",
  "status",
  "expires_at",
  "accepted_at",
  "createdAt",
];
const eventFields = [
  "id",
  "project_id",
  "task_id",
  "agent_id",
  "invitation_id",
  "actor_user_id",
  "actor_agent_id",
  "event_type",
  "summary",
  "occurred_at",
  "structured",
];

async function appendWorkspaceEvent(scope: Scope, eventKey: string, values: Row) {
  const existing = (await scopedRows(scope, "workspace_events", { event_key: eventKey }))[0];
  if (existing) return existing;
  try {
    return await createScoped(scope, "workspace_events", {
      ...values,
      event_key: eventKey,
      occurred_at: new Date().toISOString(),
    });
  } catch (error) {
    if (!(error instanceof WorkspaceError && error.status === 409)) throw error;
    const replay = (await scopedRows(scope, "workspace_events", { event_key: eventKey }))[0];
    if (!replay) throw error;
    return replay;
  }
}

export async function myWorkspaces(user: User) {
  const members = await rows("workspace_members", {
    user_id: user.id,
    status: "ACTIVE",
  });
  const list: Row[] = [];
  for (const member of members) {
    const workspace = await first("workspaces", { id: member.workspace_id });
    if (workspace)
      list.push({ ...pick(workspace, workspaceFields), role: member.role });
  }
  // Recover an interrupted Owner membership write with the original workspace,
  // never create a duplicate workspace to conceal an incomplete response.
  for (const workspace of await rows("workspaces", {
    owner_user_id: user.id,
  })) {
    if (!members.some((m) => sameId(m.workspace_id, workspace.id))) {
      await create("workspace_members", {
        workspace_id: workspace.id,
        user_id: user.id,
        role: "OWNER",
        status: "ACTIVE",
        display_name: user.name,
        email: user.email,
      });
      list.push({ ...pick(workspace, workspaceFields), role: "OWNER" });
    }
  }
  return list;
}
export async function createWorkspace(user: User, body: Row) {
  const workspace = await create("workspaces", {
    workspace_key: key("ws"),
    name: text(body.name, "工作空间名称", 80),
    description: text(body.description, "团队简介", 1000, true),
    team_type: body.team_type === "PERSONAL" ? "PERSONAL" : "TEAM",
    owner_user_id: user.id,
    setup_step: "TEAM",
  });
  await create("workspace_members", {
    workspace_id: workspace.id,
    user_id: user.id,
    role: "OWNER",
    status: "ACTIVE",
    display_name: user.name,
    email: user.email,
  });
  const verified = await first("workspaces", {
    id: workspace.id,
    owner_user_id: user.id,
  });
  if (!verified)
    throw new WorkspaceError(
      "write_incomplete",
      "工作空间保存未确认，请刷新查看。",
      503,
    );
  return pick(verified, workspaceFields);
}
export async function snapshot(scope: Scope) {
  const [
    members,
    agents,
    projects,
    tasks,
    resources,
    reports,
    events,
    agentMembers,
    userMembers,
    credentials,
    invitations,
  ] = await Promise.all([
    scopedRows(scope, "workspace_members", { status: "ACTIVE" }),
    scopedRows(scope, "agents"),
    scopedRows(scope, "projects"),
    scopedRows(scope, "work_tasks"),
    scopedRows(scope, "project_resources"),
    scopedRows(scope, "project_reports"),
    scopedRows(scope, "workspace_events"),
    scopedRows(scope, "project_members"),
    scopedRows(scope, "project_user_members"),
    scopedRows(scope, "agent_credentials"),
    scope.member.role === "OWNER"
      ? scopedRows(scope, "workspace_invitations")
      : Promise.resolve([]),
  ]);
  for (const invitation of invitations.filter(
    (row) => row.status === "PENDING" && Date.parse(id(row.expires_at)) < Date.now(),
  )) {
    const event = await appendWorkspaceEvent(
      scope,
      `invitation-expired-${id(invitation.id)}`,
      {
        invitation_id: invitation.id,
        event_type: "INVITATION_EXPIRED",
        summary: "工作空间邀请已过期。",
        structured: { status: "EXPIRED" },
      },
    );
    if (!events.some((row) => sameId(row.id, event.id))) events.push(event);
  }
  const projectedTasks: Row[] = tasks.map((row) =>
    taskProjection(row, reports),
  );
  return {
    workspace: pick(scope.workspace, workspaceFields),
    me: scope.user,
    role: scope.member.role,
    members: members.map((r) => pick(r, memberFields)),
    agents: agents.map((r) => {
      const connected = credentials.some(
        (c) =>
          sameId(c.agent_id, r.id) &&
          c.status === "ACTIVE" &&
          Date.parse(id(c.expires_at)) > Date.now(),
      );
      return pick(
        {
          ...r,
          connection_status:
            connected && r.last_connected_at
              ? r.connection_status === "ERROR"
                ? "ERROR"
                : projectedTasks.some(
                      (task) =>
                        sameId(task.holder_agent_id, r.id) &&
                        task.effective_status === "IN_PROGRESS",
                    )
                  ? "RUNNING"
                  : "AVAILABLE"
              : "NOT_CONNECTED",
        },
        agentFields,
      );
    }),
    projects: projects.map((r) =>
      pick(projectProjection(r, reports), projectFields),
    ),
    tasks: projectedTasks.map((r) => pick(r, taskFields)),
    resources: resources.map((r) => pick(r, resourceFields)),
    reports: reports.map((r) => pick(r, reportFields)),
    events: events.map((r) => pick(r, eventFields)),
    agent_members: agentMembers.map((r) =>
      pick(r, ["id", "project_id", "agent_id"]),
    ),
    user_members: userMembers.map((r) =>
      pick(r, ["id", "project_id", "user_id"]),
    ),
    invitations: invitations.map((r) =>
      pick(
        {
          ...r,
          status:
            r.status === "PENDING" && Date.parse(id(r.expires_at)) < Date.now()
              ? "EXPIRED"
              : r.status,
        },
        invitationFields,
      ),
    ),
  };
}
async function member(scope: Scope, userId: unknown) {
  const found = (
    await scopedRows(scope, "workspace_members", {
      user_id: userId,
      status: "ACTIVE",
    })
  )[0];
  if (!found) throw invalid("请选择此工作空间的成员。");
  return found;
}
export async function receipt(
  scope: Scope,
  collection: string,
  row: Row,
  intended: Row,
  view: string,
  projectId?: unknown,
) {
  const read = await scopedOne(scope, collection, row.id);
  for (const [field, value] of Object.entries(intended)) {
    const actual = read[field];
    const matches =
      Array.isArray(value) || (value !== null && typeof value === "object")
        ? JSON.stringify(actual) === JSON.stringify(value)
        : id(actual) === id(value);
    if (!matches)
      throw new WorkspaceError(
        "write_incomplete",
        "记录已写入，但保存核验未通过，请刷新检查。",
        503,
      );
  }
  const url = new URL("/workspace", appOrigin());
  url.searchParams.set("workspace", id(scope.workspace.workspace_key));
  url.searchParams.set("view", view);
  if (projectId) url.searchParams.set("project", id(projectId));
  url.searchParams.set("record", id(row.id));
  url.hash =
    collection === "agent_credentials"
      ? "agent-" + id(read.agent_id)
      : (collection === "project_reports"
          ? "report-"
          : collection === "work_tasks"
            ? "task-"
            : collection === "project_resources"
              ? "resource-"
              : collection === "agents"
                ? "agent-"
                : "record-") + id(row.id);
  return {
    id: row.id,
    record_type: collection,
    canonical_url: url.toString(),
    verification: "PASS",
    receipt_state: "SUCCESS",
  };
}
export async function setup(scope: Scope, body: Row) {
  requireWorkspaceOwner(scope);
  const step = text(body.step, "初始化步骤", 20);
  if (!["TEAM", "PROJECT", "AGENT", "CHECK", "DONE"].includes(step))
    throw invalid("初始化步骤无效。");
  if (
    step === "DONE" &&
    (!(await scopedRows(scope, "projects")).length ||
      !(await scopedRows(scope, "agents")).length)
  )
    throw invalid("请先创建项目和登记 Agent。");
  await update(
    "workspaces",
    scope.workspace.id,
    {
      setup_step: step,
      ...(step === "DONE"
        ? { setup_completed_at: new Date().toISOString() }
        : {}),
    },
    { owner_user_id: scope.user.id },
  );
  const saved = await first("workspaces", {
    id: scope.workspace.id,
    owner_user_id: scope.user.id,
  });
  if (saved?.setup_step !== step)
    throw new WorkspaceError(
      "write_incomplete",
      "初始化进度尚未确认保存，请刷新检查。",
      503,
    );
  return saved;
}
export async function invite(scope: Scope, body: Row) {
  requireWorkspaceOwner(scope);
  const target = email(body.email);
  if (target === scope.user.email) throw invalid("请邀请另一位同事。");
  const secret = randomBytes(32).toString("base64url");
  const saved = await createScoped(scope, "workspace_invitations", {
    token_hash: inviteHash(secret),
    email: target,
    invited_by_user_id: scope.user.id,
    status: "PENDING",
    expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
  });
  await receipt(
    scope,
    "workspace_invitations",
    saved,
    { email: target, status: "PENDING" },
    "team",
  );
  await appendWorkspaceEvent(scope, `invitation-pending-${id(saved.id)}`, {
    invitation_id: saved.id,
    actor_user_id: scope.user.id,
    event_type: "INVITATION_PENDING",
    summary: "工作空间邀请已发出。",
    structured: { status: "PENDING" },
  });
  const url = new URL("/workspace", appOrigin());
  url.searchParams.set("invite", secret);
  return {
    invitation: pick(saved, invitationFields),
    invite_url: url.toString(),
  };
}
export async function acceptInvite(user: User, secret: unknown) {
  if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(secret))
    throw invalid("邀请链接无效。");
  const invitation = await first("workspace_invitations", {
    token_hash: inviteHash(secret),
  });
  if (
    !invitation ||
    invitation.email !== user.email ||
    invitation.status === "REVOKED" ||
    Date.parse(id(invitation.expires_at)) <= Date.now()
  )
    throw new WorkspaceError(
      "invitation_unavailable",
      "邀请已过期、已撤销，或与你的登录邮箱不符。",
      403,
    );
  if (
    invitation.status === "ACCEPTED" &&
    !sameId(invitation.accepted_by_user_id, user.id)
  )
    throw new WorkspaceError("invitation_unavailable", "此邀请已使用。", 403);
  let membership = await first("workspace_members", {
    workspace_id: invitation.workspace_id,
    user_id: user.id,
  });
  if (!membership)
    try {
      membership = await create("workspace_members", {
        workspace_id: invitation.workspace_id,
        user_id: user.id,
        role: "MEMBER",
        status: "ACTIVE",
        display_name: user.name,
        email: user.email,
      });
    } catch (error) {
      if (!(error instanceof WorkspaceError && error.status === 409))
        throw error;
      membership = await first("workspace_members", {
        workspace_id: invitation.workspace_id,
        user_id: user.id,
      });
    }
  if (!membership || membership.status !== "ACTIVE")
    throw new WorkspaceError(
      "invitation_unavailable",
      "请联系工作空间负责人。",
      403,
    );
  const workspace = await first("workspaces", { id: invitation.workspace_id });
  const scope = { workspace: workspace!, member: membership, user };
  await updateScoped(scope, "workspace_invitations", invitation.id, {
    status: "ACCEPTED",
    accepted_by_user_id: user.id,
    accepted_at: new Date().toISOString(),
  });
  await appendWorkspaceEvent(scope, `invitation-accepted-${id(invitation.id)}`, {
    invitation_id: invitation.id,
    actor_user_id: user.id,
    event_type: "INVITATION_ACCEPTED",
    summary: `${user.name} 已接受邀请并加入工作空间。`,
    structured: { status: "ACCEPTED" },
  });
  return pick(workspace!, workspaceFields);
}
export async function revokeInvitation(scope: Scope, invitationId: string) {
  requireWorkspaceOwner(scope);
  const invitation = await scopedOne(scope, "workspace_invitations", invitationId);
  if (!["PENDING", "REVOKED"].includes(id(invitation.status)))
    throw new WorkspaceError("conflict", "已接受的邀请不能撤销。", 409);
  if (invitation.status !== "REVOKED")
    await updateScoped(scope, "workspace_invitations", invitation.id, { status: "REVOKED" });
  await appendWorkspaceEvent(scope, `invitation-revoked-${id(invitation.id)}`, {
    invitation_id: invitation.id,
    actor_user_id: scope.user.id,
    event_type: "INVITATION_REVOKED",
    summary: "工作空间邀请已撤销。",
    structured: { status: "REVOKED" },
  });
  return { revoked: true };
}
export async function registerAgent(scope: Scope, body: Row) {
  requireWorkspaceOwner(scope);
  const responsible = await member(
    scope,
    body.responsible_user_id || scope.user.id,
  );
  const values = {
    agent_key: key("agent"),
    name: text(body.name, "Agent 名称", 80),
    responsibilities: text(body.responsibilities, "职责"),
    standard_inputs: text(body.standard_inputs, "所需输入"),
    standard_outputs: text(body.standard_outputs, "预期产出"),
    responsible_user_id: responsible.user_id,
    platform: "EXTERNAL",
    agent_type: "AI",
    status: "ACTIVE",
    connection_status: "NOT_CONNECTED",
  };
  const saved = await createScoped(scope, "agents", values);
  return {
    ...pick(saved, agentFields),
    receipt: await receipt(scope, "agents", saved, values, "agents"),
  };
}
function canManageAgent(scope: Scope, agent: Row) {
  if (
    scope.member.role !== "OWNER" &&
    !sameId(agent.responsible_user_id, scope.user.id)
  )
    throw new WorkspaceError(
      "forbidden",
      "此操作需要 Agent 的人类负责人。",
      403,
    );
}
export async function editAgent(scope: Scope, agentId: string, body: Row) {
  const agent = await scopedOne(scope, "agents", agentId);
  canManageAgent(scope, agent);
  if (
    body.responsible_user_id &&
    !sameId(body.responsible_user_id, agent.responsible_user_id)
  )
    requireWorkspaceOwner(scope);
  const responsible = await member(
    scope,
    body.responsible_user_id || agent.responsible_user_id,
  );
  const values = {
    name: text(body.name, "Agent 名称", 80),
    responsibilities: text(body.responsibilities, "职责"),
    standard_inputs: text(body.standard_inputs, "所需输入"),
    standard_outputs: text(body.standard_outputs, "预期产出"),
    responsible_user_id: responsible.user_id,
  };
  await updateScoped(scope, "agents", agent.id, values);
  return receipt(scope, "agents", agent, values, "agents");
}
export async function agentConnection(
  scope: Scope,
  agentId: string,
  action: string,
) {
  const agent = await scopedOne(scope, "agents", agentId);
  canManageAgent(scope, agent);
  const credentials = await scopedRows(scope, "agent_credentials", {
      agent_id: agent.id,
    }),
    old = credentials.filter((credential) => credential.status === "ACTIVE");
  if (action === "revoke") {
    for (const credential of old)
      await updateScoped(scope, "agent_credentials", credential.id, {
        status: "REVOKED",
      });
    await updateScoped(scope, "agents", agent.id, {
      connection_status: "NOT_CONNECTED",
      last_connected_at: null,
    });
    for (const credential of credentials.filter((row) => ["ACTIVE", "REVOKED"].includes(id(row.status))))
      await appendWorkspaceEvent(scope, `agent-revoked-${id(credential.id)}`, {
        agent_id: agent.id,
        actor_user_id: scope.user.id,
        event_type: "AGENT_REVOKED",
        summary: `已撤销 Agent「${id(agent.name)}」的连接。`,
        structured: { status: "NOT_CONNECTED", credential_id: credential.id },
      });
    return { disconnected: true };
  }
  if (old.length)
    throw new WorkspaceError(
      "conflict",
      "请先撤销已有连接，再生成新连接。",
      409,
    );
  const pepper = process.env.AISYS_CREDENTIAL_PEPPER;
  if (!pepper || pepper.length < 32)
    throw new WorkspaceError(
      "service_unavailable",
      "Agent 连接尚未完成安全配置。",
      503,
    );
  const secret = randomBytes(32).toString("base64url"),
    credentialKey = key("sgc");
  const saved = await createScoped(scope, "agent_credentials", {
    credential_key: credentialKey,
    agent_id: agent.id,
    token_hash: hashSecret(secret, pepper),
    status: "ACTIVE",
    issued_by_user_id: scope.user.id,
    expires_at: new Date(Date.now() + 90 * 86400_000).toISOString(),
  });
  return {
    token: credentialKey + "." + secret,
    expires_at: saved.expires_at,
    endpoint: appOrigin() + "/api/v1/agent",
    receipt: await receipt(
      scope,
      "agent_credentials",
      saved,
      { status: "ACTIVE", agent_id: agent.id },
      "agents",
    ),
  };
}
export async function createProject(scope: Scope, body: Row) {
  const owner = await member(scope, body.owner_user_id || scope.user.id);
  if (scope.member.role !== "OWNER" && !sameId(owner.user_id, scope.user.id))
    throw new WorkspaceError("forbidden", "成员只能创建自己负责的项目。", 403);
  const values = {
    project_key: key("project"),
    name: text(body.name, "项目名称", 120),
    goal: text(body.goal, "目标"),
    acceptance_criteria: text(body.acceptance_criteria, "验收标准"),
    owner_user_id: owner.user_id,
    phase: "准备",
    phase_status: "ACTIVE",
    status: "ACTIVE",
    current_summary: "已创建，等待加入资料并分配工作。",
    next_action: "加入项目资料",
    lifecycle_status: "ACTIVE",
  };
  const saved = await createScoped(scope, "projects", values);
  await createScoped(scope, "project_user_members", {
    project_id: saved.id,
    user_id: owner.user_id,
  });
  return {
    ...pick(saved, projectFields),
    receipt: await receipt(
      scope,
      "projects",
      saved,
      values,
      "projects",
      saved.id,
    ),
  };
}
export function projectOwner(scope: Scope, project: Row) {
  if (!sameId(project.owner_user_id, scope.user.id))
    throw new WorkspaceError("forbidden", "此操作需要项目 Owner。", 403);
}
async function projectActive(scope: Scope, project: Row) {
  const current = projectProjection(
    project,
    await scopedRows(scope, "project_reports", { project_id: project.id }),
  );
  if (current.status === "COMPLETED")
    throw new WorkspaceError(
      "conflict",
      "项目已完成，请由 Owner 重新开启后继续。",
      409,
    );
  return current;
}
export async function addParticipant(
  scope: Scope,
  projectId: string,
  body: Row,
) {
  const project = await scopedOne(scope, "projects", projectId);
  projectOwner(scope, project);
  await projectActive(scope, project);
  if (body.agent_id) {
    const agent = await scopedOne(scope, "agents", body.agent_id);
    const existing = (
      await scopedRows(scope, "project_members", {
        project_id: project.id,
        agent_id: agent.id,
      })
    )[0];
    return (
      existing ||
      createScoped(scope, "project_members", {
        project_id: project.id,
        agent_id: agent.id,
        member_role: "EXECUTOR",
      })
    );
  }
  const user = await member(scope, body.user_id);
  const existing = (
    await scopedRows(scope, "project_user_members", {
      project_id: project.id,
      user_id: user.user_id,
    })
  )[0];
  return (
    existing ||
    createScoped(scope, "project_user_members", {
      project_id: project.id,
      user_id: user.user_id,
    })
  );
}
export async function resourceIds(
  scope: Scope,
  projectId: unknown,
  value: unknown,
) {
  if (value == null) return [];
  if (
    !Array.isArray(value) ||
    value.length > 30 ||
    value.some((v) => !/^\d+$/.test(id(v)))
  )
    throw invalid("资料引用无效。");
  const result = [...new Set(value.map(id))];
  for (const resourceId of result) {
    const resource = await scopedOne(scope, "project_resources", resourceId);
    if (!sameId(resource.project_id, projectId))
      throw invalid("只能引用本项目的资料。");
  }
  return result;
}
export async function createTask(scope: Scope, projectId: string, body: Row) {
  const project = await scopedOne(scope, "projects", projectId);
  projectOwner(scope, project);
  await projectActive(scope, project);
  const responsible = await member(scope, body.responsible_user_id),
    reviewer = await member(scope, body.reviewer_user_id);
  if (Boolean(body.executor_user_id) === Boolean(body.holder_agent_id))
    throw invalid("请选择一位成员或一个 Agent 执行。");
  const executor = body.executor_user_id
    ? await member(scope, body.executor_user_id)
    : null;
  const agent = body.holder_agent_id
    ? await scopedOne(scope, "agents", body.holder_agent_id)
    : null;
  const participation = executor
    ? await scopedRows(scope, "project_user_members", {
        project_id: project.id,
        user_id: executor.user_id,
      })
    : await scopedRows(scope, "project_members", {
        project_id: project.id,
        agent_id: agent!.id,
      });
  if (!participation.length) throw invalid("请先把执行人或 Agent 加入项目。");
  let due: string | null = null;
  if (body.due_at) {
    const timestamp = Date.parse(id(body.due_at));
    if (!Number.isFinite(timestamp)) throw invalid("截止时间无效。");
    due = new Date(timestamp).toISOString();
  }
  const values = {
    task_key: key("task"),
    project_id: project.id,
    title: text(body.title, "工作名称", 120),
    summary: text(body.summary, "工作内容"),
    holder_type: agent ? "AGENT" : "HUMAN",
    holder_agent_id: agent?.id ?? null,
    executor_user_id: executor?.user_id ?? null,
    responsible_user_id: responsible.user_id,
    reviewer_user_id: reviewer.user_id,
    due_at: due,
    status: "OPEN",
    input_resource_ids: await resourceIds(
      scope,
      project.id,
      body.input_resource_ids,
    ),
  };
  const saved = await createScoped(scope, "work_tasks", values);
  return {
    ...pick(saved, taskFields),
    receipt: await receipt(
      scope,
      "work_tasks",
      saved,
      values,
      "projects",
      project.id,
    ),
  };
}
export async function addResource(
  scope: Scope,
  projectId: string,
  body: Row,
  file?: File,
  agentId?: unknown,
) {
  const project = await scopedOne(scope, "projects", projectId);
  await projectActive(scope, project);
  const purpose = text(body.purpose, "用途", 1000),
    name = text(body.name || file?.name, "资料名称", 200);
  let values: Row = {
    project_id: project.id,
    name,
    purpose,
    added_by_user_id: agentId ? null : scope.user.id,
    added_by_agent_id: agentId || null,
  };
  if (file) {
    assertSafeSize(file.size);
    const filename = assertSafeFilename(file.name);
    const hash = await sha256Hex(file);
    const form = new FormData();
    form.append("file", file, filename);
    form.append("sha256", hash);
    const upload = await noco("attachments:create", {
      method: "POST",
      body: form,
    });
    const attachment = upload.data as Row;
    if (!attachment?.id)
      throw new WorkspaceError(
        "write_incomplete",
        "文件保存未确认，请重试。",
        503,
      );
    values = {
      ...values,
      kind: "FILE",
      attachment_id: attachment.id,
      filename,
      size: file.size,
      mimetype: file.type,
      sha256: hash,
      source: "用户上传",
    };
  } else {
    const kind =
      body.kind === "DOCUMENT"
        ? "DOCUMENT"
        : body.kind === "GITHUB"
          ? "GITHUB"
          : "URL";
    const source = text(body.source, "来源", 4000);
    let url: URL;
    try {
      url = new URL(source);
    } catch {
      throw invalid("请填写完整的 HTTP 或 HTTPS 链接。");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw invalid("资料链接无效。");
    values = { ...values, kind, source: url.toString() };
  }
  const saved = await createScoped(scope, "project_resources", values);
  return {
    ...pick(saved, resourceFields),
    receipt: await receipt(
      scope,
      "project_resources",
      saved,
      values,
      "projects",
      project.id,
    ),
  };
}
export async function download(scope: Scope, resourceId: string) {
  const resource = await scopedOne(scope, "project_resources", resourceId);
  if (resource.kind !== "FILE" || !resource.attachment_id)
    throw new WorkspaceError("not_found", "找不到此文件。", 404);
  const payload = await noco("attachments:get", {
    query: { filterByTk: id(resource.attachment_id) },
  });
  const attachment = payload.data as Row;
  const base = new URL(backendUrl()),
    url = new URL(id(attachment?.url), base);
  if (
    !attachment?.url ||
    url.origin !== base.origin ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/storage/")
  )
    throw new WorkspaceError("service_unavailable", "文件暂时不可读取。", 503);
  const file = await fetch(url, {
    headers: { Authorization: "Bearer " + bridgeToken() },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!file.ok || !file.body)
    throw new WorkspaceError("service_unavailable", "文件暂时不可读取。", 503);
  return new Response(file.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": contentDispositionHeader(id(resource.filename)),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
function canSubmit(scope: Scope, task: Row, agentId?: unknown) {
  const allowed = agentId
    ? sameId(task.holder_agent_id, agentId)
    : sameId(task.executor_user_id, scope.user.id) ||
      sameId(task.responsible_user_id, scope.user.id);
  if (!allowed)
    throw new WorkspaceError(
      "forbidden",
      "只有执行人或人类责任人可以提交此工作。",
      403,
    );
}
export async function startTask(
  scope: Scope,
  taskId: string,
  agentId?: unknown,
) {
  const task = await scopedOne(scope, "work_tasks", taskId);
  canSubmit(scope, task, agentId);
  await projectActive(
    scope,
    await scopedOne(scope, "projects", task.project_id),
  );
  const current = taskProjection(
    task,
    await scopedRows(scope, "project_reports", { task_id: task.id }),
  );
  if (!["OPEN", "IN_PROGRESS"].includes(id(current.effective_status)))
    throw new WorkspaceError(
      "conflict",
      "此工作已提交或验收，请刷新查看。",
      409,
    );
  await updateScoped(scope, "work_tasks", task.id, { status: "IN_PROGRESS" });
  if (agentId)
    await updateScoped(scope, "agents", agentId, {
      connection_status: "RUNNING",
      last_connected_at: new Date().toISOString(),
    });
  await appendWorkspaceEvent(scope, `task-started-${id(task.id)}`, {
    project_id: task.project_id,
    task_id: task.id,
    ...(agentId ? { agent_id: agentId, actor_agent_id: agentId } : { actor_user_id: scope.user.id }),
    event_type: "TASK_STARTED",
    summary: `工作「${id(task.title)}」已开始执行。`,
    structured: { status: "IN_PROGRESS" },
  });
  return receipt(
    scope,
    "work_tasks",
    task,
    { status: "IN_PROGRESS" },
    "projects",
    task.project_id,
  );
}
async function appendOperation(
  scope: Scope,
  values: Row,
  operationKey: unknown,
  view: string,
  projectId: unknown,
) {
  if (
    typeof operationKey !== "string" ||
    !/^[A-Za-z0-9_-]{16,80}$/.test(operationKey)
  )
    throw invalid("保存标识无效，请刷新后重试。");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(values))
    .digest("hex");
  const existing = (
    await scopedRows(scope, "project_reports", { operation_key: operationKey })
  )[0];
  if (existing) {
    if (existing.operation_fingerprint !== fingerprint)
      throw new WorkspaceError(
        "conflict",
        "保存标识对应的内容不同，请刷新后重试。",
        409,
      );
    return {
      ...pick(existing, reportFields),
      receipt: {
        ...(await receipt(
          scope,
          "project_reports",
          existing,
          { operation_fingerprint: fingerprint },
          view,
          projectId,
        )),
        receipt_state: "IDEMPOTENT_REPLAY",
      },
    };
  }
  let saved: Row;
  try {
    saved = await createScoped(scope, "project_reports", {
      ...values,
      submitted_at: new Date().toISOString(),
      operation_key: operationKey,
      operation_fingerprint: fingerprint,
    });
  } catch (error) {
    if (!(error instanceof WorkspaceError && error.status === 409)) throw error;
    const replay = (
      await scopedRows(scope, "project_reports", {
        operation_key: operationKey,
      })
    )[0];
    if (!replay || replay.operation_fingerprint !== fingerprint) throw error;
    saved = replay;
  }
  return {
    ...pick(saved, reportFields),
    receipt: await receipt(
      scope,
      "project_reports",
      saved,
      values,
      view,
      projectId,
    ),
  };
}
export async function submitResult(
  scope: Scope,
  taskId: string,
  body: Row,
  agentId?: unknown,
) {
  const task = await scopedOne(scope, "work_tasks", taskId);
  canSubmit(scope, task, agentId);
  const project = await scopedOne(scope, "projects", task.project_id);
  await projectActive(scope, project);
  const history = await scopedRows(scope, "project_reports", {
    task_id: task.id,
  });
  const projected = taskProjection(task, history);
  // Replays are allowed after review; they still have to match the original
  // actor, task, text and evidence fingerprint in appendOperation.
  const replay = history.some((r) => r.operation_key === body.operation_key);
  if (
    !replay &&
    ["WAITING_REVIEW", "COMPLETED"].includes(id(projected.effective_status))
  )
    throw new WorkspaceError(
      "conflict",
      "此成果正在等待验收或已经接受，请刷新查看。",
      409,
    );
  const previous = body.supplements_report_id
    ? await scopedOne(scope, "project_reports", body.supplements_report_id)
    : null;
  if (
    previous &&
    (!sameId(previous.task_id, task.id) ||
      !["PROGRESS", "CORRECTION"].includes(id(previous.report_type)))
  )
    throw invalid("修订必须关联此工作的原始成果。");
  if (
    !replay &&
    (projected.effective_status === "NEEDS_REVISION"
      ? !previous || !sameId(previous.id, projected.latest_report_id)
      : previous !== null)
  )
    throw invalid("请修订最新被退回的成果。");
  const evidence = await resourceIds(
    scope,
    project.id,
    body.evidence_resource_ids,
  );
  if (!evidence.length) throw invalid("至少关联一条证据或交付文件。");
  const values = {
    project_id: task.project_id,
    task_id: task.id,
    report_type: previous ? "CORRECTION" : "PROGRESS",
    summary: text(body.summary, "成果说明", 12000),
    result_summary: text(body.result_summary, "交付物说明", 4000),
    supplements_report_id: previous?.id ?? null,
    submitted_by_user_id: agentId ? null : scope.user.id,
    submitted_by_id: agentId || null,
    input_resource_ids: await resourceIds(
      scope,
      project.id,
      body.input_resource_ids ?? task.input_resource_ids,
    ),
    evidence_resource_ids: evidence,
  };
  const result = await appendOperation(
    scope,
    values,
    body.operation_key,
    "projects",
    task.project_id,
  );
  if (agentId)
    await updateScoped(scope, "agents", agentId, {
      connection_status: "AVAILABLE",
      last_connected_at: new Date().toISOString(),
    });
  return result;
}
export async function reviewResult(scope: Scope, reportId: string, body: Row) {
  const report = await scopedOne(scope, "project_reports", reportId);
  if (
    !["PROGRESS", "CORRECTION"].includes(id(report.report_type)) ||
    !report.task_id
  )
    throw invalid("只能验收任务成果。");
  const task = await scopedOne(scope, "work_tasks", report.task_id),
    project = await scopedOne(scope, "projects", report.project_id);
  if (
    !sameId(scope.user.id, project.owner_user_id) &&
    !sameId(scope.user.id, task.reviewer_user_id)
  )
    throw new WorkspaceError(
      "forbidden",
      "此操作需要项目 Owner 或指定验收人。",
      403,
    );
  const outcome = body.outcome;
  if (!["ACCEPT", "RETURN"].includes(id(outcome)))
    throw invalid("验收操作无效。");
  const projected = taskProjection(
    task,
    await scopedRows(scope, "project_reports", { task_id: task.id }),
  );
  if (!sameId(projected.latest_report_id, report.id))
    throw new WorkspaceError("conflict", "请验收最新成果版本。", 409);
  const values = {
    project_id: project.id,
    task_id: task.id,
    report_type: "DECISION",
    reviewed_report_id: report.id,
    decision_outcome: outcome,
    summary: text(
      body.reason,
      outcome === "RETURN" ? "退回理由" : "验收说明",
      4000,
    ),
    submitted_by_user_id: scope.user.id,
  };
  return appendOperation(
    scope,
    values,
    body.operation_key,
    "projects",
    project.id,
  );
}
export async function projectChange(
  scope: Scope,
  projectId: string,
  body: Row,
) {
  const project = await scopedOne(scope, "projects", projectId);
  projectOwner(scope, project);
  const status = text(body.status, "项目状态", 20);
  if (!["ACTIVE", "WAITING", "BLOCKED", "COMPLETED"].includes(status))
    throw invalid("项目状态无效。");
  if (status === "COMPLETED") {
    const tasks = await scopedRows(scope, "work_tasks", {
        project_id: project.id,
      }),
      reports = await scopedRows(scope, "project_reports", {
        project_id: project.id,
      });
    if (
      !tasks.length ||
      tasks.some(
        (t) => taskProjection(t, reports).effective_status !== "COMPLETED",
      )
    )
      throw invalid("项目完成前，全部工作都需要验收通过。");
  }
  const current = projectProjection(
    project,
    await scopedRows(scope, "project_reports", { project_id: project.id }),
  );
  const details = {
    status,
    name: text(body.name || current.name, "项目名称", 120),
    goal: text(body.goal || current.goal, "项目目标"),
    acceptance_criteria: text(
      body.acceptance_criteria || current.acceptance_criteria,
      "验收标准",
    ),
    phase: text(body.phase, "当前阶段", 80),
    phase_status: text(body.phase_status || current.phase_status || "ACTIVE", "阶段状态", 20),
    current_summary: text(body.current_summary, "项目进展", 2000),
    next_action: text(body.next_action, "下一步", 1000, true),
    blocker: text(body.blocker, "阻碍", 1000, true),
  };
  if (!["ACTIVE", "COMPLETED"].includes(details.phase_status))
    throw invalid("阶段状态无效。");
  return appendOperation(
    scope,
    {
      project_id: project.id,
      report_type: "PROJECT_EVENT",
      summary: details.current_summary,
      submitted_by_user_id: scope.user.id,
      structured: details,
    },
    body.operation_key,
    "projects",
    project.id,
  );
}
export interface AgentScope {
  scope: Scope;
  agent: Row;
  credential: Row;
}
export async function requireAgent(request: Request): Promise<AgentScope> {
  const bearer =
    request.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9._-]{30,300})$/)?.[1] || "";
  const parts = splitCredentialToken(bearer),
    pepper = process.env.AISYS_CREDENTIAL_PEPPER;
  const credential =
    parts && pepper
      ? await first("agent_credentials", {
          credential_key: parts.credentialKey,
        })
      : null;
  if (
    !parts ||
    !pepper ||
    !credential ||
    !verifyCredential(credential, parts.secret, pepper).ok ||
    !credential.workspace_id
  )
    throw new WorkspaceError("auth_required", "Agent 连接凭据无效。", 401);
  const agent = await first("agents", {
    id: credential.agent_id,
    workspace_id: credential.workspace_id,
  });
  const workspace = await first("workspaces", { id: credential.workspace_id });
  const responsible = agent
    ? await first("workspace_members", {
        user_id: agent.responsible_user_id,
        workspace_id: agent.workspace_id,
        status: "ACTIVE",
      })
    : null;
  if (!agent || agent.status !== "ACTIVE" || !workspace || !responsible)
    throw new WorkspaceError("auth_required", "Agent 连接已停用。", 401);
  return {
    scope: {
      workspace,
      member: responsible,
      user: {
        id: id(responsible.user_id),
        email: id(responsible.email),
        name: id(responsible.display_name),
      },
    },
    agent,
    credential,
  };
}
export async function agentConnect(context: AgentScope) {
  await updateScoped(context.scope, "agents", context.agent.id, {
    connection_status: "AVAILABLE",
    last_connected_at: new Date().toISOString(),
    connection_error: null,
  });
  await updateScoped(
    context.scope,
    "agent_credentials",
    context.credential.id,
    { last_used_at: new Date().toISOString() },
  );
  await appendWorkspaceEvent(context.scope, `agent-connected-${id(context.credential.id)}`, {
    agent_id: context.agent.id,
    actor_agent_id: context.agent.id,
    event_type: "AGENT_CONNECTED",
    summary: `Agent「${id(context.agent.name)}」已确认连接。`,
    structured: { status: "AVAILABLE", credential_id: context.credential.id },
  });
  return {
    identity_resolved: true,
    agent: pick(
      await scopedOne(context.scope, "agents", context.agent.id),
      agentFields,
    ),
    workspace_name: context.scope.workspace.name,
    receipt: await receipt(
      context.scope,
      "agents",
      context.agent,
      { connection_status: "AVAILABLE" },
      "agents",
    ),
  };
}
export async function agentContext(context: AgentScope) {
  const { scope, agent } = context;
  const assigned = await scopedRows(scope, "work_tasks", {
    holder_agent_id: agent.id,
  });
  const ids = new Set(assigned.map((t) => id(t.project_id)));
  const data = await snapshot(scope);
  return {
    agent: pick(agent, agentFields),
    projects: data.projects.filter((p) => ids.has(id(p.id))),
    tasks: data.tasks.filter((t) => sameId(t.holder_agent_id, agent.id)),
    resources: data.resources.filter((r) => ids.has(id(r.project_id))),
    reports: data.reports.filter((r) =>
      assigned.some((t) => sameId(t.id, r.task_id)),
    ),
  };
}
export async function agentProjectAllowed(
  context: AgentScope,
  projectId: unknown,
) {
  if (
    !(
      await scopedRows(context.scope, "work_tasks", {
        project_id: projectId,
        holder_agent_id: context.agent.id,
      })
    ).length
  )
    throw new WorkspaceError("not_found", "找不到此项目。", 404);
}
