import type { HTMLAttributes, ReactNode } from "react";

export type ResourceState = "ready" | "loading" | "empty" | "error" | "permission" | "partial";

export interface ResourcePanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  state?: ResourceState;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}

const DEFAULT_TITLES: Record<Exclude<ResourceState, "ready">, string> = {
  loading: "正在加载",
  empty: "暂无数据",
  error: "加载失败",
  permission: "暂无访问权限",
  partial: "部分数据暂不可用",
};

export function ResourcePanel({
  state = "ready",
  title,
  description,
  action,
  children,
  className = "",
  ...props
}: ResourcePanelProps) {
  if (state === "ready") return <section {...props} className={className}>{children}</section>;
  const role = state === "error" ? "alert" : "status";
  return (
    <section
      {...props}
      className={`dc-resource-panel dc-resource-panel--${state} ${className}`.trim()}
      role={role}
      aria-busy={state === "loading" || undefined}
    >
      {state === "loading" ? <span className="dc-spinner" aria-hidden="true" /> : null}
      <strong>{title || DEFAULT_TITLES[state]}</strong>
      {description ? <span>{description}</span> : null}
      {action ? <div className="dc-resource-action">{action}</div> : null}
      {state === "partial" ? <div className="dc-resource-content">{children}</div> : null}
    </section>
  );
}
