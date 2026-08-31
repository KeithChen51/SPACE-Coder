import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  DataTable,
  Dialog,
  FieldShell,
  IconButton,
  ResourcePanel,
  SelectField,
  StatusBadge,
} from "@design-consultant/runtime";

type ComponentOrigin = "existing" | "adapter" | "design-consultant";
type Density = "comfortable" | "compact";
declare const __DC_COMPONENT_PROVENANCE__: Readonly<Record<string, ComponentOrigin>>;

const componentNames = ["Button", "IconButton", "FieldShell", "SelectField", "Dialog", "ResourcePanel", "StatusBadge", "DataTable"] as const;
const rows = [
  { id: "A-104", owner: "Operations", status: "Ready" },
  { id: "A-105", owner: "Finance", status: "Review" },
];
const columns = [
  { id: "id", header: "Record", accessor: "id" as const },
  { id: "owner", header: "Owner", accessor: "owner" as const },
  { id: "status", header: "Status", accessor: "status" as const },
];

function componentOrigin(name: string): ComponentOrigin | undefined {
  switch (name) {
    case "Button": return __DC_COMPONENT_PROVENANCE__.Button;
    case "DataTable": return __DC_COMPONENT_PROVENANCE__.DataTable;
    case "Dialog": return __DC_COMPONENT_PROVENANCE__.Dialog;
    case "FieldShell": return __DC_COMPONENT_PROVENANCE__.FieldShell;
    case "IconButton": return __DC_COMPONENT_PROVENANCE__.IconButton;
    case "ResourcePanel": return __DC_COMPONENT_PROVENANCE__.ResourcePanel;
    case "SelectField": return __DC_COMPONENT_PROVENANCE__.SelectField;
    case "StatusBadge": return __DC_COMPONENT_PROVENANCE__.StatusBadge;
    default: return undefined;
  }
}

function originLabel(name: string) {
  switch (componentOrigin(name)) {
    case "existing": return "Existing";
    case "adapter": return "Adapter";
    case "design-consultant": return "Design Consultant";
    default: return "React";
  }
}

function Demo({ name, description, wide, children }: { name: string; description: string; wide?: boolean; children: ReactNode }) {
  return (
    <article className="catalog-demo-card" data-catalog-item data-catalog-title={name} data-keywords={`${name} ${description}`} data-span={wide ? "wide" : undefined} data-component-origin={componentOrigin(name)}>
      <header className="catalog-demo-head">
        <div><h3>{name}</h3><p>{description}</p></div>
        <span className="catalog-code-label">{originLabel(name)}</span>
      </header>
      <div className="catalog-demo-body">{children}</div>
    </article>
  );
}

function App() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [region, setRegion] = useState("east");
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    const query = search.trim().toLowerCase();
    for (const card of document.querySelectorAll<HTMLElement>("[data-catalog-item]")) {
      card.hidden = Boolean(query) && !(card.dataset.keywords || "").toLowerCase().includes(query);
    }
  }, [search]);

  return (
    <div className="catalog-shell" data-catalog-density={density} data-catalog-workflow="existing-system-adoption">
      <aside className="catalog-sidebar catalog-rail">
        <div className="catalog-brand brand-lockup">
          <span className="brand-mark">DC</span>
          <span className="brand-copy"><strong>Adoption Catalog</strong><small>Confirmed runtime</small></span>
        </div>
        <nav className="catalog-nav" aria-label="Component families">
          {componentNames.map((name) => <a key={name} href={`#${name.toLowerCase()}`}>{name}<span className="catalog-nav-count">1</span></a>)}
        </nav>
        <p className="catalog-sidebar-note"><strong>Source boundary</strong><span>Existing styles, confirmed bridges, and approved gap artifacts only.</span></p>
      </aside>
      <main className="catalog-main">
        <header className="catalog-topbar">
          <label className="catalog-search"><span aria-hidden="true">/</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索组件、状态或场景" aria-label="搜索组件" /></label>
          <span className="catalog-toolbar-spacer" />
          <div className="catalog-segments" role="group" aria-label="展示密度">
            <button type="button" aria-pressed={density === "comfortable"} onClick={() => setDensity("comfortable")}>舒适</button>
            <button type="button" aria-pressed={density === "compact"} onClick={() => setDensity("compact")}>紧凑</button>
          </div>
        </header>
        <div className="catalog-workspace">
          <header className="catalog-heading">
            <div className="catalog-heading-copy"><p className="catalog-eyebrow">Existing system adoption</p><h1>Confirmed component runtime</h1><p>Each example resolves through the managed canonical runtime and its confirmed source evidence.</p></div>
          </header>
          <section className="catalog-section">
            <div className="catalog-demo-grid">
              <Demo name="Button" description="Canonical actions and states"><div className="catalog-demo-row"><Button>Continue</Button><Button variant="secondary">Preview</Button><Button variant="danger">Remove</Button></div></Demo>
              <Demo name="IconButton" description="Accessible compact action"><div className="catalog-demo-row"><IconButton label="Add record">+</IconButton><IconButton label="Remove record" variant="danger">x</IconButton></div></Demo>
              <Demo name="FieldShell" description="Label and validation structure"><FieldShell label="Project name" description="Managed by the existing application"><input defaultValue="Operations" /></FieldShell></Demo>
              <Demo name="SelectField" description="Canonical choice field"><SelectField label="数据区域" value={region} onChange={(event: ChangeEvent<HTMLSelectElement>) => setRegion(event.target.value)} options={[{ value: "east", label: "华东" }, { value: "south", label: "华南" }, { value: "west", label: "华西" }]} /></Demo>
              <Demo name="StatusBadge" description="Text-backed status"><div className="catalog-demo-row"><StatusBadge tone="success">Ready</StatusBadge><StatusBadge tone="warning">Review</StatusBadge></div></Demo>
              <Demo name="ResourcePanel" description="Resource state contract"><ResourcePanel state="error" title="Could not load">Retry from the owning application.</ResourcePanel></Demo>
              <Demo name="Dialog" description="Modal interaction contract"><Button onClick={() => setDialogOpen(true)}>打开复核对话框</Button><Dialog open={dialogOpen} title="确认提交复核" onClose={() => setDialogOpen(false)}>本示例通过已确认的运行时映射渲染。</Dialog></Demo>
              <Demo name="DataTable" description="Operational data display" wide><DataTable columns={columns} rows={rows} rowKey="id" state="ready" /></Demo>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

const root = document.getElementById("catalogRoot");
if (!root) throw new Error("Catalog root is missing.");
createRoot(root).render(<App />);
