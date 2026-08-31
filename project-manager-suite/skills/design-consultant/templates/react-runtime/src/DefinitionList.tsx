import type { HTMLAttributes, Key, ReactNode } from "react";

export interface DefinitionListItem {
  id?: Key;
  term: ReactNode;
  description: ReactNode;
}

export interface DefinitionListProps extends Omit<HTMLAttributes<HTMLDListElement>, "children"> {
  items: DefinitionListItem[];
  columns?: 1 | 2;
  emptyMessage?: ReactNode;
}

export function DefinitionList({ items, columns = 1, emptyMessage = "暂无详情", className = "", ...props }: DefinitionListProps) {
  if (items.length === 0) return <div className={`dc-definition-list__empty ${className}`.trim()} role="status">{emptyMessage}</div>;
  return (
    <dl {...props} className={`dc-definition-list ${className}`.trim()} data-columns={columns}>
      {items.map((item, index) => (
        <div className="dc-definition-list__item" key={item.id ?? index}>
          <dt>{item.term}</dt>
          <dd>{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}
