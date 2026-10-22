import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { sessionKey } from "../owner-auth/session";
import { rateLimiter } from "../owner-auth/login-rate-limit";
import {
  backendUrl,
  noco,
  WorkspaceError,
  type Row,
  type User,
  id,
} from "./store";

const SECONDS = 7 * 24 * 60 * 60;
const AAD = Buffer.from("songguo:workspace-session:v1");
const workspaceSessionKey = () =>
  sessionKey(
    process.env.AISYS_WORKSPACE_SESSION_KEY_FILE ||
      process.env.AISYS_OWNER_SESSION_KEY_FILE ||
      "",
  );
export function appOrigin() {
  try {
    const url = new URL(process.env.AISYS_PUBLIC_BASE_URL || "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new WorkspaceError(
      "service_unavailable",
      "工作空间地址尚未正确配置。",
      503,
    );
  }
}
function cookieConfig() {
  const secure = appOrigin().startsWith("https:");
  if (!secure && process.env.AISYS_ALLOW_INSECURE_LOCAL_AUTH !== "true")
    throw new WorkspaceError("service_unavailable", "登录需要安全连接。", 503);
  return {
    name: secure ? "__Host-songguo_session" : "songguo_local_session",
    flags: "Path=/; HttpOnly; SameSite=Lax" + (secure ? "; Secure" : ""),
  };
}
export function assertOrigin(request: Request) {
  if (
    request.headers.get("origin") !== appOrigin() ||
    ["cross-site", "same-site"].includes(
      request.headers.get("sec-fetch-site") || "",
    )
  )
    throw new WorkspaceError(
      "origin_rejected",
      "请从松果工作空间页面执行此操作。",
      403,
    );
}
export async function sessionCookie(token: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", await workspaceSessionKey(), iv);
  cipher.setAAD(AAD);
  const now = Date.now();
  const encrypted = Buffer.concat([
    cipher.update(
      JSON.stringify({ token, issuedAt: now, expiresAt: now + SECONDS * 1000 }),
    ),
    cipher.final(),
  ]);
  const value = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
  const config = cookieConfig();
  return `${config.name}=${value}; ${config.flags}; Max-Age=${SECONDS}`;
}
export function clearCookie() {
  const config = cookieConfig();
  return `${config.name}=; ${config.flags}; Max-Age=0`;
}
export async function sessionToken(request: Request): Promise<string | null> {
  const config = cookieConfig();
  const found = (request.headers.get("cookie") || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(config.name + "="));
  if (!found.length) return null;
  if (found.length !== 1)
    throw new WorkspaceError("auth_required", "请重新登录。", 401);
  try {
    const value = found[0].slice(config.name.length + 1);
    if (!/^[A-Za-z0-9_-]{40,6000}$/.test(value)) throw new Error();
    const bytes = Buffer.from(value, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      await workspaceSessionKey(),
      bytes.subarray(0, 12),
    );
    decipher.setAAD(AAD);
    decipher.setAuthTag(bytes.subarray(12, 28));
    const data = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString(),
    );
    const now = Date.now();
    if (
      typeof data.token !== "string" ||
      data.token.length > 4000 ||
      !Number.isSafeInteger(data.issuedAt) ||
      !Number.isSafeInteger(data.expiresAt) ||
      data.issuedAt > now ||
      data.expiresAt <= now ||
      data.expiresAt - data.issuedAt !== SECONDS * 1000
    )
      throw new Error();
    return data.token;
  } catch {
    throw new WorkspaceError("auth_required", "登录已过期，请重新登录。", 401);
  }
}
export async function userFromToken(token: string): Promise<User> {
  const payload = await noco("auth:check", { token });
  const data = payload.data as Row;
  const row =
    data?.user && typeof data.user === "object" ? (data.user as Row) : data;
  if (!row?.id || !row.email)
    throw new WorkspaceError(
      "auth_required",
      "请使用有邮箱的账号重新登录。",
      401,
    );
  return {
    id: id(row.id),
    email: id(row.email).trim().toLowerCase(),
    name: id(row.nickname || row.username || row.email),
  };
}
export async function requireUser(request: Request) {
  const token = await sessionToken(request);
  if (!token)
    throw new WorkspaceError("auth_required", "请先登录你的账号。", 401);
  return userFromToken(token);
}
export async function optionalUser(request: Request) {
  const token = await sessionToken(request);
  if (!token) return null;
  return userFromToken(token);
}
export function email(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  )
    throw new WorkspaceError("invalid_email", "请输入有效邮箱。");
  return value.trim().toLowerCase();
}
export async function authenticate(
  request: Request,
  body: Row,
  signup: boolean,
) {
  assertOrigin(request);
  const account = email(body.email);
  if (
    typeof body.password !== "string" ||
    body.password.length > 256 ||
    body.password.length < (signup ? 12 : 1)
  )
    throw new WorkspaceError(
      "invalid_password",
      signup ? "密码至少需要 12 个字符。" : "请输入密码。",
    );
  if (
    signup &&
    (typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 80)
  )
    throw new WorkspaceError("invalid_name", "请填写姓名，最多 80 个字符。");
  await workspaceSessionKey();
  cookieConfig(); // Verify configuration before account writes.
  if (rateLimiter.checkLocked(request, account).locked)
    throw new WorkspaceError("rate_limited", "尝试次数过多，请稍后再试。", 429);
  try {
    if (signup) {
      // NocoBase performs account validation and password hashing. No duplicate
      // password store or custom identity provider is introduced.
      const response = await fetch(backendUrl() + "/api/auth:signUp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Authenticator": "basic",
        },
        body: JSON.stringify({
          email: account,
          username: "sg_" + randomBytes(12).toString("hex"),
          password: body.password,
          confirm_password: body.password,
          nickname: id(body.name).trim(),
        }),
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok)
        throw new WorkspaceError(
          "signup_rejected",
          "注册未完成。邮箱可能已注册，请尝试登录。",
          response.status >= 500 ? 503 : 409,
        );
    }
    const response = await fetch(backendUrl() + "/api/auth:signIn", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authenticator": "basic",
      },
      body: JSON.stringify({ account, password: body.password }),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.data?.token !== "string")
      throw new WorkspaceError("login_rejected", "邮箱或密码不正确。", 401);
    const user = await userFromToken(payload.data.token);
    rateLimiter.recordSuccess(request, account);
    return { user, cookie: await sessionCookie(payload.data.token) };
  } catch (error) {
    rateLimiter.recordFailure(request, account);
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError(
      "service_unavailable",
      "账号服务暂时不可用，请稍后重试。",
      503,
    );
  }
}
