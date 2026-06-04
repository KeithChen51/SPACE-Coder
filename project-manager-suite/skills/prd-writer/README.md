# prd-writer

面向 AI 编程的 PRD 撰写 Skill。基于已确认的页面代码和技术地基（术语表、Schema、API），产出功能列表、mainprd 和按区块拆分的 subprd。

## 在流水线中的位置

```
BRD → page-designer → foundation-builder → prd-writer → ...
```

## 上游依赖

| 来源 Skill | 产物 |
|-----------|------|
| brd-writer | BRD 文件 |
| page-designer | 页面交付清单 + 页面代码（Vue 3） |
| foundation-builder | 术语表 + Schema + API + 交付清单 |

## 产物

| 产物 | 说明 |
|------|------|
| 功能列表 | 产品背景 + 页面全景 + 区块业务逻辑 |
| mainprd | 全局索引枢纽，引用所有上游产物，索引所有 subprd |
| subprd(N份) | 按区块拆分，字段级可追溯，与 mainprd 双向引用 |

## 核心原则

- PRD 是 AI 编程的规格说明书，不是给人看的传统文档
- 术语/Schema/API 只引用 foundation-builder 产物，不重新定义
- subprd 边界严格，字段/接口/管理页不越界
