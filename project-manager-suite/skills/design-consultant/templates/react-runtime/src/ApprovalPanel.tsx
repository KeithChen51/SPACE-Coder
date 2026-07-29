import { useId, type ReactNode } from "react";
import { Button } from "./Button";
import { StatusBadge, type StatusBadgeProps } from "./StatusBadge";

export type ApprovalStatus = "waiting" | "approved" | "rejected" | "expired" | "submitting";

export interface ApprovalPanelProps {
  status: ApprovalStatus;
  title: ReactNode;
  description: ReactNode;
  details?: ReactNode;
  approveLabel?: string;
  rejectLabel?: string;
  onApprove?: () => void;
  onReject?: () => void;
  className?: string;
}

const statusMeta: Record<ApprovalStatus, { label: string; tone: StatusBadgeProps["tone"] }> = {
  waiting: { label: "待决策", tone: "warning" },
  approved: { label: "已批准", tone: "success" },
  rejected: { label: "已退回", tone: "danger" },
  expired: { label: "已失效", tone: "neutral" },
  submitting: { label: "提交中", tone: "info" },
};

export function ApprovalPanel({
  status,
  title,
  description,
  details,
  approveLabel = "批准",
  rejectLabel = "退回",
  onApprove,
  onReject,
  className = "",
}: ApprovalPanelProps) {
  const titleId = `dc-approval-${useId()}`;
  const pending = status === "waiting" || status === "submitting";
  const meta = statusMeta[status];
  return (
    <section className={`dc-approval-panel dc-approval-panel--${status} ${className}`.trim()} aria-labelledby={titleId} data-status={status}>
      <div className="dc-approval-panel__marker" aria-hidden="true" />
      <div className="dc-approval-panel__body">
        <div className="dc-approval-panel__meta">
          <p className="dc-approval-panel__eyebrow">需要决策</p>
          <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
        </div>
        <h3 id={titleId}>{title}</h3>
        <p className="dc-approval-panel__description">{description}</p>
        {details ? <div className="dc-approval-panel__details">{details}</div> : null}
      </div>
      {pending && (onApprove || onReject) ? (
        <div className="dc-approval-panel__actions">
          {onReject ? <Button size="small" variant="secondary" onClick={onReject} disabled={status === "submitting"}>{rejectLabel}</Button> : null}
          {onApprove ? <Button size="small" onClick={onApprove} loading={status === "submitting"} loadingLabel="提交中">{approveLabel}</Button> : null}
        </div>
      ) : null}
    </section>
  );
}
