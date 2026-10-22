import "server-only";

export type Row = Record<string, unknown>;
export class WorkspaceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const id = (value: unknown) => (value == null ? "" : String(value));
export const sameId = (a: unknown, b: unknown) =>
  Boolean(id(a)) && id(a) === id(b);

export function backendUrl() {
  const value = process.env.NOCOBASE_URL;
  if (!value)
    throw new WorkspaceError(
      "service_unavailable",
      "工作空间服务暂时不可用，请稍后重试。",
      503,
    );
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new WorkspaceError(
      "service_unavailable",
      "工作空间服务配置无效。",
      503,
    );
  return url.toString().replace(/\/$/, "");
}
export function bridgeToken() {
  const token = process.env.NOCOBASE_WORKSPACE_API_TOKEN;
  if (!token)
    throw new WorkspaceError(
      "service_unavailable",
      "工作空间服务尚未完成配置。",
      503,
    );
  return token;
}
export async function noco(
  path: string,
  options: {
    token?: string;
    method?: string;
    body?: unknown;
    query?: Record<string, string>;
    role?: string;
  } = {},
): Promise<Row> {
  const url = new URL(backendUrl() + "/api/" + path);
  for (const [key, value] of Object.entries(options.query || {}))
    url.searchParams.set(key, value);
  const service = options.token === undefined;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      "X-Authenticator": "basic",
      Authorization: "Bearer " + (options.token ?? bridgeToken()),
      ...(service
        ? { "X-Role": "songguo-workspace-service" }
        : options.role
          ? { "X-Role": options.role }
          : {}),
      ...(options.body instanceof FormData
        ? {}
        : options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
    },
    ...(options.body !== undefined
      ? {
          body:
            options.body instanceof FormData
              ? options.body
              : JSON.stringify(options.body),
        }
      : {}),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  }).catch(() => {
    throw new WorkspaceError(
      "service_unavailable",
      "暂时无法连接工作空间服务，输入已保留。",
      503,
    );
  });
  const result = (await response.json().catch(() => ({}))) as Row;
  if (!response.ok) {
    const errors = result.errors as Row[] | undefined;
    const code = id(errors?.[0]?.code);
    // SQL details, upstream URLs and service identities never reach a visitor.
    if (response.status === 401)
      throw new WorkspaceError(
        "auth_required",
        "登录已过期，请重新登录。",
        401,
      );
    if (
      code.includes("Unique") ||
      /unique|already exists|duplicate/i.test(id(errors?.[0]?.message))
    )
      throw new WorkspaceError(
        "conflict",
        "记录已存在或已被处理，请刷新后重试。",
        409,
      );
    throw new WorkspaceError(
      "backend_rejected",
      "操作未完成，请检查输入或稍后重试。",
      response.status < 500 ? 400 : 503,
    );
  }
  return result;
}
export async function rows(
  collection: string,
  filters: Row = {},
  appends: string[] = [],
): Promise<Row[]> {
  const query: Record<string, string> = { paginate: "false", sort: "id" };
  for (const [key, value] of Object.entries(filters))
    query["filter[" + key + "]"] = id(value);
  if (appends.length) query.appends = appends.join(",");
  const result = await noco(collection + ":list", { query });
  return Array.isArray(result.data) ? (result.data as Row[]) : [];
}
export async function first(collection: string, filters: Row) {
  return (await rows(collection, filters))[0] || null;
}
export async function create(collection: string, body: Row): Promise<Row> {
  const result = await noco(collection + ":create", { method: "POST", body });
  const row = result.data as Row;
  if (!row?.id)
    throw new WorkspaceError(
      "write_incomplete",
      "记录尚未确认保存，请刷新检查后重试。",
      503,
    );
  return row;
}
export async function update(
  collection: string,
  rowId: unknown,
  body: Row,
  filters: Row = {},
): Promise<Row> {
  const query: Record<string, string> = { filterByTk: id(rowId) };
  for (const [key, value] of Object.entries(filters))
    query["filter[" + key + "]"] = id(value);
  const result = await noco(collection + ":update", {
    method: "POST",
    query,
    body,
  });
  return (Array.isArray(result.data) ? result.data[0] : result.data) as Row;
}

export interface User {
  id: string;
  email: string;
  name: string;
}
export interface Scope {
  workspace: Row;
  member: Row;
  user: User;
}
export async function requireScope(
  workspaceKey: string,
  user: User,
): Promise<Scope> {
  const workspace = await first("workspaces", { workspace_key: workspaceKey });
  const member = workspace
    ? await first("workspace_members", {
        workspace_id: workspace.id,
        user_id: user.id,
        status: "ACTIVE",
      })
    : null;
  if (!workspace || !member)
    throw new WorkspaceError(
      "not_found",
      "找不到此工作空间或你没有访问权限。",
      404,
    );
  return { workspace, member, user };
}
export function requireWorkspaceOwner(scope: Scope) {
  if (
    scope.member.role !== "OWNER" ||
    !sameId(scope.workspace.owner_user_id, scope.user.id)
  )
    throw new WorkspaceError("forbidden", "此操作需要工作空间负责人。", 403);
}
export async function scopedRows(
  scope: Scope,
  collection: string,
  filters: Row = {},
  appends: string[] = [],
) {
  return rows(
    collection,
    { ...filters, workspace_id: scope.workspace.id },
    appends,
  );
}
export async function scopedOne(
  scope: Scope,
  collection: string,
  rowId: unknown,
) {
  const row = (await scopedRows(scope, collection, { id: rowId }))[0];
  if (!row)
    throw new WorkspaceError(
      "not_found",
      "找不到此记录或你没有访问权限。",
      404,
    );
  return row;
}
export async function createScoped(
  scope: Scope,
  collection: string,
  body: Row,
) {
  return create(collection, { ...body, workspace_id: scope.workspace.id });
}
export async function updateScoped(
  scope: Scope,
  collection: string,
  rowId: unknown,
  body: Row,
) {
  await scopedOne(scope, collection, rowId);
  return update(collection, rowId, body, { workspace_id: scope.workspace.id });
}
