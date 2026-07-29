import { useEffect, useMemo, useRef, useState, type CSSProperties, type Key, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  ActionMenu,
  ApprovalPanel,
  BrandAttribution,
  Button,
  CheckboxField,
  CheckboxGroupField,
  DataTable,
  DefinitionList,
  Dialog,
  FieldShell,
  FilterBar,
  IconButton,
  InlineNotice,
  MetricCard,
  MobileRecordCard,
  MultiSelectField,
  NumberField,
  PopoverCard,
  RadioGroupField,
  ResourcePanel,
  SearchableSelect,
  SelectField,
  StatusBadge,
  SwitchField,
  TablePagination,
  TertiaryNav,
  TextAreaField,
  TextField,
  ToastViewport,
  Tooltip,
  feedbackQueue,
} from "@design-consultant/runtime";

type ComponentOrigin = "existing" | "adapter" | "design-consultant";
type ComponentAvailability = "runtime-ready" | "evidence-only" | "contract-only" | "external-required";
declare const __DC_COMPONENT_PROVENANCE__: Readonly<Record<string, ComponentOrigin>>;
declare const __DC_COMPONENT_AVAILABILITY__: ReadonlyArray<Readonly<{ id: string; name: string; availability: ComponentAvailability }>>;

declare global {
  interface Window {
    __DC_CATALOG__?: {
      visualizationRoot?: string;
    };
  }
}

type Palette = "harbor" | "coral";
type Theme = "light" | "dark";
type Density = "comfortable" | "compact";

function componentOrigin(exportName: string): ComponentOrigin | undefined {
  switch (exportName) {
    case "BrandAttribution": return __DC_COMPONENT_PROVENANCE__.BrandAttribution;
    case "Button": return __DC_COMPONENT_PROVENANCE__.Button;
    case "CheckboxField": return __DC_COMPONENT_PROVENANCE__.CheckboxField;
    case "DataTable": return __DC_COMPONENT_PROVENANCE__.DataTable;
    case "DefinitionList": return __DC_COMPONENT_PROVENANCE__.DefinitionList;
    case "Dialog": return __DC_COMPONENT_PROVENANCE__.Dialog;
    case "FieldShell": return __DC_COMPONENT_PROVENANCE__.FieldShell;
    case "FilterBar": return __DC_COMPONENT_PROVENANCE__.FilterBar;
    case "IconButton": return __DC_COMPONENT_PROVENANCE__.IconButton;
    case "InlineNotice": return __DC_COMPONENT_PROVENANCE__.InlineNotice;
    case "MobileRecordCard": return __DC_COMPONENT_PROVENANCE__.MobileRecordCard;
    case "MultiSelectField": return __DC_COMPONENT_PROVENANCE__.MultiSelectField;
    case "MetricCard": return __DC_COMPONENT_PROVENANCE__.MetricCard;
    case "ActionMenu": return __DC_COMPONENT_PROVENANCE__.ActionMenu;
    case "ResourcePanel": return __DC_COMPONENT_PROVENANCE__.ResourcePanel;
    case "SearchableSelect": return __DC_COMPONENT_PROVENANCE__.SearchableSelect;
    case "SelectField": return __DC_COMPONENT_PROVENANCE__.SelectField;
    case "StatusBadge": return __DC_COMPONENT_PROVENANCE__.StatusBadge;
    case "TablePagination": return __DC_COMPONENT_PROVENANCE__.TablePagination;
    case "TertiaryNav": return __DC_COMPONENT_PROVENANCE__.TertiaryNav;
    case "TextField": return __DC_COMPONENT_PROVENANCE__.TextField;
    case "Tooltip": return __DC_COMPONENT_PROVENANCE__.Tooltip;
    case "ApprovalPanel": return __DC_COMPONENT_PROVENANCE__.ApprovalPanel;
    default: return undefined;
  }
}

function componentOriginLabel(exportName: string) {
  switch (componentOrigin(exportName)) {
    case "existing": return "Existing";
    case "adapter": return "Adapter";
    case "design-consultant": return "Design Consultant";
    default: return "React";
  }
}

const visualizationViews = [
  { id: "lupi", label: "叙事图表", note: "Lupi · 深度阅读", file: "lupi-gallery.html", count: "15" },
  { id: "basics", label: "基础图表", note: "Lupi · 常见数据形态", file: "basics-gallery.html", count: "12" },
  { id: "glance", label: "快速图表", note: "仪表盘与监控", file: "glance-gallery.html", count: "18" },
  { id: "circular", label: "环形网络", note: "仓库协作关系", file: "big-circular.html", count: "01" },
  { id: "force", label: "力导向网络", note: "服务调用关系", file: "big-force.html", count: "01" },
  { id: "threads", label: "数据流向", note: "来源、处理与去向", file: "big-threads.html", count: "01" },
] as const;

type CatalogNavigationItem = Readonly<{ id: string; label: string; count: string }>;

const catalogNavigationGroups: ReadonlyArray<Readonly<{ label: string; items: ReadonlyArray<CatalogNavigationItem> }>> = [
  { label: "基础规范", items: [
    { id: "tokens", label: "Token 角色", count: "12" },
    { id: "brand-attribution", label: "品牌与技术署名", count: "04" },
  ] },
  { label: "组件", items: [
    { id: "foundation", label: "基础与输入", count: "11" },
    { id: "actions", label: "动作", count: "3" },
    { id: "data", label: "数据工作台", count: "7" },
    { id: "overlays", label: "覆盖层与决策", count: "4" },
    { id: "feedback", label: "反馈", count: "4" },
  ] },
  { label: "组合模式", items: [{ id: "review-workbench", label: "复核决策工作台", count: "01" }] },
];

const catalogMaintenanceNavigationGroup = {
  label: "维护信息",
  items: [{ id: "availability", label: "组件可用性", count: String(__DC_COMPONENT_AVAILABILITY__.length) }],
} as const;

const catalogSectionIds = [...catalogNavigationGroups, catalogMaintenanceNavigationGroup].flatMap((group) => group.items.map((item) => item.id));

const tableRows = [
  { id: "SO-2408", owner: "内容运营", amount: 128400, status: "已完成", issue: "凭证齐全", updatedAt: "今天 10:42" },
  { id: "SO-2409", owner: "商业产品", amount: 86200, status: "处理中", issue: "等待渠道回执", updatedAt: "今天 09:18" },
  { id: "SO-2410", owner: "数据平台", amount: 47900, status: "需复核", issue: "跨区域金额异常", updatedAt: "昨天 18:06" },
  { id: "SO-2411", owner: "增长产品", amount: 63500, status: "需复核", issue: "重复结算疑似", updatedAt: "昨天 16:24" },
];

const tableColumns = [
  { id: "id", header: "批次", accessor: "id" as const, sortable: true },
  { id: "owner", header: "负责团队", accessor: "owner" as const, sortable: true },
  { id: "amount", header: "金额", numeric: true, sortable: true, render: (row: (typeof tableRows)[number]) => `¥${row.amount.toLocaleString("zh-CN")}` },
  { id: "status", header: "状态", render: (row: (typeof tableRows)[number]) => <StatusBadge tone={row.status === "已完成" ? "success" : row.status === "需复核" ? "warning" : "info"}>{row.status}</StatusBadge> },
];

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function useRoute() {
  const parse = () => window.location.hash.replace(/^#/, "") || "catalog";
  const [route, setRouteState] = useState(parse);
  useEffect(() => {
    const update = () => setRouteState(parse());
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  const navigate = (next: string) => {
    if (next === "catalog") {
      const url = `${window.location.pathname}${window.location.search}`;
      if (window.location.hash) window.history.pushState(null, "", url);
      setRouteState(next);
      return;
    }
    const hash = `#${next}`;
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    setRouteState(next);
  };
  return [route, navigate] as const;
}

function scrollToCatalogSection(id: string, focus = false) {
  const section = document.getElementById(id);
  if (!section || section.hidden) return false;
  const previousScrollBehavior = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = "auto";
  section.scrollIntoView({ behavior: "auto", block: "start" });
  document.documentElement.style.scrollBehavior = previousScrollBehavior;
  if (focus) section.focus({ preventScroll: true });
  return true;
}

function scrollCatalogToTop() {
  const previousScrollBehavior = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = "auto";
  window.scrollTo({ top: 0, behavior: "auto" });
  document.documentElement.style.scrollBehavior = previousScrollBehavior;
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="catalog-segments" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function DemoCard({ title, description, keywords, wide, typeLabel = "React", origin, children }: { title: string; description: string; keywords: string; wide?: boolean; typeLabel?: string; origin?: ComponentOrigin; children: ReactNode }) {
  return (
    <article className="catalog-demo-card" data-catalog-item data-catalog-title={title} data-keywords={`${title} ${description} ${keywords}`} data-span={wide ? "wide" : undefined} data-component-origin={origin}>
      <header className="catalog-demo-head">
        <div><h3>{title}</h3><p>{description}</p></div>
        <span className="catalog-code-label">{typeLabel}</span>
      </header>
      <div className="catalog-demo-body">{children}</div>
    </article>
  );
}

function Section({ id, title, description, count, countLabel = "COMPONENTS", style, children }: { id: string; title: string; description: string; count: number; countLabel?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <section className="catalog-section" id={id} data-catalog-section style={style} tabIndex={-1}>
      <header className="catalog-section-head">
        <div><h2>{title}</h2><p>{description}</p></div>
        <span className="catalog-section-count">{count} {countLabel}</span>
      </header>
      <div className="catalog-demo-grid">{children}</div>
    </section>
  );
}

function normalizeColorInput(value: string) {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  const channels = trimmed.match(/[0-9.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) return "";
  return `${String.fromCharCode(35)}${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

const availabilityGroups: ReadonlyArray<{
  kind: ComponentAvailability;
  label: string;
  note: string;
  tone: "neutral" | "success" | "warning" | "info";
}> = [
  { kind: "evidence-only", label: "待纳入运行时", note: "已保留实现证据，完成通用化与验证后再开放导入。", tone: "info" },
  { kind: "contract-only", label: "按场景提供", note: "提供结构、状态和验收边界，由具体产品按场景组合。", tone: "neutral" },
  { kind: "external-required", label: "外部适配", note: "交互复杂度较高，必须接入清单批准的成熟实现。", tone: "warning" },
];

function AvailabilityIndex() {
  const runtimeComponents = __DC_COMPONENT_AVAILABILITY__.filter((component) => component.availability === "runtime-ready");
  const plannedGroups = availabilityGroups.map((group) => ({
    ...group,
    components: __DC_COMPONENT_AVAILABILITY__.filter((component) => component.availability === group.kind),
  })).filter((group) => group.components.length > 0);
  const plannedTotal = plannedGroups.reduce((total, group) => total + group.components.length, 0);

  return (
    <section className="catalog-availability" id="availability" data-catalog-section data-search-static tabIndex={-1}>
      <header className="catalog-section-head">
        <div><h2>组件可用性</h2><p>用于维护与接入核对，不参与日常组件选择；只有“可直接使用”家族允许从公共入口导入。</p></div>
        <span className="catalog-section-count">{__DC_COMPONENT_AVAILABILITY__.length} FAMILIES</span>
      </header>
      <div className="catalog-availability-overview">
        <article className="catalog-availability-ready">
          <header>
            <div><StatusBadge tone="success">可直接使用</StatusBadge><strong>{runtimeComponents.length} 个运行时家族</strong></div>
            <span>统一入口已导出</span>
          </header>
          <p>这些组件已完成 React 实现、公共导出和基础交互验证，可按项目 Kit 精确选取。</p>
          <details>
            <summary><span>查看可导入组件</span><strong>{runtimeComponents.length}</strong></summary>
            <ul>{runtimeComponents.map((component) => <li key={component.id}><code>{component.name}</code></li>)}</ul>
          </details>
        </article>
        <details className="catalog-availability-planning">
          <summary>
            <span><strong>规划与适配</strong><small>仅在项目明确需要时处理，不进入默认运行时。</small></span>
            <b>{plannedTotal}</b>
          </summary>
          <div className="catalog-availability-planning__groups">
            {plannedGroups.map((group) => (
              <section className="catalog-availability-group" key={group.kind}>
                <header><StatusBadge tone={group.tone}>{group.label}</StatusBadge><strong>{group.components.length}</strong></header>
                <p>{group.note}</p>
                <ul>{group.components.map((component) => <li key={component.id}><code>{component.name}</code></li>)}</ul>
              </section>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}

function ReviewWorkbench() {
  const [activeView, setActiveView] = useState<Key>("pending");
  const [selectedKeys, setSelectedKeys] = useState<Set<Key>>(() => new Set(["SO-2410"]));
  const [page, setPage] = useState(1);
  const [filtersDirty, setFiltersDirty] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<"waiting" | "approved" | "rejected" | "expired" | "submitting">("waiting");
  const activeKey = [...selectedKeys][0] ?? "SO-2410";
  const activeRow = tableRows.find((row) => row.id === activeKey) ?? tableRows[2];
  const selectedLabel = selectedKeys.size > 0 ? `已选择 ${selectedKeys.size} 条` : "尚未选择记录";

  return (
    <section className="catalog-section catalog-scenario" id="review-workbench" data-catalog-section data-search-static tabIndex={-1}>
      <header className="catalog-section-head">
        <div><h2>复核决策工作台</h2><p>用一个真实流程检验筛选、批量选择、详情阅读与决策反馈是否形成统一体验。</p></div>
        <span className="catalog-section-count">REFERENCE FLOW</span>
      </header>
      <div className="review-workbench">
        <header className="review-workbench__header">
          <div>
            <p className="review-workbench__eyebrow">结算运营 / 人工复核</p>
            <h3>异常批次复核</h3>
            <p>聚合规则命中、金额差异和处理记录，减少跨页面核对。</p>
          </div>
          <div className="review-workbench__header-actions">
            <StatusBadge tone="warning">2 条待决策</StatusBadge>
            <Button size="small" leadingIcon="＋">新建复核单</Button>
          </div>
        </header>

        <TertiaryNav
          label="复核工作台视图"
          selectedKey={activeView}
          onSelectionChange={setActiveView}
          items={[
            { id: "pending", label: "待我处理", count: 12 },
            { id: "team", label: "团队队列", count: 38 },
            { id: "closed", label: "已结束" },
          ]}
        />

        <FilterBar
          resultSummary="当前显示 4 条高风险批次，按最近更新时间排序"
          dirty={filtersDirty}
          onSubmit={(event) => { event.preventDefault(); setFiltersDirty(false); }}
          onReset={() => setFiltersDirty(false)}
        >
          <TextField label="批次或负责人" placeholder="输入关键词" onChange={() => setFiltersDirty(true)} />
          <SelectField label="风险等级" defaultValue="high" onValueChange={() => setFiltersDirty(true)} options={[
            { value: "high", label: "高风险" },
            { value: "medium", label: "中风险" },
            { value: "all", label: "全部等级" },
          ]} />
          <SelectField label="处理状态" defaultValue="pending" onValueChange={() => setFiltersDirty(true)} options={[
            { value: "pending", label: "待处理" },
            { value: "processing", label: "处理中" },
            { value: "closed", label: "已结束" },
          ]} />
        </FilterBar>

        <div className="review-workbench__body">
          <section className="review-workbench__list" aria-label="复核批次列表">
            <div className="review-workbench__toolbar">
              <div><strong>复核队列</strong><span aria-live="polite">{selectedLabel}</span></div>
              <div><Button size="small" variant="secondary" disabled={selectedKeys.size === 0}>批量指派</Button><ActionMenu label="批量操作" items={[{ id: "export", label: "导出所选" }, { id: "close", label: "标记为已处理" }]} onAction={() => undefined} /></div>
            </div>
            <div className="review-workbench__table">
              <DataTable
                columns={tableColumns}
                rows={tableRows}
                rowKey="id"
                density="compact"
                stickyHeader
                selectionMode="multiple"
                selectedKeys={selectedKeys}
                onSelectionChange={setSelectedKeys}
                getRowLabel={(row) => `${row.id} ${row.owner}`}
                renderRowActions={(row) => <ActionMenu label={`${row.id} 操作`} items={[{ id: "open", label: "查看详情" }, { id: "assign", label: "重新指派" }]} onAction={() => setSelectedKeys(new Set([row.id]))} />}
              />
            </div>
            <div className="review-workbench__mobile-records" aria-label="移动端复核批次列表">
              {tableRows.map((row) => (
                <MobileRecordCard
                  key={row.id}
                  title={row.id}
                  meta={row.owner}
                  status={<StatusBadge tone={row.status === "已完成" ? "success" : row.status === "需复核" ? "warning" : "info"}>{row.status}</StatusBadge>}
                  fields={[
                    { label: "金额", value: `¥${row.amount.toLocaleString("zh-CN")}`, emphasis: true },
                    { label: "命中规则", value: row.issue },
                    { label: "最近更新", value: row.updatedAt },
                  ]}
                  selectable
                  selected={selectedKeys.has(row.id)}
                  selectionLabel={`选择 ${row.id}`}
                  onSelectionChange={(selected) => setSelectedKeys((current) => {
                    const next = new Set(current);
                    if (selected) next.add(row.id); else next.delete(row.id);
                    return next;
                  })}
                  actions={<Button size="small" variant="secondary" onClick={() => setSelectedKeys(new Set([row.id]))}>查看详情</Button>}
                />
              ))}
            </div>
            <TablePagination page={page} totalPages={6} totalItems={112} pageSize={20} onPageChange={setPage} />
          </section>

          <aside className="review-workbench__detail" aria-label="当前批次详情">
            <header><div><span>当前记录</span><h4>{activeRow.id}</h4></div><StatusBadge tone={activeRow.status === "已完成" ? "success" : activeRow.status === "需复核" ? "warning" : "info"}>{activeRow.status}</StatusBadge></header>
            <DefinitionList items={[
              { term: "负责团队", description: activeRow.owner },
              { term: "结算金额", description: `¥${activeRow.amount.toLocaleString("zh-CN")}` },
              { term: "命中规则", description: activeRow.issue },
              { term: "最近更新", description: activeRow.updatedAt },
            ]} />
            <div className="review-workbench__evidence">
              <strong>复核摘要</strong>
              <p>系统识别到同一主体在两个区域重复申报，其中一笔已进入渠道结算。建议先确认归属，再决定是否放行。</p>
            </div>
            <ApprovalPanel
              status={approvalStatus}
              title={approvalStatus === "waiting" ? "确认本批次处理结果" : "本批次决策已记录"}
              description={approvalStatus === "waiting" ? "批准后将进入结算队列；退回后由负责团队补充材料。" : "结果已写入审计记录，可在处理历史中查看。"}
              onApprove={approvalStatus === "waiting" ? () => setApprovalStatus("approved") : undefined}
              onReject={approvalStatus === "waiting" ? () => setApprovalStatus("rejected") : undefined}
            />
            {approvalStatus !== "waiting" ? <Button size="small" variant="ghost" onClick={() => setApprovalStatus("waiting")}>重置演示状态</Button> : null}
          </aside>
        </div>
      </div>
    </section>
  );
}

function ComponentCatalog({ search, theme }: { search: string; theme: Theme }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogVariant, setDialogVariant] = useState<"dialog" | "alert">("dialog");
  const [noticeVisible, setNoticeVisible] = useState(true);
  const [region, setRegion] = useState("east");
  const [searchableRegion, setSearchableRegion] = useState<string | null>("east");
  const [selectedRegions, setSelectedRegions] = useState(["east", "south"]);
  const [lastMenuAction, setLastMenuAction] = useState("尚未执行");
  const [tableSort, setTableSort] = useState<{ id: string; direction: "ascending" | "descending" }>({ id: "id", direction: "ascending" });
  const [demoPage, setDemoPage] = useState(2);
  const [approvalStatus, setApprovalStatus] = useState<"waiting" | "approved" | "rejected">("waiting");
  const [signatureAccent, setSignatureAccent] = useState<string | null>(null);
  const [signatureColorInput, setSignatureColorInput] = useState("");

  const sortedTableRows = useMemo(() => [...tableRows].sort((left, right) => {
    const leftValue = left[tableSort.id as keyof typeof left];
    const rightValue = right[tableSort.id as keyof typeof right];
    const result = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), "zh-CN");
    return tableSort.direction === "ascending" ? result : -result;
  }), [tableSort]);
  const sortableTableColumns = tableColumns.map((column) => ({
    ...column,
    sortDirection: column.sortable ? (column.id === tableSort.id ? tableSort.direction : "none" as const) : undefined,
  }));

  useEffect(() => {
    if (signatureAccent) {
      setSignatureColorInput(signatureAccent);
      return;
    }
    const token = getComputedStyle(document.documentElement).getPropertyValue("--brand-attribution-accent");
    setSignatureColorInput(normalizeColorInput(token));
  }, [signatureAccent, theme]);

  const signatureStyle = signatureAccent
    ? ({ "--brand-attribution-accent": signatureAccent } as CSSProperties)
    : undefined;

  useEffect(() => {
    const query = search.trim().toLocaleLowerCase("zh-CN");
    const cards = [...document.querySelectorAll<HTMLElement>("[data-catalog-item]")];
    const sections = [...document.querySelectorAll<HTMLElement>("[data-catalog-section]")];
    for (const card of cards) card.hidden = Boolean(query) && !(card.dataset.keywords || "").toLocaleLowerCase("zh-CN").includes(query);
    for (const section of sections) {
      section.hidden = section.hasAttribute("data-search-static")
        ? Boolean(query)
        : ![...section.querySelectorAll<HTMLElement>("[data-catalog-item]")].some((card) => !card.hidden);
    }
  }, [search]);

  return (
    <>
      <div className="catalog-heading">
        <div className="catalog-heading-copy">
          <p className="catalog-eyebrow">Design Consultant / Runtime Catalog</p>
          <h1>项目视觉系统的可执行基线</h1>
          <p>这里展示的不是静态仿制稿，而是项目实际导入的 React 组件、状态和 token。</p>
        </div>
        <div className="catalog-summary" aria-label="Catalog 摘要">
          <span><strong>23</strong>可用家族</span>
          <span><strong>2</strong>内置色卡</span>
          <span><strong>0.10.0</strong>规范版本</span>
        </div>
      </div>

      <Section id="tokens" title="Token 角色" description="Harbor / Teal 与 Coral / Sage / Plum 通过同一语义角色和明暗模式自动替换。" count={12} countLabel="TOKENS">
        <DemoCard title="Data Tone Ramp" description="Visualization Tone / Structure" keywords="token visualization accent tone palette coral harbor" typeLabel="Token">
          <div className="catalog-token-grid">
            {["--viz-accent-strong", "--viz-accent", "--viz-accent-mid", "--viz-accent-soft", "--viz-accent-subtle", "--viz-accent-area"].map((token) => <div className="catalog-token" key={token} data-token-value={token}><span style={{ background: `var(${token})` }} /><code>{token}</code></div>)}
          </div>
        </DemoCard>
        <DemoCard title="Neutral Structure" description="结构线保留必要的极浅中性色，不跟随重点色染色。" keywords="token grid reference neutral structure line" typeLabel="Token">
          <div className="catalog-token-grid">
            {["--viz-grid", "--viz-reference", "--border", "--border-strong", "--surface-muted", "--text-muted"].map((token) => <div className="catalog-token" key={token} data-token-value={token}><span style={{ background: `var(${token})` }} /><code>{token}</code></div>)}
          </div>
        </DemoCard>
      </Section>

      <Section
        id="brand-attribution"
        title="SPACE AI NATIVE 技术署名"
        description="默认靛蓝但可由项目 Token 覆盖；标准竖向版是主版本，紧凑横向版只用于高度受限区域。"
        count={4}
        countLabel="SPEC GROUPS"
        style={signatureStyle}
      >
        <DemoCard
          title="Canonical lockups / 主次版本"
          description="Powered by 使用普通 UI 字体；SPACE 保留品牌字形，并提供品牌原生版与克制融入版两种项目级策略。"
          keywords="brand attribution powered by canonical standard stacked compact horizontal accent scope orbit only token"
          wide
          origin={componentOrigin("BrandAttribution")}
          typeLabel={componentOriginLabel("BrandAttribution")}
        >
          <div className="brand-attribution-showcase">
            <div className="brand-attribution-showcase__stage">
              <div className="brand-attribution-showcase__sample" data-size="standard">
                <span className="brand-attribution-spec-label">STANDARD / PRIMARY</span>
                <BrandAttribution variant="standard-stacked" />
              </div>
              <div className="brand-attribution-showcase__sample" data-size="compact">
                <span className="brand-attribution-spec-label">COMPACT / SECONDARY</span>
                <BrandAttribution variant="compact-horizontal" />
              </div>
            </div>
            <div className="brand-attribution-scope-grid" aria-label="署名重点色范围">
              <div className="brand-attribution-scope-sample">
                <span className="brand-attribution-spec-label">品牌原生版 / DEFAULT</span>
                <BrandAttribution variant="standard-stacked" accentScope="focus-and-orbit" />
                <small>A 与双轨道共同强调。适合独立产品、低频品牌表面和需要明确技术归属的场景。</small>
              </div>
              <div className="brand-attribution-scope-sample">
                <span className="brand-attribution-spec-label">克制融入版 / QUIET</span>
                <BrandAttribution variant="standard-stacked" accentScope="orbit-only" />
                <small>A 跟随中性字标，仅强调双轨道。适合成熟主品牌、密集工作台和长期常驻位置。</small>
              </div>
            </div>
            <div className="brand-attribution-accent-control">
              <div>
                <strong>重点色 Token</strong>
                <p>轨道始终使用重点色；<code>accentScope</code> 决定 A 跟随重点色或中性字标。</p>
              </div>
              <button
                className="brand-attribution-default-swatch"
                type="button"
                aria-label="恢复默认靛蓝重点色"
                aria-pressed={!signatureAccent}
                title="恢复默认靛蓝"
                onClick={() => setSignatureAccent(null)}
              />
              <label className="brand-attribution-color-input">
                <span>自定义</span>
                <input
                  type="color"
                  aria-label="自定义署名重点色"
                  value={signatureColorInput}
                  onChange={(event) => {
                    setSignatureColorInput(event.target.value);
                    setSignatureAccent(event.target.value);
                  }}
                />
              </label>
              <output>{signatureAccent ? signatureColorInput.toUpperCase() : "默认靛蓝"}</output>
            </div>
          </div>
        </DemoCard>

        <DemoCard
          title="Color modes / 颜色模式"
          description="双色品牌版是默认；单色深、单色浅只用于受限背景，不建立渐变或金属版本。"
          keywords="brand attribution color mode indigo monochrome inverse dark light no gradient"
          wide
          typeLabel="Tokens"
        >
          <div className="brand-attribution-tone-grid">
            <div className="brand-attribution-tone" data-surface="light">
              <span className="brand-attribution-spec-label">BRAND / LIGHT</span>
              <BrandAttribution variant="standard-stacked" />
            </div>
            <div className="brand-attribution-tone" data-surface="dark">
              <span className="brand-attribution-spec-label">BRAND / DARK</span>
              <BrandAttribution variant="standard-stacked" />
            </div>
            <div className="brand-attribution-tone" data-surface="light">
              <span className="brand-attribution-spec-label">MONO / DARK INK</span>
              <BrandAttribution variant="compact-horizontal" tone="monochrome" />
            </div>
            <div className="brand-attribution-tone" data-surface="dark">
              <span className="brand-attribution-spec-label">MONO / LIGHT INK</span>
              <BrandAttribution variant="compact-horizontal" tone="inverse" />
            </div>
          </div>
          <div className="brand-attribution-size-notes">
            <span><strong>标准：</strong><code>160 / 12 / 10</code>，纵向间距 <code>7</code></span>
            <span><strong>紧凑：</strong><code>108 / 11 / 10</code>，横向间距 <code>12</code></span>
            <span><strong>清晰空间：</strong>四周至少 <code>0.5 × SPACE 字标高度</code></span>
          </div>
        </DemoCard>

        <DemoCard
          title="Stable placement / 稳定落位"
          description="每个产品选择一个稳定、可发现的主署名位置；不是每个页面重复展示。"
          keywords="brand attribution placement rail footer account about auth shell stable discoverable"
          wide
          typeLabel="Placement"
        >
          <div className="brand-attribution-placement-grid">
            <figure>
              <div className="brand-attribution-placement-mini" data-layout="rail">
                <div className="brand-attribution-placement-mini__rail"><i /><span /><span /><BrandAttribution variant="standard-stacked" placement="rail-footer" /></div>
                <div className="brand-attribution-placement-mini__canvas"><i /><span /><span /></div>
              </div>
              <figcaption><strong>桌面 Rail 底部</strong><span>持续侧栏的最末端</span></figcaption>
            </figure>
            <figure>
              <div className="brand-attribution-placement-mini" data-layout="account">
                <div className="brand-attribution-placement-mini__canvas"><i /><span /></div>
                <div className="brand-attribution-placement-mini__account"><i /><span /><BrandAttribution variant="compact-horizontal" placement="account-surface-footer" /></div>
              </div>
              <figcaption><strong>移动账户 / 关于</strong><span>不进入底部一级导航</span></figcaption>
            </figure>
            <figure>
              <div className="brand-attribution-placement-mini" data-layout="auth">
                <div className="brand-attribution-placement-mini__panel"><i /><span /><span /><BrandAttribution variant="compact-horizontal" placement="auth-panel-footer" /></div>
              </div>
              <figcaption><strong>认证 / 授权面板尾部</strong><span>位于操作区之后</span></figcaption>
            </figure>
            <figure>
              <div className="brand-attribution-placement-mini" data-layout="shell">
                <div className="brand-attribution-placement-mini__canvas"><i /><span /></div>
                <div className="brand-attribution-placement-mini__footer"><BrandAttribution variant="compact-horizontal" placement="shell-footer" /></div>
              </div>
              <figcaption><strong>无侧栏 Shell 尾部</strong><span>随文档流自然收尾</span></figcaption>
            </figure>
          </div>
        </DemoCard>

        <DemoCard
          title="Placement rules / 使用边界"
          description="位置由产品级容器决定；业务页面不能把署名当作 Badge、Logo 或装饰贴片。"
          keywords="brand attribution placement map forbidden topbar bottom nav table dialog card single instance"
          wide
          typeLabel="Rule"
        >
          <div className="brand-placement-rules">
            <div><strong>批准位置</strong><ul><li><code>rail-footer</code> · 桌面持续侧栏</li><li><code>account-surface-footer</code> · 移动账户 / 关于</li><li><code>auth / authorization-panel-footer</code></li><li><code>home-footer / shell-footer</code> · 内容自然收尾</li></ul></div>
            <div><strong>明确禁区</strong><ul><li>顶部栏与产品主品牌组合</li><li>移动端底部一级导航</li><li>业务表格、卡片、图表和空状态</li><li>业务 Dialog 正文、主 CTA 与悬浮角落</li></ul></div>
            <p><StatusBadge>单一位置</StatusBadge><span>同一产品在登录后只选一个稳定主位置；认证页可在未登录状态补充，不要求每个页面都有。</span></p>
            <p><StatusBadge tone="info">Token</StatusBadge><span><code>--brand-attribution-accent</code> 默认靛蓝并允许项目覆盖；深色模式单独校准，中性层始终使用语义前景色。</span></p>
          </div>
        </DemoCard>
      </Section>

      <Section id="foundation" title="基础与输入" description="从文本、数值到单选、多选和即时开关，保持标签、说明与错误关系一致。" count={11}>
        <DemoCard title="FieldShell" description="统一标签、帮助信息、错误和控件关联。" keywords="field input form error required" origin={componentOrigin("FieldShell")} typeLabel={componentOriginLabel("FieldShell")}>
          <div className="catalog-demo-form">
            <FieldShell label="项目名称" description="用于工作台和导出文件。" required>
              <input defaultValue="季度结算中心" />
            </FieldShell>
            <FieldShell label="业务编码" error="编码已被其他项目占用。">
              <input defaultValue="settlement" />
            </FieldShell>
          </div>
        </DemoCard>
        <DemoCard title="Text Fields" description="短文本、长说明与数值共用字段关系，并支持前后缀和字数反馈。" keywords="text field textarea number input suffix character count" origin={componentOrigin("TextField")} typeLabel={componentOriginLabel("TextField")} wide>
          <div className="catalog-demo-form catalog-demo-form--three">
            <TextField label="规则名称" description="用于列表和审计记录。" defaultValue="跨区域金额复核" required />
            <NumberField label="差异阈值" defaultValue={12} min={0} max={100} suffix="%" />
            <TextAreaField label="复核说明" defaultValue="金额差异超过阈值时进入人工复核。" maxLength={80} showCount />
          </div>
        </DemoCard>
        <DemoCard title="SelectField" description="适合少量固定选项；触发器、菜单、选中态与键盘行为使用同一套控件规范。" keywords="select dropdown option choice keyboard" origin={componentOrigin("SelectField")} typeLabel={componentOriginLabel("SelectField")}>
          <div className="catalog-demo-form">
            <SelectField label="数据区域" value={region} onValueChange={setRegion} options={[
              { value: "east", label: "华东", description: "上海、江苏、浙江" },
              { value: "south", label: "华南", description: "广东、广西、海南" },
              { value: "north", label: "华北", description: "北京、天津、河北" },
            ]} />
            <SelectField label="同步策略" loading loadingLabel="正在读取策略" defaultValue="" options={[
              { value: "auto", label: "自动同步" },
              { value: "manual", label: "人工确认" },
              { value: "legacy", label: "旧策略", disabled: true },
            ]} />
          </div>
        </DemoCard>
        <DemoCard title="SearchableSelect" description="适合选项较多的筛选式选择，键盘、焦点和活动项语义由成熟交互底座负责。" keywords="searchable select combobox filter keyboard aria active option" origin={componentOrigin("SearchableSelect")} typeLabel={componentOriginLabel("SearchableSelect")}>
          <div className="catalog-demo-form">
            <SearchableSelect
              label="搜索数据区域"
              value={searchableRegion}
              onChange={setSearchableRegion}
              clearable
              options={[
                { value: "east", label: "华东", description: "上海、江苏、浙江" },
                { value: "south", label: "华南", description: "广东、广西、海南" },
                { value: "north", label: "华北", description: "北京、天津、河北" },
                { value: "legacy", label: "历史区域", disabled: true },
              ]}
            />
          </div>
        </DemoCard>
        <DemoCard title="MultiSelectField" description="在同一字段内完成多项选择、计数与逐项移除，列表保持完整键盘语义。" keywords="multi select listbox multiple selected chips remove keyboard" origin={componentOrigin("MultiSelectField")} typeLabel={componentOriginLabel("MultiSelectField")}>
          <div className="catalog-demo-form">
            <MultiSelectField
              label="适用区域"
              description="可同时选择多个启用区域。"
              value={selectedRegions}
              onChange={setSelectedRegions}
              options={[
                { value: "east", label: "华东", description: "上海、江苏、浙江" },
                { value: "south", label: "华南", description: "广东、广西、海南" },
                { value: "north", label: "华北", description: "北京、天津、河北" },
                { value: "legacy", label: "历史区域", disabled: true },
              ]}
            />
          </div>
        </DemoCard>
        <DemoCard title="Form Selection" description="复选用于独立选择，单选用于互斥决策，开关用于立即生效的设置。" keywords="checkbox checkbox group radio switch selection form" origin={componentOrigin("CheckboxField")} typeLabel={componentOriginLabel("CheckboxField")} wide>
          <div className="catalog-selection-showcase">
            <div className="catalog-demo-stack">
              <CheckboxField label="自动归档已完成批次" description="每天凌晨整理一次。" defaultSelected />
              <SwitchField label="异常提醒" description="切换后立即生效。" defaultSelected />
            </div>
            <CheckboxGroupField
              label="通知渠道"
              description="可以同时选择多个渠道。"
              defaultValue={["inbox", "mail"]}
              options={[
                { value: "inbox", label: "站内消息" },
                { value: "mail", label: "邮件" },
                { value: "sms", label: "短信", disabled: true },
              ]}
            />
            <RadioGroupField
              label="复核优先级"
              description="同一批次只能采用一种策略。"
              defaultValue="risk"
              options={[
                { value: "risk", label: "风险优先" },
                { value: "amount", label: "金额优先" },
                { value: "time", label: "时间优先" },
              ]}
            />
          </div>
        </DemoCard>
      </Section>

      <Section id="actions" title="动作" description="高频命令直接呈现，低频同级命令收进操作菜单。" count={3}>
        <DemoCard title="Button" description="覆盖基础变体、禁用态和加载态。" keywords="button action loading disabled danger primary secondary ghost" origin={componentOrigin("Button")} typeLabel={componentOriginLabel("Button")}>
          <div className="catalog-demo-stack">
            <div className="catalog-demo-row">
              <Button size="small" leadingIcon="＋">新建</Button><Button variant="secondary" trailingIcon="→">预览</Button><Button size="large">保存配置</Button>
            </div>
            <div className="catalog-demo-row">
              <Button loading loadingLabel="正在保存">保存配置</Button><Button variant="ghost">取消</Button><Button variant="danger">删除</Button><Button disabled>不可用</Button>
            </div>
          </div>
        </DemoCard>
        <DemoCard title="IconButton" description="图标工具必须提供可访问名称。" keywords="icon button toolbar accessible label" origin={componentOrigin("IconButton")} typeLabel={componentOriginLabel("IconButton")}>
          <div className="catalog-demo-row">
            <IconButton label="新建记录" variant="secondary">＋</IconButton>
            <IconButton label="编辑记录" variant="secondary">✎</IconButton>
            <IconButton label="删除记录" variant="danger">×</IconButton>
            <IconButton label="更多操作" disabled>•••</IconButton>
          </div>
        </DemoCard>
        <DemoCard title="ActionMenu" description="只收纳同级命令，支持键盘导航、禁用项和危险动作。" keywords="action menu more actions keyboard danger disabled" origin={componentOrigin("ActionMenu")} typeLabel={componentOriginLabel("ActionMenu")}>
          <div className="catalog-demo-stack">
            <div className="catalog-demo-row">
              <ActionMenu
                label="批次操作"
                items={[
                  { id: "rename", label: "重命名", shortcut: "F2" },
                  { id: "duplicate", label: "创建副本", description: "保留当前筛选条件" },
                  { id: "archive", label: "归档", disabled: true },
                  { id: "delete", label: "删除批次", tone: "danger" },
                ]}
                onAction={(id) => setLastMenuAction({ rename: "重命名", duplicate: "创建副本", archive: "归档", delete: "删除批次" }[id] || id)}
              />
              <span className="catalog-demo-result" aria-live="polite">最近操作：{lastMenuAction}</span>
            </div>
          </div>
        </DemoCard>
      </Section>

      <Section id="data" title="数据工作台" description="从关键指标、视图切换、筛选到表格、详情与分页，支持连续扫描和重复处理。" count={7}>
        <DemoCard title="MetricCard" description="让少量关键指标保留单位、统计口径、时间范围和明确的详情去向。" keywords="metric card value unit meta tooltip loading skeleton linked" origin={componentOrigin("MetricCard")} typeLabel={componentOriginLabel("MetricCard")} wide>
          <div className="catalog-metric-grid">
            <MetricCard label="本月结算金额" value="128.4" unit="万元" description="仅统计审核通过且未退款的订单。" meta="截至今天 10:30" />
            <MetricCard label="待复核批次" value="24" unit="批" description="命中人工复核规则且尚未完成决策的批次。" meta="较昨日减少 6 批" href="#review-workbench" linkLabel="查看待复核批次" />
            <MetricCard label="正在读取" value="" loading />
          </div>
        </DemoCard>
        <DemoCard title="TertiaryNav" description="在同一工作区切换稳定子视图，当前项、禁用项和溢出状态都可识别。" keywords="tertiary navigation tabs current overflow count" origin={componentOrigin("TertiaryNav")} typeLabel={componentOriginLabel("TertiaryNav")} wide>
          <TertiaryNav label="数据视图" defaultSelectedKey="pending" items={[
            { id: "pending", label: "待处理", count: 12 },
            { id: "assigned", label: "我负责的", count: 3 },
            { id: "closed", label: "已结束" },
            { id: "archived", label: "归档", disabled: true },
          ]} />
        </DemoCard>
        <DemoCard title="FilterBar" description="筛选字段、结果摘要和提交/重置动作共享响应式折叠策略。" keywords="filter bar query reset dirty mobile collapsed" origin={componentOrigin("FilterBar")} typeLabel={componentOriginLabel("FilterBar")} wide>
          <FilterBar dirty resultSummary="共 24 条结果，已应用 2 个条件" onSubmit={(event) => event.preventDefault()} onReset={() => undefined}>
            <TextField label="关键词" defaultValue="风险" />
            <SelectField label="状态" defaultValue="pending" options={[{ value: "pending", label: "待复核" }, { value: "closed", label: "已结束" }]} />
          </FilterBar>
        </DemoCard>
        <DemoCard title="DataTable" description="表头、排序方向、数值对齐和资源状态共享语义。" keywords="data table sort row column amount status" origin={componentOrigin("DataTable")} typeLabel={componentOriginLabel("DataTable")} wide>
          <DataTable caption="2026 年 7 月待处理批次" columns={sortableTableColumns} rows={sortedTableRows} rowKey="id" selectionMode="multiple" getRowLabel={(row) => `${row.id} ${row.owner}`} onSort={(id, direction) => setTableSort({ id, direction })} />
        </DemoCard>
        <DemoCard title="DefinitionList" description="用稳定键值关系呈现详情、规则口径与长文本。" keywords="definition list details key value dl dt dd" origin={componentOrigin("DefinitionList")} typeLabel={componentOriginLabel("DefinitionList")}>
          <DefinitionList items={[
            { term: "规则编号", description: "RISK-REGION-04" },
            { term: "触发条件", description: "同一结算主体在两个区域提交相同账期数据" },
            { term: "处理时限", description: "2 个工作日" },
          ]} />
        </DemoCard>
        <DemoCard title="MobileRecordCard" description="窄屏下保留字段标签、状态、选择与行操作，不把宽表压成难读缩略图。" keywords="mobile record card responsive table selection action" origin={componentOrigin("MobileRecordCard")} typeLabel={componentOriginLabel("MobileRecordCard")}>
          <MobileRecordCard
            title="SO-2410"
            meta="数据平台"
            status={<StatusBadge tone="warning">需复核</StatusBadge>}
            fields={[
              { label: "结算金额", value: "¥47,900", emphasis: true },
              { label: "命中规则", value: "跨区域金额异常" },
              { label: "最近更新", value: "昨天 18:06" },
            ]}
            selectable
            selectionLabel="选择 SO-2410"
            actions={<Button size="small" variant="secondary">查看详情</Button>}
          />
        </DemoCard>
        <DemoCard title="TablePagination" description="范围、当前页和边界动作始终可读，窄屏自动保留核心控制。" keywords="table pagination pages page size range mobile" origin={componentOrigin("TablePagination")} typeLabel={componentOriginLabel("TablePagination")}>
          <TablePagination page={demoPage} totalPages={8} totalItems={153} pageSize={20} onPageChange={setDemoPage} />
        </DemoCard>
      </Section>

      <Section id="overlays" title="覆盖层与决策" description="按内容是否可交互、是否阻塞当前任务来选择承载方式。" count={4}>
        <DemoCard title="Tooltip" description="只补充简短说明，不承载必须阅读的信息或交互控件。" keywords="tooltip hint hover focus explanation" origin={componentOrigin("Tooltip")} typeLabel={componentOriginLabel("Tooltip")}>
          <div className="catalog-demo-row">
            <Tooltip content="复制当前筛选条件"><Button variant="secondary">悬停或聚焦查看说明</Button></Tooltip>
          </div>
        </DemoCard>
        <DemoCard title="PopoverCard" description="适合包含链接、操作或较长说明的非阻塞上下文面板。" keywords="popover contextual panel interactive help" origin={componentOrigin("Tooltip")} typeLabel={componentOriginLabel("Tooltip")}>
          <PopoverCard
            trigger={<Button variant="secondary">查看计算口径</Button>}
            title="有效结算金额"
            description="以审核通过的订单为统计范围。"
          >
            <p>退款、拒付和测试订单不计入当前金额；数据每小时更新一次。</p>
          </PopoverCard>
        </DemoCard>
        <DemoCard title="Dialog" description="用于阻塞决策；普通对话框可关闭，警示对话框只能通过明确动作结束。" keywords="dialog modal alert dialog focus escape dismissable" origin={componentOrigin("Dialog")} typeLabel={componentOriginLabel("Dialog")} wide>
          <div className="catalog-demo-row">
            <Button onClick={() => { setDialogVariant("dialog"); setDialogOpen(true); }}>提交复核</Button>
            <Button variant="danger" onClick={() => { setDialogVariant("alert"); setDialogOpen(true); }}>删除批次</Button>
          </div>
          <Dialog
            open={dialogOpen}
            variant={dialogVariant}
            dismissable={dialogVariant === "dialog"}
            title={dialogVariant === "alert" ? "确认删除批次" : "确认提交复核"}
            description={dialogVariant === "alert" ? "删除后无法恢复。" : "提交后，当前批次将进入人工复核队列。"}
            onClose={() => setDialogOpen(false)}
            footer={<><Button variant="ghost" onClick={() => setDialogOpen(false)}>取消</Button><Button variant={dialogVariant === "alert" ? "danger" : "primary"} onClick={() => setDialogOpen(false)}>{dialogVariant === "alert" ? "确认删除" : "确认提交"}</Button></>}
          >
            <p>{dialogVariant === "alert" ? "批次 SO-2410 包含 18 条尚未归档的记录。" : "本次提交包含 24 条记录，其中 3 条存在金额差异。"}</p>
          </Dialog>
        </DemoCard>
        <DemoCard title="ApprovalPanel" description="把风险摘要和一组明确决策集中到唯一位置，并保留完成后的稳定状态。" keywords="approval decision approve reject expired submitting" origin={componentOrigin("ApprovalPanel")} typeLabel={componentOriginLabel("ApprovalPanel")}>
          <div className="catalog-demo-stack">
            <ApprovalPanel
              status={approvalStatus}
              title={approvalStatus === "waiting" ? "确认采用本次调整" : "决策已记录"}
              description={approvalStatus === "waiting" ? "该操作会更新 24 条结算记录，并写入审计历史。" : "当前示例可重置后再次体验决策过程。"}
              onApprove={approvalStatus === "waiting" ? () => setApprovalStatus("approved") : undefined}
              onReject={approvalStatus === "waiting" ? () => setApprovalStatus("rejected") : undefined}
            />
            {approvalStatus !== "waiting" ? <Button size="small" variant="ghost" onClick={() => setApprovalStatus("waiting")}>重置状态</Button> : null}
          </div>
        </DemoCard>
      </Section>

      <Section id="feedback" title="反馈" description="区分局部持久反馈、资源状态和短暂全局通知，避免同一消息重复出现。" count={4}>
        <DemoCard title="StatusBadge" description="颜色之外始终保留可读状态文本。" keywords="status badge success warning danger info neutral" origin={componentOrigin("StatusBadge")} typeLabel={componentOriginLabel("StatusBadge")}>
          <div className="catalog-demo-row">
            <StatusBadge>草稿</StatusBadge><StatusBadge tone="success">已完成</StatusBadge><StatusBadge tone="warning">待复核</StatusBadge><StatusBadge tone="danger">失败</StatusBadge><StatusBadge tone="info">同步中</StatusBadge>
          </div>
        </DemoCard>
        <DemoCard title="ResourcePanel" description="加载、空、错误、权限和部分可用状态。" keywords="resource loading empty error permission partial" origin={componentOrigin("ResourcePanel")} typeLabel={componentOriginLabel("ResourcePanel")}>
          <ResourcePanel state="error" description="服务返回超时，请稍后重试。" action={<Button variant="secondary">重新加载</Button>} />
        </DemoCard>
        <DemoCard title="InlineNotice" description="和当前内容保持在一起，适合校验结果、异常与恢复动作。" keywords="inline notice banner feedback warning error recovery" origin={componentOrigin("InlineNotice")} typeLabel={componentOriginLabel("InlineNotice")} wide>
          {noticeVisible ? (
            <InlineNotice
              tone="warning"
              title="3 条记录需要补充凭证"
              description="补充后即可重新提交，无需撤回其余记录。"
              action={<Button size="small" variant="secondary">查看记录</Button>}
              onDismiss={() => setNoticeVisible(false)}
            />
          ) : <Button variant="secondary" onClick={() => setNoticeVisible(true)}>恢复提示示例</Button>}
        </DemoCard>
        <DemoCard title="Toast" description="普通结果短暂显示；错误或带恢复动作的通知保持到用户处理。" keywords="toast notification success danger action persistent" origin={componentOrigin("InlineNotice")} typeLabel={componentOriginLabel("InlineNotice")} wide>
          <div className="catalog-demo-row">
            <Button variant="secondary" onClick={() => feedbackQueue.show({ tone: "success", title: "配置已保存", description: "新规则将在下一批任务生效。" })}>显示成功通知</Button>
            <Button variant="secondary" onClick={() => feedbackQueue.show({ tone: "danger", title: "同步失败", description: "网络恢复后可再次尝试。", action: { label: "重试", onAction: () => undefined } })}>显示持续错误</Button>
          </div>
          <ToastViewport />
        </DemoCard>
      </Section>

      <ReviewWorkbench />
      <AvailabilityIndex />
    </>
  );
}

function App() {
  const [route, navigate] = useRoute();
  const [search, setSearch] = useState("");
  const [density, setDensity] = useState<Density>(() => readStored("dc-density", ["comfortable", "compact"], "comfortable"));
  const [palette, setPalette] = useState<Palette>(() => readStored("dc-palette", ["harbor", "coral"], "harbor"));
  const [theme, setTheme] = useState<Theme>(() => readStored("dc-theme", ["light", "dark"], "light"));
  const [navOpen, setNavOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(() => catalogSectionIds.includes(route) ? route : catalogSectionIds[0]);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const sidebarCloseRef = useRef<HTMLButtonElement>(null);
  const isVisualization = route.startsWith("visualization/");
  const visualizationId = isVisualization ? route.split("/")[1] : "lupi";
  const activeVisualization = visualizationViews.find((view) => view.id === visualizationId) || visualizationViews[0];
  const visualizationSrc = useMemo(() => {
    const base = window.__DC_CATALOG__?.visualizationRoot || "visualization-lieflat/";
    return `${base}${activeVisualization.file}?palette=${palette}&theme=${theme}`;
  }, [activeVisualization.file, palette, theme]);

  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem("dc-palette", palette); window.localStorage.setItem("dc-theme", theme); } catch { /* storage can be unavailable in previews */ }
  }, [palette, theme]);

  useEffect(() => {
    try { window.localStorage.setItem("dc-density", density); } catch { /* storage can be unavailable in previews */ }
  }, [density]);

  useEffect(() => {
    setNavOpen(false);
    if (isVisualization || route === "catalog" || !catalogSectionIds.includes(route)) return undefined;
    setActiveSection(route);
    scrollToCatalogSection(route, true);
    return undefined;
  }, [isVisualization, route]);

  useEffect(() => {
    if (isVisualization) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const topbar = document.querySelector<HTMLElement>(".catalog-topbar");
      const anchorLine = Math.max((topbar?.getBoundingClientRect().bottom || 0) + 24, 96);
      const sections = catalogSectionIds
        .map((id) => document.getElementById(id))
        .filter((section): section is HTMLElement => Boolean(section && !section.hidden && section.getClientRects().length));
      if (sections.length === 0) return;
      let next = sections[0].id;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= anchorLine) next = section.id;
        else break;
      }
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) next = sections.at(-1)?.id || next;
      setActiveSection((current) => current === next ? current : next);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [isVisualization, search]);

  useEffect(() => {
    if (!navOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => sidebarCloseRef.current?.focus());
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setNavOpen(false);
      window.requestAnimationFrame(() => mobileMenuRef.current?.focus());
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [navOpen]);

  const go = (next: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    if (search) setSearch("");
    setActiveSection(next);
    setNavOpen(false);
    if (!isVisualization && route === next) {
      scrollToCatalogSection(next, true);
      return;
    }
    navigate(next);
  };

  const goHome = (event: React.MouseEvent) => {
    event.preventDefault();
    if (search) setSearch("");
    setNavOpen(false);
    navigate("catalog");
    scrollCatalogToTop();
  };
  return (
    <div className="catalog-shell" data-catalog-density={density} data-nav-open={navOpen}>
      <aside className="catalog-sidebar catalog-rail" id="catalogSidebar" aria-label="组件 Catalog 导航">
        <IconButton ref={sidebarCloseRef} className="catalog-sidebar-close" label="关闭导航" variant="ghost" tooltip={false} onClick={() => { setNavOpen(false); window.requestAnimationFrame(() => mobileMenuRef.current?.focus()); }}>×</IconButton>
        <div className="catalog-brand">
          <a className="catalog-brand-home" href="#" onClick={goHome} aria-label="返回组件参考库顶部">
            <span className="brand-lockup"><span className="brand-mark" aria-hidden="true">DC</span><span className="brand-copy"><strong>设计顾问</strong><small>组件参考库</small></span></span>
          </a>
          <span className="catalog-version">组件系统 / v0.10.0</span>
        </div>
        <nav className="catalog-nav" aria-label="设计系统目录">
          {catalogNavigationGroups.map((group) => (
            <div className="catalog-nav-section" key={group.label}>
              <p className="catalog-nav-group">{group.label}</p>
              {group.items.map((item) => (
                <a key={item.id} href={`#${item.id}`} aria-current={!isVisualization && activeSection === item.id ? "page" : undefined} onClick={go(item.id)}>
                  <span>{item.label}</span><b className="catalog-nav-count">{item.count}</b>
                </a>
              ))}
            </div>
          ))}
          <div className="catalog-nav-section">
            <p className="catalog-nav-group">扩展模块</p>
            <a id="visualizationNav" href={`#visualization/${activeVisualization.id}`} aria-current={isVisualization ? "location" : undefined} onClick={(event) => { event.preventDefault(); setNavOpen(false); navigate(`visualization/${activeVisualization.id}`); }}><span>可视化组件</span><b className="catalog-nav-count">48</b></a>
          </div>
          <div className="catalog-subnav" id="visualizationSubmenu" aria-label="可视化图库" hidden={!isVisualization}>
            {visualizationViews.map((view) => (
              <a key={view.id} href={`#visualization/${view.id}`} aria-current={activeVisualization.id === view.id ? "page" : undefined} onClick={(event) => { event.preventDefault(); navigate(`visualization/${view.id}`); }}>
                <span><strong>{view.label}</strong><small>{view.note}</small></span><b className="catalog-nav-count">{view.count}</b>
              </a>
            ))}
          </div>
          <div className="catalog-nav-section">
            <p className="catalog-nav-group">{catalogMaintenanceNavigationGroup.label}</p>
            {catalogMaintenanceNavigationGroup.items.map((item) => (
              <a key={item.id} href={`#${item.id}`} aria-current={!isVisualization && activeSection === item.id ? "page" : undefined} onClick={go(item.id)}>
                <span>{item.label}</span><b className="catalog-nav-count">{item.count}</b>
              </a>
            ))}
          </div>
        </nav>
        <div className="catalog-sidebar-note"><strong>同一视觉事实源</strong><span>组件、图表和交互状态共同引用项目 token；可视化模块包含 48 个模板与 6 组预览。</span></div>
      </aside>

      <button className="catalog-nav-backdrop" type="button" tabIndex={-1} aria-label="关闭导航" onClick={() => { setNavOpen(false); window.requestAnimationFrame(() => mobileMenuRef.current?.focus()); }} />

      <main className="catalog-main" inert={navOpen || undefined}>
        <header className="catalog-topbar">
          <IconButton ref={mobileMenuRef} className="catalog-mobile-menu" label={navOpen ? "关闭导航" : "打开导航"} variant="secondary" aria-expanded={navOpen} aria-controls="catalogSidebar" onClick={() => setNavOpen((open) => !open)}>{navOpen ? "×" : "☰"}</IconButton>
          {!isVisualization ? <label className="catalog-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索规范、组件、状态或场景" aria-label="搜索组件" /></label> : <StatusBadge tone="info">{activeVisualization.label}</StatusBadge>}
          <span className="catalog-toolbar-spacer" />
          {!isVisualization ? <SegmentedControl label="展示密度" value={density} options={[{ value: "comfortable", label: "舒适" }, { value: "compact", label: "紧凑" }]} onChange={setDensity} /> : null}
          <SegmentedControl label="预览色卡" value={palette} options={[{ value: "harbor", label: "港湾蓝" }, { value: "coral", label: "珊瑚红" }]} onChange={setPalette} />
          <SegmentedControl label="明暗模式" value={theme} options={[{ value: "light", label: "浅色" }, { value: "dark", label: "深色" }]} onChange={setTheme} />
        </header>
        {isVisualization ? <><span className="catalog-visualization-status" aria-live="polite">正在显示 {activeVisualization.label}</span><iframe className="catalog-visualization" title={`${activeVisualization.label} 可视化组件预览`} src={visualizationSrc} /></> : <div className="catalog-workspace"><ComponentCatalog search={search} theme={theme} /></div>}
      </main>
    </div>
  );
}

const root = document.getElementById("catalogRoot");
if (!root) throw new Error("Catalog mount element #catalogRoot was not found.");
createRoot(root).render(<App />);
