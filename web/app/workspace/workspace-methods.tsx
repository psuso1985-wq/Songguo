import Link from "next/link";
import { methods } from "../../lib/management-methods";

// The public workspace shows a read-only method catalog, not an Agent execution surface.
export function WorkspaceMethodsGuide({
  returnHref,
  returnLabel,
}: {
  returnHref: string;
  returnLabel: string;
}) {
  return (
    <div className="ws-method-guide">
      <p className="ws-muted">
        先选择合适的分析方法，再把可核查的结果作为项目资料或工作成果提交。
        查看提示词不会触发 AI 执行；Agent 必须先实际连接并获得项目授权。
      </p>
      <p>
        <Link className="ws-secondary ws-button" href={returnHref}>
          ← {returnLabel}
        </Link>
      </p>
      <div className="ws-method-grid">
        {methods.map((method) => (
          <article className="ws-method-card" key={method.slug} id={"method-" + method.slug}>
            <h3>{method.title}</h3>
            <p className="ws-pre">{method.whenUse}</p>
            <p className="ws-method-label">参考提示词（可选中复制）</p>
            <pre className="ws-method-prompt">{method.prompt}</pre>
          </article>
        ))}
      </div>
      <p className="ws-muted">
        分析结果是否采用、项目阶段是否更新、成果是否验收，都由工作空间内有权限的人决定。
        不凭空生成工期、项目进度或工作结果。
      </p>
    </div>
  );
}
