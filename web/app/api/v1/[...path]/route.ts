import {
  authenticate,
  assertOrigin,
  clearCookie,
  optionalUser,
  requireUser,
  sessionToken,
} from "../../../../lib/workspace-v1/auth";
import {
  noco,
  requireScope,
  scopedOne,
  updateScoped,
  WorkspaceError,
  type Row,
} from "../../../../lib/workspace-v1/store";
import * as service from "../../../../lib/workspace-v1/service";
import {
  AttachmentPolicyError,
  MAX_ATTACHMENT_BYTES,
} from "../../../../lib/attachment-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie, Authorization",
      ...headers,
    },
  });
async function boundedBytes(request: Request, limit: number) {
  if (!request.body || Number(request.headers.get("content-length")) > limit)
    throw new WorkspaceError("invalid_input", "内容过大或未提供内容。", 413);
  const reader = request.body.getReader(),
    parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new WorkspaceError("invalid_input", "内容超过大小限制。", 413);
      }
      parts.push(value);
    }
    return Buffer.concat(parts);
  } finally {
    reader.releaseLock();
  }
}
async function jsonBody(request: Request): Promise<Row> {
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    !request.body
  )
    throw new WorkspaceError("invalid_input", "请提交有效的表单。");
  try {
    const body = JSON.parse(
      (await boundedBytes(request, 64 * 1024)).toString("utf8"),
    );
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    return body;
  } catch {
    throw new WorkspaceError("invalid_input", "输入无效或内容过大。", 413);
  }
}
async function uploadBody(request: Request) {
  if (
    Number(request.headers.get("content-length")) >
    MAX_ATTACHMENT_BYTES + 65536
  )
    throw new WorkspaceError("invalid_file", "文件不能超过 25 MB。", 413);
  const bytes = await boundedBytes(request, MAX_ATTACHMENT_BYTES + 65536);
  let form: FormData;
  try {
    form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
  } catch {
    throw new WorkspaceError(
      "invalid_file",
      "文件上传未完成，请重新选择文件。",
    );
  }
  const file = form.get("file");
  if (!(file instanceof File))
    throw new WorkspaceError("invalid_file", "请选择一个文件。");
  return {
    file,
    body: { name: form.get("name"), purpose: form.get("purpose") },
  };
}
async function dispatch(request: Request, path: string[]) {
  const post = request.method === "POST",
    get = request.method === "GET";
  if (path[0] === "auth") {
    if (path.length === 2 && ["login", "register"].includes(path[1]) && post) {
      const result = await authenticate(
        request,
        await jsonBody(request),
        path[1] === "register",
      );
      return response({ user: result.user }, 200, {
        "Set-Cookie": result.cookie,
      });
    }
    if (path[1] === "session" && path.length === 2 && get) {
      const user = await optionalUser(request);
      return response({
        user,
        workspaces: user ? await service.myWorkspaces(user) : [],
      });
    }
    if (path[1] === "logout" && path.length === 2 && post) {
      assertOrigin(request);
      const token = await sessionToken(request);
      if (token)
        await noco("auth:signOut", { token, method: "POST", body: {} });
      return response({ signed_out: true }, 200, {
        "Set-Cookie": clearCookie(),
      });
    }
  }
  if (path[0] === "agent") {
    const context = await service.requireAgent(request);
    if (path[1] === "connect" && path.length === 2 && post)
      return response(await service.agentConnect(context));
    if (path.length === 1 && get)
      return response(await service.agentContext(context));
    if (
      path[1] === "tasks" &&
      path[3] === "results" &&
      path.length === 4 &&
      post
    )
      return response(
        await service.submitResult(
          context.scope,
          path[2],
          await jsonBody(request),
          context.agent.id,
        ),
        201,
      );
    if (
      path[1] === "tasks" &&
      path[3] === "start" &&
      path.length === 4 &&
      post
    ) {
      return response(
        await service.startTask(context.scope, path[2], context.agent.id),
      );
    }
    if (
      path[1] === "projects" &&
      path[3] === "files" &&
      path.length === 4 &&
      post
    ) {
      await service.agentProjectAllowed(context, path[2]);
      const upload = await uploadBody(request);
      return response(
        await service.addResource(
          context.scope,
          path[2],
          upload.body,
          upload.file,
          context.agent.id,
        ),
        201,
      );
    }
    if (
      path[1] === "resources" &&
      path[3] === "download" &&
      path.length === 4 &&
      get
    ) {
      const resource = await scopedOne(
        context.scope,
        "project_resources",
        path[2],
      );
      await service.agentProjectAllowed(context, resource.project_id);
      return service.download(context.scope, path[2]);
    }
    if (path[1] === "error" && path.length === 2 && post) {
      const body = await jsonBody(request);
      await updateScoped(context.scope, "agents", context.agent.id, {
        connection_status: "ERROR",
        connection_error: service.text(body.message, "异常说明", 1000),
      });
      return response({ recorded: true });
    }
  }
  const user = await requireUser(request);
  if (post) assertOrigin(request);
  if (
    path[0] === "invitations" &&
    path[1] === "accept" &&
    path.length === 2 &&
    post
  )
    return response({
      workspace: await service.acceptInvite(
        user,
        (await jsonBody(request)).token,
      ),
    });
  if (path[0] !== "workspaces")
    throw new WorkspaceError("not_found", "找不到此入口。", 404);
  if (path.length === 1) {
    if (get) return response({ workspaces: await service.myWorkspaces(user) });
    if (post)
      return response(
        {
          workspace: await service.createWorkspace(
            user,
            await jsonBody(request),
          ),
        },
        201,
      );
  }
  const scope = await requireScope(path[1], user);
  if (path.length === 2 && get) return response(await service.snapshot(scope));
  if (path.length === 3 && post) {
    const body = await jsonBody(request);
    if (path[2] === "setup") {
      await service.setup(scope, body);
      return response({ saved: true });
    }
    if (path[2] === "invitations")
      return response(await service.invite(scope, body), 201);
    if (path[2] === "agents")
      return response(await service.registerAgent(scope, body), 201);
    if (path[2] === "projects")
      return response(await service.createProject(scope, body), 201);
  }
  if (
    path[2] === "invitations" &&
    path[4] === "revoke" &&
    path.length === 5 &&
    post
  ) {
    return response(await service.revokeInvitation(scope, path[3]));
  }
  if (
    path[2] === "agents" &&
    path[4] === "profile" &&
    path.length === 5 &&
    post
  )
    return response(
      await service.editAgent(scope, path[3], await jsonBody(request)),
    );
  if (
    path[2] === "agents" &&
    ["connect", "revoke"].includes(path[4]) &&
    path.length === 5 &&
    post
  )
    return response(await service.agentConnection(scope, path[3], path[4]));
  if (path[2] === "projects" && path.length === 5 && post) {
    if (path[4] === "files") {
      const upload = await uploadBody(request);
      return response(
        await service.addResource(scope, path[3], upload.body, upload.file),
        201,
      );
    }
    const body = await jsonBody(request);
    if (path[4] === "participants")
      return response(await service.addParticipant(scope, path[3], body), 201);
    if (path[4] === "resources")
      return response(await service.addResource(scope, path[3], body), 201);
    if (path[4] === "tasks")
      return response(await service.createTask(scope, path[3], body), 201);
    if (path[4] === "state")
      return response(await service.projectChange(scope, path[3], body), 201);
  }
  if (path[2] === "tasks" && path[4] === "results" && path.length === 5 && post)
    return response(
      await service.submitResult(scope, path[3], await jsonBody(request)),
      201,
    );
  if (path[2] === "tasks" && path[4] === "start" && path.length === 5 && post)
    return response(await service.startTask(scope, path[3]));
  if (
    path[2] === "reports" &&
    path[4] === "review" &&
    path.length === 5 &&
    post
  )
    return response(
      await service.reviewResult(scope, path[3], await jsonBody(request)),
      201,
    );
  if (
    path[2] === "resources" &&
    path[4] === "download" &&
    path.length === 5 &&
    get
  )
    return service.download(scope, path[3]);
  throw new WorkspaceError("not_found", "找不到此入口。", 404);
}
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    return await dispatch(request, (await context.params).path);
  } catch (error) {
    if (error instanceof WorkspaceError)
      return response({ error: error.message, code: error.code }, error.status);
    if (error instanceof AttachmentPolicyError)
      return response(
        {
          error:
            "文件格式或大小不符合要求，请使用 25 MB 以内的文档、图片或压缩包。",
          code: "invalid_file",
        },
        error.status,
      );
    console.error(
      "Workspace request failed",
      error instanceof Error ? error.name : "unknown",
    );
    return response(
      {
        error: "操作暂时未完成，请刷新检查后重试。",
        code: "service_unavailable",
      },
      503,
    );
  }
}
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return handle(request, context);
}
export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return handle(request, context);
}
