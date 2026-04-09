# page-designer

基于 BRD 产出可交互的前端页面。内置设计知识库（BM25 搜索引擎 + CSV 数据），技术栈从 tech-stack.md 读取。

## 做什么

- C+B 项目：先出 C 端页面 → 用户确认 → 提取实体中间文件 → 基于中间文件反推控制台
- 纯 B 项目：直接出 B 端页面

产物是可点击、可操作的前端页面，不是设计文档。

## 上游

| 上游 Skill | 消费的产物 | 读取的字段 |
|-----------|-----------|-----------|
| brd-writer | `BRD-<slug>-<YYYYMMDD-HHMM>.md` | 项目类型、是否含 C 端页面、架构约束、用户画像、核心业务模型、付费触发点、页面定位全部 |

BRD 文件是强依赖，不存在则不启动。

## 下游

| 下游 Skill | 提供的产物 | 用途 |
|-----------|-----------|------|
| 地基构建 | 交付清单 + 实体规格文件 | 数据模型设计、BFF 接口定义、模块划分 |

下游只需读取交付清单（`page-delivery-<slug>.md`）即可索引到所有产物。

## 产物

| 文件 | 说明 |
|------|------|
| C 端页面代码 | 可交互，mock 数据（仅 C+B） |
| `page-spec-entities-<slug>.md` | 实体中间文件，C→B 的桥梁（仅 C+B） |
| B 端页面代码 | 可交互，mock 数据 |
| `page-delivery-<slug>.md` | 交付清单，下游索引入口 |

## 内部结构

```
page-designer/
├── SKILL.md        # skill 定义
├── scripts/        # BM25 搜索引擎
│   ├── core.py     # 搜索核心 + CSV 配置
│   ├── search.py   # CLI 入口
│   └── design_system.py  # 设计系统生成器
├── design-db/      # 设计知识库 (CSV)
│   ├── styles.csv, colors.csv, typography.csv, ...
│   └── stacks/     # 13 个技术栈指南
└── references/
```
