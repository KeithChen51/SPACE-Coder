import { useEffect, useId, useMemo, useRef, useState, type Key, type ReactNode } from "react";

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  accessor?: keyof Row;
  render?: (row: Row) => ReactNode;
  align?: "start" | "center" | "end";
  numeric?: boolean;
  sortable?: boolean;
  sortLabel?: string;
  sortDirection?: "ascending" | "descending" | "none";
  width?: string | number;
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: keyof Row | ((row: Row, index: number) => Key);
  caption?: ReactNode;
  state?: "ready" | "loading" | "empty" | "error" | "permission" | "partial";
  emptyMessage?: ReactNode;
  onSort?: (columnId: string, direction: "ascending" | "descending") => void;
  density?: "comfortable" | "compact";
  stickyHeader?: boolean;
  selectionMode?: "none" | "single" | "multiple";
  selectedKeys?: ReadonlySet<Key>;
  defaultSelectedKeys?: Iterable<Key>;
  onSelectionChange?: (keys: Set<Key>) => void;
  getRowLabel?: (row: Row, index: number) => string;
  renderRowActions?: (row: Row) => ReactNode;
  actionsHeader?: ReactNode;
}

function SelectionControl({
  type,
  checked,
  indeterminate = false,
  label,
  name,
  onChange,
}: {
  type: "checkbox" | "radio";
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  name?: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className="dc-table-selection-control">
      <input ref={ref} type={type} name={name} checked={checked} aria-label={label} onChange={onChange} />
      <span aria-hidden="true" />
    </label>
  );
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  state = "ready",
  emptyMessage = "暂无数据",
  onSort,
  density = "comfortable",
  stickyHeader = false,
  selectionMode = "none",
  selectedKeys,
  defaultSelectedKeys,
  onSelectionChange,
  getRowLabel,
  renderRowActions,
  actionsHeader = "操作",
}: DataTableProps<Row>) {
  const selectionName = `dc-table-selection-${useId()}`;
  const [internalSelection, setInternalSelection] = useState<Set<Key>>(() => new Set(defaultSelectedKeys));
  const activeSelection = useMemo(() => new Set(selectedKeys ?? internalSelection), [selectedKeys, internalSelection]);

  if (state !== "ready" && state !== "partial") {
    const messages = {
      loading: "正在加载表格",
      empty: emptyMessage,
      error: "表格加载失败",
      permission: "暂无表格访问权限",
    };
    return <div className={`dc-resource-panel dc-resource-panel--${state}`} role={state === "error" ? "alert" : "status"}>{messages[state]}</div>;
  }
  if (rows.length === 0) return <div className="dc-resource-panel dc-resource-panel--empty" role="status">{emptyMessage}</div>;

  const resolveKey = (row: Row, index: number): Key => (
    typeof rowKey === "function" ? rowKey(row, index) : String(row[rowKey])
  );
  const rowEntries = rows.map((row, index) => ({ row, index, key: resolveKey(row, index) }));
  const currentKeys = rowEntries.map((entry) => entry.key);
  const selectedOnPage = currentKeys.filter((key) => activeSelection.has(key)).length;
  const allSelected = currentKeys.length > 0 && selectedOnPage === currentKeys.length;
  const partlySelected = selectedOnPage > 0 && !allSelected;
  const updateSelection = (next: Set<Key>) => {
    if (selectedKeys === undefined) setInternalSelection(next);
    onSelectionChange?.(next);
  };
  const toggleRow = (key: Key) => {
    const next = new Set(activeSelection);
    if (selectionMode === "single") next.clear();
    if (activeSelection.has(key)) next.delete(key);
    else next.add(key);
    updateSelection(next);
  };
  const togglePage = () => {
    const next = new Set(activeSelection);
    if (allSelected) currentKeys.forEach((key) => next.delete(key));
    else currentKeys.forEach((key) => next.add(key));
    updateSelection(next);
  };

  return (
    <div className="dc-table-wrap" data-density={density} data-sticky-header={stickyHeader || undefined}>
      <table className="dc-data-table">
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {selectionMode !== "none" ? (
              <th className="dc-table-selection-cell" scope="col">
                {selectionMode === "multiple" ? <SelectionControl type="checkbox" checked={allSelected} indeterminate={partlySelected} label="选择当前页全部记录" onChange={togglePage} /> : <span className="dc-sr-only">选择</span>}
              </th>
            ) : null}
            {columns.map((column) => {
              const align = column.align || (column.numeric ? "end" : "start");
              const sortName = column.sortLabel || (typeof column.header === "string" ? column.header : "此列");
              const nextDirection = column.sortDirection === "ascending" ? "descending" : "ascending";
              return (
                <th key={column.id} scope="col" aria-sort={column.sortDirection} className={`dc-align-${align}`} style={{ width: column.width }}>
                  {column.sortable && onSort ? (
                    <button
                      className={`dc-table-sort dc-align-${align}`}
                      type="button"
                      aria-label={`按${sortName}${nextDirection === "ascending" ? "升序" : "降序"}排列`}
                      onClick={() => onSort(column.id, nextDirection)}
                    >
                      <span>{column.header}</span>
                      <span className="dc-table-sort__indicator" aria-hidden="true">
                        {column.sortDirection === "ascending" ? "↑" : column.sortDirection === "descending" ? "↓" : "↕"}
                      </span>
                    </button>
                  ) : column.header}
                </th>
              );
            })}
            {renderRowActions ? <th className="dc-align-end dc-table-actions-cell" scope="col">{actionsHeader}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rowEntries.map(({ row, index, key }) => {
            const selected = activeSelection.has(key);
            const rowLabel = getRowLabel?.(row, index) || `第 ${index + 1} 行`;
            return (
              <tr key={key} aria-selected={selectionMode !== "none" ? selected : undefined} data-selected={selected || undefined}>
                {selectionMode !== "none" ? (
                  <td className="dc-table-selection-cell">
                    <SelectionControl
                      type={selectionMode === "single" ? "radio" : "checkbox"}
                      name={selectionMode === "single" ? selectionName : undefined}
                      checked={selected}
                      label={`选择${rowLabel}`}
                      onChange={() => toggleRow(key)}
                    />
                  </td>
                ) : null}
                {columns.map((column) => {
                  const value = column.render ? column.render(row) : column.accessor ? row[column.accessor] as ReactNode : null;
                  return <td key={column.id} className={`dc-align-${column.align || (column.numeric ? "end" : "start")}`}>{value}</td>;
                })}
                {renderRowActions ? <td className="dc-align-end dc-table-actions-cell">{renderRowActions(row)}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {state === "partial" ? <p className="dc-table-notice" role="status">部分数据暂不可用</p> : null}
    </div>
  );
}
