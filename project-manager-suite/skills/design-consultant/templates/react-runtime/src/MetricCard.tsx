import { useId, type ReactNode } from "react";
import { Tooltip } from "./Tooltip";

export interface MetricCardProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  href?: string;
  linkLabel?: string;
  loading?: boolean;
  className?: string;
}

export function MetricCard({
  label,
  value,
  unit,
  description,
  meta,
  href,
  linkLabel,
  loading = false,
  className = "",
}: MetricCardProps) {
  const generatedId = useId();
  const labelId = `dc-metric-card-${generatedId}-label`;
  const accessibleLabel = typeof label === "string" ? label : "指标";

  return (
    <article
      className={`dc-metric-card ${href ? "dc-metric-card--linked" : ""} ${className}`.trim()}
      aria-labelledby={labelId}
      aria-busy={loading || undefined}
    >
      <header className="dc-metric-card__header">
        <span className="dc-metric-card__label" id={labelId}>{label}</span>
        {description ? (
          <Tooltip content={description} delay={0}>
            <button className="dc-metric-card__explanation" type="button" aria-label={`查看${accessibleLabel}口径`}>
              <span aria-hidden="true">i</span>
            </button>
          </Tooltip>
        ) : null}
      </header>
      {loading ? (
        <div className="dc-metric-card__loading" aria-hidden="true">
          <span className="dc-metric-card__skeleton dc-metric-card__skeleton--value" />
          <span className="dc-metric-card__skeleton dc-metric-card__skeleton--meta" />
        </div>
      ) : (
        <>
          <div className="dc-metric-card__value">
            <strong>{value}</strong>
            {unit ? <span>{unit}</span> : null}
          </div>
          <footer className="dc-metric-card__footer">
            <span className="dc-metric-card__meta">{meta}</span>
            {href ? <a href={href} aria-label={linkLabel || `查看${accessibleLabel}详情`}>{linkLabel || "查看详情"}<span aria-hidden="true"> →</span></a> : null}
          </footer>
        </>
      )}
    </article>
  );
}
