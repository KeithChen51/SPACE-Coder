import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Button } from "../src/Button";
import { ActionMenu } from "../src/ActionMenu";
import { BrandAttribution } from "../src/BrandAttribution";
import {
  CheckboxField,
  CheckboxGroupField,
  RadioGroupField,
  SwitchField,
} from "../src/CheckboxField";
import { DataTable } from "../src/DataTable";
import { Dialog } from "../src/Dialog";
import { FieldShell } from "../src/FieldShell";
import { IconButton } from "../src/IconButton";
import { FeedbackQueue, InlineNotice, ToastViewport } from "../src/InlineNotice";
import { ResourcePanel } from "../src/ResourcePanel";
import { MetricCard } from "../src/MetricCard";
import { MultiSelectField } from "../src/MultiSelectField";
import { SearchableSelect } from "../src/SearchableSelect";
import { SelectField } from "../src/SelectField";
import { StatusBadge } from "../src/StatusBadge";
import { PopoverCard, Tooltip } from "../src/Tooltip";
import { ApprovalPanel } from "../src/ApprovalPanel";
import { DefinitionList } from "../src/DefinitionList";
import { FilterBar } from "../src/FilterBar";
import { TablePagination } from "../src/TablePagination";
import { TertiaryNav } from "../src/TertiaryNav";
import { NumberField, TextAreaField, TextField } from "../src/TextField";
import { MobileRecordCard } from "../src/MobileRecordCard";

beforeAll(() => {
  if (!globalThis.CSS) Object.defineProperty(globalThis, "CSS", { configurable: true, value: {} });
  if (!globalThis.CSS.escape) {
    Object.defineProperty(globalThis.CSS, "escape", {
      configurable: true,
      value: (value: string) => String(value).replace(/[^A-Za-z0-9_-]/g, "\\$&"),
    });
  }
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("React runtime accessibility and behavior", () => {
  it("renders the technology attribution as one accessible brand relationship", () => {
    const { container } = render(
      <BrandAttribution
        variant="standard-stacked"
        tone="brand"
        accentScope="orbit-only"
        placement="rail-footer"
      />,
    );
    const signature = screen.getByRole("img", { name: "Powered by SPACE AI Native" });
    expect(signature.getAttribute("data-variant")).toBe("standard-stacked");
    expect(signature.getAttribute("data-accent-scope")).toBe("orbit-only");
    expect(signature.getAttribute("data-placement")).toBe("rail-footer");
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
    const paintLayers = [...container.querySelectorAll(".dc-brand-attribution__mark-layer")];
    expect(paintLayers).toHaveLength(4);
    expect(paintLayers.map((layer) => layer.className.split("--").at(-1))).toEqual([
      "orbit-back",
      "neutral",
      "focus",
      "orbit-front",
    ]);
  });

  it("renders the formal outlined attribution glyphs for both structural variants", () => {
    const { container, rerender } = render(<BrandAttribution variant="standard-stacked" />);
    const standardGlyphs = [...container.querySelectorAll<HTMLElement>("[data-brand-glyph]")];

    expect(standardGlyphs.map((glyph) => glyph.dataset.brandGlyph)).toEqual([
      "powered-by",
      "ai",
      "native",
    ]);
    const standardMasks = standardGlyphs.map((glyph) => glyph.getAttribute("style"));
    expect(standardMasks.every((style) => style?.includes("data:image/svg+xml;base64,"))).toBe(true);

    rerender(<BrandAttribution variant="compact-horizontal" />);
    const compactGlyphs = [...container.querySelectorAll<HTMLElement>("[data-brand-glyph]")];
    const compactMasks = compactGlyphs.map((glyph) => glyph.getAttribute("style"));
    expect(compactGlyphs.map((glyph) => glyph.dataset.brandGlyph)).toEqual([
      "powered-by",
      "ai",
      "native",
    ]);
    expect(compactMasks).not.toEqual(standardMasks);
  });

  it("defaults to the continuity-preserving brand tone with metallic neutral material", () => {
    render(<BrandAttribution />);

    const signature = screen.getByRole("img", { name: "Powered by SPACE AI Native" });
    expect(signature.getAttribute("data-tone")).toBe("brand");
    expect(signature.getAttribute("data-material")).toBe("metallic");
    expect(signature.classList.contains("dc-brand-attribution--material-metallic")).toBe(true);
  });

  it("preserves the complete public attribution mode matrix", () => {
    const variants = ["standard-stacked", "compact-horizontal"] as const;
    const tones = ["brand", "grayscale", "grayscale-reverse", "monochrome", "inverse"] as const;
    const materials = ["metallic", "flat"] as const;
    const accentScopes = ["focus-and-orbit", "orbit-only"] as const;
    const placements = [
      "rail-footer",
      "account-surface-footer",
      "auth-panel-footer",
      "authorization-panel-footer",
      "home-footer",
      "shell-footer",
      "page-footer",
    ] as const;
    const combinations = variants.flatMap((variant) => tones.flatMap((tone) => materials.flatMap(
      (material) => accentScopes.flatMap(
        (accentScope) => placements.map((placement) => ({ variant, tone, material, accentScope, placement })),
      ),
    )));

    // Product placement allows at most one visible attribution per viewport. Inspect the
    // pure component output here so the exhaustive matrix does not serialize 280 copies
    // of the approved outlined SVG masks into one synthetic DOM.
    const signatures = combinations.map((props) => BrandAttribution(props));
    expect(signatures).toHaveLength(280);
    signatures.forEach((signature, index) => {
      expect(signature.props["data-variant"]).toBe(combinations[index].variant);
      expect(signature.props["data-tone"]).toBe(combinations[index].tone);
      expect(signature.props["data-material"]).toBe(combinations[index].material);
      expect(signature.props["data-accent-scope"]).toBe(combinations[index].accentScope);
      expect(signature.props["data-placement"]).toBe(combinations[index].placement);
    });
  });

  it("keeps the action name when Button enters loading state", () => {
    render(<Button loading loadingLabel="处理中">保存规则</Button>);
    const button = screen.getByRole("button", { name: "保存规则，处理中" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("supports stable button sizing and decorative leading and trailing icons", () => {
    const { container } = render(
      <Button size="small" leadingIcon={<span>+</span>} trailingIcon={<span>→</span>}>
        新建规则
      </Button>,
    );
    const button = screen.getByRole("button", { name: "新建规则" });
    expect(button.getAttribute("data-size")).toBe("small");
    expect(container.querySelectorAll(".dc-button__icon[aria-hidden='true']")).toHaveLength(2);
  });

  it("requires an accessible name for IconButton at runtime", () => {
    render(<IconButton label="刷新数据">R</IconButton>);
    expect(screen.getByRole("button", { name: "刷新数据" })).toBeTruthy();
  });

  it("shows the IconButton label as a keyboard accessible tooltip", async () => {
    const user = userEvent.setup();
    render(<IconButton label="刷新数据" tooltipDelay={0}>R</IconButton>);
    await user.tab();
    expect((await screen.findByRole("tooltip")).textContent).toContain("刷新数据");
  });

  it("connects FieldShell label, description and error to its control", () => {
    render(
      <FieldShell label="项目名称" description="用于列表识别" error="名称已存在" required>
        <input />
      </FieldShell>,
    );
    const input = screen.getByLabelText(/项目名称/);
    const describedBy = input.getAttribute("aria-describedby") || "";
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy).toContain("description");
    expect(describedBy).toContain("error");
    expect(screen.getByRole("alert").textContent).toBe("名称已存在");
  });

  it("honors a control id supplied by the FieldShell child", () => {
    render(<FieldShell label="业务编码"><input id="business-code" /></FieldShell>);
    expect(screen.getByLabelText("业务编码").id).toBe("business-code");
  });

  it("merges existing control descriptions with FieldShell help and error ids", () => {
    render(
      <FieldShell label="业务编码" description="由系统生成" error="编码不可用">
        <input aria-describedby="external-help" />
      </FieldShell>,
    );
    const describedBy = screen.getByLabelText("业务编码").getAttribute("aria-describedby") || "";
    expect(describedBy).toContain("external-help");
    expect(describedBy).toContain("description");
    expect(describedBy).toContain("error");
  });

  it("uses a custom SelectField trigger and keeps value and legacy change callbacks aligned", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    render(
      <SelectField
        label="所属区域"
        placeholder="请选择区域"
        defaultValue=""
        options={[
          { value: "north", label: "北区", description: "华北业务" },
          { value: "south", label: "南区" },
          { value: "legacy", label: "旧区域", disabled: true },
        ]}
        onChange={onChange}
        onValueChange={onValueChange}
      />,
    );
    const trigger = screen.getByRole("button", { name: /所属区域/ });
    expect(trigger.textContent).toContain("请选择区域");
    expect(trigger.querySelector("svg.dc-select-icon")).toBeTruthy();

    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByRole("option", { name: /旧区域/ }).getAttribute("aria-disabled")).toBe("true");
    await user.click(screen.getByRole("option", { name: /南区/ }));

    expect(trigger.textContent).toContain("南区");
    expect(onValueChange).toHaveBeenLastCalledWith("south");
    expect(onChange.mock.lastCall?.[0].target.value).toBe("south");
  });

  it("announces and locks SelectField while options are loading", () => {
    render(
      <SelectField
        label="所属区域"
        options={[]}
        loading
        loadingLabel="正在载入区域"
      />,
    );
    const trigger = screen.getByRole("button", { name: /所属区域/ });
    expect(trigger.getAttribute("data-disabled")).not.toBeNull();
    expect(trigger.closest(".dc-select")?.getAttribute("data-busy")).toBe("true");
    expect(trigger.textContent).toContain("正在载入区域");
    expect(screen.getByRole("status").textContent).toContain("正在载入区域");
    expect(trigger.querySelector("svg.dc-select-spinner")).toBeTruthy();
  });

  it("uses one real icon system instead of CSS-drawn glyphs in select controls", () => {
    const { container } = render(
      <>
        <SelectField label="数据区域" defaultValue="east" options={[{ value: "east", label: "华东" }]} />
        <SearchableSelect label="搜索数据区域" defaultValue="east" options={[{ value: "east", label: "华东" }]} />
        <MultiSelectField label="适用区域" defaultValue={["east"]} options={[{ value: "east", label: "华东" }]} />
      </>,
    );
    const chevrons = [...container.querySelectorAll("svg.dc-select-chevron-icon")];
    expect(chevrons).toHaveLength(3);
    expect(container.querySelector(".dc-select-chevron")).toBeNull();
    expect(container.querySelector(".dc-select-clear-icon")).toBeNull();
  });

  it("selects a SearchableSelect option with arrows and Enter while exposing active option semantics", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SearchableSelect
        label="所属区域"
        options={[
          { value: "north", label: "华北" },
          { value: "south", label: "华南" },
          { value: "legacy", label: "旧区域", disabled: true },
        ]}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("combobox", { name: "所属区域" }) as HTMLInputElement;
    input.focus();
    await user.keyboard("{ArrowDown}");
    expect(input.getAttribute("aria-controls")).toBeTruthy();
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenLastCalledWith("south");
    expect(input.value).toBe("华南");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("restores the selected SearchableSelect label on blur and exposes empty and disabled states", async () => {
    const user = userEvent.setup();
    render(
      <SearchableSelect
        label="所属区域"
        defaultValue="north"
        emptyMessage="没有匹配区域"
        options={[
          { value: "north", label: "华北" },
          { value: "legacy", label: "旧区域", disabled: true },
        ]}
      />,
    );

    const input = screen.getByRole("combobox", { name: "所属区域" }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, "旧");
    expect(screen.getByRole("option", { name: "旧区域" }).getAttribute("aria-disabled")).toBe("true");

    await user.clear(input);
    await user.type(input, "不存在");
    expect(screen.getByText("没有匹配区域")).toBeTruthy();
    await user.tab();
    expect(input.value).toBe("华北");
  });

  it("clears a SearchableSelect selection without treating the empty value as an option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SearchableSelect
        label="所属区域"
        defaultValue="north"
        clearable
        options={[{ value: "north", label: "华北" }]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "清除所属区域" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect((screen.getByRole("combobox", { name: "所属区域" }) as HTMLInputElement).value).toBe("");
  });

  it("keeps MultiSelectField selection, keyboard navigation and removal in one field contract", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelectField
        label="适用区域"
        defaultValue={["east"]}
        options={[
          { value: "east", label: "华东" },
          { value: "south", label: "华南" },
          { value: "legacy", label: "历史区域", disabled: true },
        ]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("button", { name: /适用区域/ });
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBeTruthy();
    expect(screen.getByRole("button", { name: "移除华东" })).toBeTruthy();

    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("option", { name: "历史区域" }).getAttribute("aria-disabled")).toBe("true");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["east", "south"]);
    expect(screen.getByRole("listbox")).toBeTruthy();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(screen.getByRole("button", { name: "移除华东" }));
    expect(onChange).toHaveBeenLastCalledWith(["south"]);
  });

  it("keeps MetricCard value context, explanation, destination and loading state explicit", () => {
    const { container, rerender } = render(
      <MetricCard
        label="本月结算金额"
        value="128.4"
        unit="万元"
        description="仅统计审核通过且未退款的订单。"
        meta="截至今天 10:30"
        href="#settlement-detail"
        linkLabel="查看本月结算金额详情"
      />,
    );

    const card = screen.getByRole("article", { name: "本月结算金额" });
    expect(card.getAttribute("aria-busy")).toBeNull();
    expect(screen.getByText("128.4")).toBeTruthy();
    expect(screen.getByText("万元")).toBeTruthy();
    expect(screen.getByRole("button", { name: "查看本月结算金额口径" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "查看本月结算金额详情" }).getAttribute("href")).toBe("#settlement-detail");

    rerender(<MetricCard label="本月结算金额" value="128.4" unit="万元" loading />);
    expect(screen.getByRole("article", { name: "本月结算金额" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("128.4")).toBeNull();
    expect(container.querySelectorAll(".dc-metric-card__skeleton")).toHaveLength(2);
  });

  it("isolates the background, traps focus and restores it when Dialog closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(
      <main>
        <button type="button">打开设置</button>
        <Dialog open={false} title="编辑规则" onClose={onClose} footer={<button type="button">保存</button>}>
          <input aria-label="规则名称" />
        </Dialog>
      </main>,
    );
    const outside = screen.getByRole("button", { name: "打开设置" });
    outside.focus();
    rerender(<main><button type="button">打开设置</button><Dialog open title="编辑规则" onClose={onClose} footer={<button type="button">保存</button>}><input aria-label="规则名称" /></Dialog></main>);
    await waitFor(() => {
      expect(outside.closest('[aria-hidden="true"], [inert]')).toBeTruthy();
    });
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<main><button type="button">打开设置</button><Dialog open={false} title="编辑规则" onClose={onClose}>内容</Dialog></main>);
    expect(outside.closest("main")?.parentElement?.getAttribute("aria-hidden")).toBe(null);
    expect(document.activeElement).toBe(outside);
  });

  it("keeps a required-decision Dialog open on Escape and backdrop press", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open title="确认删除" variant="alert" dismissable={false} onClose={onClose}>
        删除后无法恢复。
      </Dialog>,
    );
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    fireEvent.mouseDown(document.querySelector(".dc-dialog-backdrop") as Element);
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exposes DataTable sorting semantics and stable row content", () => {
    render(
      <DataTable
        caption="结算任务"
        columns={[
          { id: "name", header: "任务", accessor: "name", sortDirection: "ascending" },
          { id: "amount", header: "金额", accessor: "amount", numeric: true },
        ]}
        rows={[{ id: "a", name: "六月结算", amount: "¥12,800" }]}
        rowKey="id"
      />,
    );
    expect(screen.getByRole("columnheader", { name: "任务" }).getAttribute("aria-sort")).toBe("ascending");
    expect(screen.getByRole("cell", { name: "¥12,800" })).toBeTruthy();
  });

  it("turns sortable DataTable headers into named actions", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(
      <DataTable
        columns={[{ id: "name", header: "任务", accessor: "name", sortable: true, sortDirection: "none" }]}
        rows={[{ id: "a", name: "六月结算" }]}
        rowKey="id"
        onSort={onSort}
      />,
    );
    await user.click(screen.getByRole("button", { name: "按任务升序排列" }));
    expect(onSort).toHaveBeenCalledWith("name", "ascending");
  });

  it("provides checkbox, checkbox-group, radio-group and switch form selection semantics", async () => {
    const user = userEvent.setup();
    render(
      <>
        <CheckboxField label="接受条款" />
        <CheckboxGroupField
          label="通知渠道"
          options={[{ value: "email", label: "邮件" }, { value: "sms", label: "短信" }]}
        />
        <RadioGroupField
          label="同步策略"
          options={[{ value: "auto", label: "自动" }, { value: "manual", label: "人工" }]}
        />
        <SwitchField label="启用自动复核" />
      </>,
    );
    await user.click(screen.getByRole("checkbox", { name: "接受条款" }));
    await user.click(screen.getByRole("checkbox", { name: "邮件" }));
    await user.click(screen.getByRole("radio", { name: "人工" }));
    await user.click(screen.getByRole("switch", { name: "启用自动复核" }));
    expect((screen.getByRole("checkbox", { name: "接受条款" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "邮件" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "人工" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("switch", { name: "启用自动复核" }) as HTMLInputElement).checked).toBe(true);
  });

  it("separates short explanations from interactive popover content", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip content="重新读取最新数据" delay={0}>
          <Button>刷新</Button>
        </Tooltip>
        <PopoverCard trigger={<Button variant="secondary">查看口径</Button>} title="金额口径">
          仅统计已确认的结算记录。
        </PopoverCard>
      </>,
    );
    await user.hover(screen.getByRole("button", { name: "刷新" }));
    expect((await screen.findByRole("tooltip")).textContent).toContain("重新读取最新数据");
    await user.click(screen.getByRole("button", { name: "查看口径" }));
    expect(screen.getByRole("dialog", { name: "金额口径" }).textContent).toContain("仅统计已确认的结算记录。");
  });

  it("exposes action overlays as keyboard menus with disabled and destructive items", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <ActionMenu
        label="更多操作"
        items={[
          { id: "copy", label: "复制链接" },
          { id: "archive", label: "归档", disabled: true },
          { id: "delete", label: "删除", tone: "danger" },
        ]}
        onAction={onAction}
      />,
    );
    await user.click(screen.getByRole("button", { name: "更多操作" }));
    expect(screen.getByRole("menuitem", { name: "归档" }).getAttribute("aria-disabled")).toBe("true");
    await user.click(screen.getByRole("menuitem", { name: "复制链接" }));
    expect(onAction).toHaveBeenCalledWith("copy");
  });

  it("keeps inline and transient feedback semantically distinct", () => {
    const queue = new FeedbackQueue();
    render(
      <>
        <InlineNotice tone="danger" title="提交失败" description="请检查网络后重试。" />
        <ToastViewport queue={queue} />
      </>,
    );
    expect(screen.getByRole("alert").textContent).toContain("提交失败");
    act(() => {
      queue.show({ tone: "success", title: "已保存", description: "规则已经更新。" });
    });
    expect(screen.getByRole("region", { name: "通知" }).textContent).toContain("已保存");
    expect(screen.getAllByRole("button", { name: "关闭通知" })).toHaveLength(1);
  });

  it("announces resource states and keeps status text independent from color", () => {
    render(
      <>
        <ResourcePanel state="error" description="请稍后重试" />
        <StatusBadge tone="success">已完成</StatusBadge>
      </>,
    );
    expect(screen.getByRole("alert").textContent).toContain("加载失败");
    expect(screen.getByText("已完成").textContent).toBe("已完成");
  });

  it("provides complete text, textarea and numeric field relationships", () => {
    const { container } = render(
      <>
        <TextField label="规则名称" description="用于复核列表识别" error="名称已存在" defaultValue="高风险复核" required />
        <TextAreaField label="复核说明" defaultValue="需要人工确认" maxLength={40} showCount />
        <NumberField label="差异阈值" defaultValue={12} min={0} suffix="%" />
      </>,
    );
    const name = screen.getByRole("textbox", { name: /规则名称/ });
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(name.getAttribute("aria-describedby")).toContain("description");
    expect(name.getAttribute("aria-describedby")).toContain("error");
    expect(screen.getByText("6 / 40")).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "差异阈值" })).toBeTruthy();
    expect(container.querySelector(".dc-field-affix__suffix")?.textContent).toBe("%");
  });

  it("keeps tertiary navigation current state explicit and keyboard actionable", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <TertiaryNav
        label="复核视图"
        defaultSelectedKey="pending"
        items={[
          { id: "pending", label: "待处理", count: 12 },
          { id: "mine", label: "我负责的", count: 3 },
          { id: "closed", label: "已结束", disabled: true },
        ]}
        onSelectionChange={onSelectionChange}
      />,
    );
    expect(screen.getByRole("button", { name: /待处理/ }).getAttribute("aria-current")).toBe("page");
    await user.click(screen.getByRole("button", { name: /我负责的/ }));
    expect(onSelectionChange).toHaveBeenCalledWith("mine");
    expect(screen.getByRole("button", { name: /我负责的/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: /已结束/ }).hasAttribute("disabled")).toBe(true);
  });

  it("submits and resets filter groups without hiding their result context", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event) => event.preventDefault());
    const onReset = vi.fn();
    render(
      <FilterBar resultSummary="共 24 条结果" dirty onSubmit={onSubmit} onReset={onReset}>
        <TextField label="关键词" defaultValue="风险" />
        <SelectField label="状态" defaultValue="pending" options={[{ value: "pending", label: "待复核" }]} />
      </FilterBar>,
    );
    await user.click(screen.getByRole("button", { name: "查询" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "重置筛选" }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText("共 24 条结果")).toBeTruthy();
  });

  it("keeps pagination boundaries, current page and result range readable", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <TablePagination page={2} totalPages={4} totalItems={73} pageSize={20} onPageChange={onPageChange} />,
    );
    expect(screen.getByText("第 21–40 条，共 73 条")).toBeTruthy();
    expect(screen.getByRole("button", { name: "第 2 页" }).getAttribute("aria-current")).toBe("page");
    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("uses semantic definition pairs and an explicit empty state", () => {
    const { container, rerender } = render(
      <DefinitionList
        items={[
          { term: "风险等级", description: "高" },
          { term: "命中规则", description: "跨区域金额异常" },
        ]}
      />,
    );
    expect(container.querySelectorAll("dt")).toHaveLength(2);
    expect(container.querySelectorAll("dd")).toHaveLength(2);
    rerender(<DefinitionList items={[]} emptyMessage="暂无复核详情" />);
    expect(screen.getByRole("status").textContent).toContain("暂无复核详情");
  });

  it("presents one decision locus and preserves completed approval states", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const { rerender } = render(
      <ApprovalPanel
        status="waiting"
        title="确认采用本次调整"
        description="该操作会更新 24 条结算记录。"
        onApprove={onApprove}
        onReject={onReject}
      />,
    );
    const statusBadge = screen.getByText("待决策").closest(".dc-status-badge");
    expect(statusBadge?.parentElement?.classList.contains("dc-approval-panel__meta")).toBe(true);
    await user.click(screen.getByRole("button", { name: "批准" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "退回" }));
    expect(onReject).toHaveBeenCalledTimes(1);
    rerender(<ApprovalPanel status="approved" title="本次调整已批准" description="操作记录已归档。" />);
    expect(screen.getByText("已批准")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "批准" })).toBeNull();
  });

  it("supports named row selection and selecting the current table page", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <DataTable
        columns={[{ id: "name", header: "批次", accessor: "name" }]}
        rows={[{ id: "one", name: "七月结算" }, { id: "two", name: "六月补差" }]}
        rowKey="id"
        selectionMode="multiple"
        getRowLabel={(row) => row.name}
        onSelectionChange={onSelectionChange}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: "选择七月结算" }));
    expect(onSelectionChange.mock.calls.at(-1)?.[0]).toEqual(new Set(["one"]));
    await user.click(screen.getByRole("checkbox", { name: "选择当前页全部记录" }));
    expect(onSelectionChange.mock.calls.at(-1)?.[0]).toEqual(new Set(["one", "two"]));
  });

  it("turns wide table records into selectable mobile summaries without losing field labels", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <MobileRecordCard
        title="SO-2410"
        meta="数据平台"
        status={<StatusBadge tone="warning">需复核</StatusBadge>}
        fields={[
          { label: "结算金额", value: "¥47,900", emphasis: true },
          { label: "命中规则", value: "跨区域金额异常" },
        ]}
        selectable
        selectionLabel="选择 SO-2410"
        onSelectionChange={onSelectionChange}
        actions={<Button size="small" variant="secondary">查看详情</Button>}
      />,
    );
    expect(screen.getByText("结算金额")).toBeTruthy();
    expect(screen.getByText("跨区域金额异常")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: "选择 SO-2410" }));
    expect(onSelectionChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "查看详情" })).toBeTruthy();
  });
});
