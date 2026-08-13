import commitmentContract from "./product-commitments.json" with { type: "json" };

export default {
  schemaVersion: 2,
  project: {{PROJECT_NAME_JSON}},
  baseUrl: null,
  startCommand: null,
  commitmentContract,

  // 服务由用户手工启动；run 直接用 Playwright 验证真实业务路径。
  // 运行器会在每个场景截图前自动阻断内部字段、raw enum、调试值和工程文案泄漏。
  scenarios: [],
};

/*
场景示例：
scenarios: [{
  id: "vehicle-selection-keyboard",
  title: "键盘切换车辆",
  route: "/maintenance",
  viewport: { width: 1280, height: 800 },
  async run({ page, assert }) {
    const field = page.getByRole("combobox", { name: "选择车辆" });
    await field.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    assert.equal(await field.inputValue(), "车辆 B");
  },
}],
*/
