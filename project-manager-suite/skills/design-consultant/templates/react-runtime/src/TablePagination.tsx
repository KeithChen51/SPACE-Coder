import type { ChangeEvent } from "react";

export interface TablePaginationProps {
  page: number;
  totalPages: number;
  totalItems?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  loading?: boolean;
  className?: string;
  label?: string;
}

function pageItems(page: number, totalPages: number): Array<number | "ellipsis-start" | "ellipsis-end"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const visible = new Set([1, totalPages, page - 1, page, page + 1].filter((value) => value >= 1 && value <= totalPages));
  const pages = [...visible].sort((a, b) => a - b);
  const result: Array<number | "ellipsis-start" | "ellipsis-end"> = [];
  pages.forEach((value, index) => {
    const previous = pages[index - 1];
    if (previous && value - previous > 1) result.push(previous === 1 ? "ellipsis-start" : "ellipsis-end");
    result.push(value);
  });
  return result;
}

export function TablePagination({
  page,
  totalPages,
  totalItems,
  pageSize = 20,
  pageSizeOptions = [20, 50, 100],
  onPageChange,
  onPageSizeChange,
  loading = false,
  className = "",
  label = "表格分页",
}: TablePaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);
  const start = typeof totalItems === "number" && totalItems > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const end = typeof totalItems === "number" ? Math.min(safePage * pageSize, totalItems) : 0;
  const changeSize = (event: ChangeEvent<HTMLSelectElement>) => onPageSizeChange?.(Number(event.target.value));

  return (
    <nav className={`dc-pagination ${className}`.trim()} aria-label={label} aria-busy={loading || undefined}>
      <div className="dc-pagination__summary">
        {typeof totalItems === "number" ? `第 ${start}–${end} 条，共 ${totalItems} 条` : `第 ${safePage} / ${safeTotalPages} 页`}
      </div>
      <div className="dc-pagination__controls">
        <button type="button" className="dc-pagination__button" aria-label="上一页" disabled={loading || safePage <= 1} onClick={() => onPageChange(safePage - 1)}>‹</button>
        <div className="dc-pagination__pages">
          {pageItems(safePage, safeTotalPages).map((item) => typeof item === "number" ? (
            <button
              key={item}
              type="button"
              className="dc-pagination__button"
              aria-label={`第 ${item} 页`}
              aria-current={item === safePage ? "page" : undefined}
              disabled={loading}
              onClick={() => onPageChange(item)}
            >{item}</button>
          ) : <span className="dc-pagination__ellipsis" aria-hidden="true" key={item}>…</span>)}
        </div>
        <button type="button" className="dc-pagination__button" aria-label="下一页" disabled={loading || safePage >= safeTotalPages} onClick={() => onPageChange(safePage + 1)}>›</button>
      </div>
      {onPageSizeChange ? (
        <label className="dc-pagination__size">
          <span>每页</span>
          <select value={pageSize} onChange={changeSize} disabled={loading} aria-label="每页条数">
            {pageSizeOptions.map((option) => <option key={option} value={option}>{option} 条</option>)}
          </select>
        </label>
      ) : null}
    </nav>
  );
}
