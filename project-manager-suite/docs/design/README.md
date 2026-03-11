# Design Docs Index

`project-manager-suite/docs/design/` 是套件的设计说明层。

这里的文档用于给人理解产品定位、边界判断、结构思路和专题方案，不作为主入口或子 skill 的运行时规范来源。

当前目录的使用约定已经固定为：

- [project-manager-suite-product-design.md](./project-manager-suite-product-design.md) 是 design 层唯一主文件
- 其它文档都是围绕总档展开的专题补充
- 如果要理解产品，先看总档，再按总档中的链接进入对应专题

一句话区分：

- `docs/design/` 解释为什么这样设计
- `skills/ai-project-manager/references/` 承载主入口实际引用的规则与协议

---

## 当前文件结构

```text
docs/design/
├── README.md
├── project-manager-suite-product-design.md
├── global-files-architecture.md
├── project-progression-workflow.md
├── open-core-strategy.md
├── content-layering-inventory.md
├── package-conventions.md
└── project-scaffold-design.md
```

---

## 文件角色

- [project-manager-suite-product-design.md](./project-manager-suite-product-design.md)
  - design 层唯一主线文档
  - 统一承载产品定位、边界判断、设计思路、实施策略和关键演进

- [global-files-architecture.md](./global-files-architecture.md)
  - 解释 4 类全局文件为什么是产品骨架
  - 说明全局文件、主入口和路由链路之间的关系

- [project-progression-workflow.md](./project-progression-workflow.md)
  - 用工作流图解释项目从进入主入口到回写的推进过程

- [open-core-strategy.md](./open-core-strategy.md)
  - 展开公开版与增强版的能力边界和开源策略

- [content-layering-inventory.md](./content-layering-inventory.md)
  - 盘点内容分层、公开边界和发布前必备清单

- [package-conventions.md](./package-conventions.md)
  - 约束套件命名、目录分层、模板来源和文档边界

- [project-scaffold-design.md](./project-scaffold-design.md)
  - 讨论宿主项目目录脚手架如何规划与补齐
  - 当前仍属于专题设计讨论稿

---

## 阅读入口

如果你要快速进入当前设计体系，建议按下面顺序读：

1. [project-manager-suite-product-design.md](./project-manager-suite-product-design.md)
2. [global-files-architecture.md](./global-files-architecture.md)
3. [package-conventions.md](./package-conventions.md)
4. [project-progression-workflow.md](./project-progression-workflow.md)

如果你要看专项问题，再补读：

- [open-core-strategy.md](./open-core-strategy.md)
- [content-layering-inventory.md](./content-layering-inventory.md)
- [project-scaffold-design.md](./project-scaffold-design.md)

---

## 使用边界

以下内容不应由本目录承担：

- 运行时协议
- 字段级最小合同
- 主入口执行规则
- 子 skill 运行时引用规范

这些内容应放在 `skills/ai-project-manager/references/` 或具体 `skills/` 资源中。
