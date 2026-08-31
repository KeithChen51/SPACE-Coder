import { useId, useState, type HTMLAttributes, type Key, type ReactNode } from "react";

export interface MobileRecordField {
  id?: Key;
  label: ReactNode;
  value: ReactNode;
  emphasis?: boolean;
}

export interface MobileRecordCardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  fields: MobileRecordField[];
  actions?: ReactNode;
  selectable?: boolean;
  selected?: boolean;
  defaultSelected?: boolean;
  selectionLabel?: string;
  onSelectionChange?: (selected: boolean) => void;
  loading?: boolean;
}

export function MobileRecordCard({
  title,
  meta,
  status,
  fields,
  actions,
  selectable = false,
  selected,
  defaultSelected = false,
  selectionLabel = "选择当前记录",
  onSelectionChange,
  loading = false,
  className = "",
  ...props
}: MobileRecordCardProps) {
  const titleId = `dc-mobile-record-${useId()}`;
  const [internalSelected, setInternalSelected] = useState(defaultSelected);
  const activeSelected = selected ?? internalSelected;
  const changeSelection = (next: boolean) => {
    if (selected === undefined) setInternalSelected(next);
    onSelectionChange?.(next);
  };

  if (loading) {
    return (
      <article {...props} className={`dc-mobile-record-card dc-mobile-record-card--loading ${className}`.trim()} aria-busy="true" aria-label="正在加载记录">
        <span className="dc-mobile-record-card__skeleton" data-width="short" />
        <span className="dc-mobile-record-card__skeleton" />
        <span className="dc-mobile-record-card__skeleton" data-width="medium" />
      </article>
    );
  }

  return (
    <article {...props} className={`dc-mobile-record-card ${className}`.trim()} aria-labelledby={titleId} data-selected={activeSelected || undefined}>
      <header className="dc-mobile-record-card__header">
        {selectable ? (
          <label className="dc-mobile-record-card__selection">
            <input type="checkbox" checked={activeSelected} aria-label={selectionLabel} onChange={(event) => changeSelection(event.target.checked)} />
            <span aria-hidden="true" />
          </label>
        ) : null}
        <div className="dc-mobile-record-card__identity">
          <h3 id={titleId}>{title}</h3>
          {meta ? <p>{meta}</p> : null}
        </div>
        {status ? <div className="dc-mobile-record-card__status">{status}</div> : null}
      </header>
      {fields.length > 0 ? (
        <dl className="dc-mobile-record-card__fields">
          {fields.map((field, index) => (
            <div key={field.id ?? index} data-emphasis={field.emphasis || undefined}>
              <dt>{field.label}</dt><dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="dc-mobile-record-card__empty" role="status">暂无记录详情</p>}
      {actions ? <footer className="dc-mobile-record-card__actions">{actions}</footer> : null}
    </article>
  );
}
