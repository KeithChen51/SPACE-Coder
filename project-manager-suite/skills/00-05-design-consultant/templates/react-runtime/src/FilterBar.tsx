import { useState, type FormEventHandler, type ReactNode } from "react";
import { Button } from "./Button";

export interface FilterBarProps {
  children: ReactNode;
  resultSummary?: ReactNode;
  dirty?: boolean;
  submitting?: boolean;
  submitLabel?: string;
  resetLabel?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  onReset?: FormEventHandler<HTMLFormElement>;
  className?: string;
}

export function FilterBar({
  children,
  resultSummary,
  dirty = false,
  submitting = false,
  submitLabel = "查询",
  resetLabel = "重置筛选",
  collapsible = true,
  defaultExpanded = true,
  onSubmit,
  onReset,
  className = "",
}: FilterBarProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <form
      className={`dc-filter-bar ${className}`.trim()}
      data-dirty={dirty || undefined}
      data-expanded={expanded || undefined}
      aria-busy={submitting || undefined}
      onSubmit={onSubmit}
      onReset={onReset}
    >
      {collapsible ? (
        <button className="dc-filter-bar__toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          <span>筛选条件</span><span aria-hidden="true">{expanded ? "收起" : "展开"}</span>
        </button>
      ) : null}
      <div className="dc-filter-bar__body">
        <div className="dc-filter-bar__fields">{children}</div>
        <div className="dc-filter-bar__actions">
          <Button type="submit" size="small" loading={submitting} loadingLabel="查询中">{submitLabel}</Button>
          <Button type="reset" size="small" variant="ghost" disabled={!dirty || submitting}>{resetLabel}</Button>
        </div>
      </div>
      {resultSummary ? <div className="dc-filter-bar__summary" aria-live="polite">{resultSummary}</div> : null}
    </form>
  );
}
