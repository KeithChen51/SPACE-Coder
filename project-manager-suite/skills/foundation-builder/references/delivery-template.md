# Phase 6: 交付清单落盘

> 本文件在进入 Phase 6 时由 SKILL.md 指令加载。

## 触发条件

Phase 5 一致性自查全部通过并获用户确认后进入。

## 交付清单模板

文件名：`foundation-delivery-<slug>.md`

```markdown
# Foundation 交付清单 - <项目名称>

> 生成时间: YYYY-MM-DD HH:MM
> Skill: foundation-builder
> 模式: 首次 / 增量更新

## 上游依赖

| 上游 Skill | 产物文件 |
|-----------|---------|
| brd-writer | <BRD 文件路径> |
| page-designer | <page-delivery 文件路径> |

## 交付产物

| 产物 | 主文件 | 行数 | 拆分子文件 |
|------|--------|------|----------|
| 术语表 | <foundation-glossary 路径> | N | — |
| 数据库 Schema | <foundation-schema 路径> | N | — 或 子文件清单 |
| API 接口设计 | <foundation-api 路径> | N | — 或 子文件清单 |

**"拆分子文件"列填写规则：**
- 单文件模式：填 `—`
- 拆分模式：填完整路径列表，一行一条，如：
  ```
  foundation-schema-<slug>/users.md
  foundation-schema-<slug>/orders.md
  foundation-schema-<slug>/products.md
  ```
- 下游消费协议见 PIPELINE.md §"产物拆分约定"；delivery 清单必须枚举全部子文件路径，不允许遗漏。

## 产物摘要

| 指标 | 数值 |
|------|------|
| 术语总数 | N |
| 数据表总数 | N |
| API 接口数 | N |

## 一致性自查结果

- 检查时间: YYYY-MM-DD HH:MM
- 页面字段覆盖率: x/x (100%)
- API ↔ Schema 覆盖率: x/x (100%)
- 术语一致性: 全部通过
- 孤立项: 无 / 列表

## 外部已有文件处理（若有）

| 原始文件 | 覆盖度 | 处理方式 | 废弃标注 |
|----------|--------|---------|---------|
| <文件名> | 完全/部分/不涵盖 | 融合/参考 | 已标注 |

## 下游可消费信息

| 下游 Skill | 应读取 | 用途 |
|-----------|--------|------|
| prd-writer | 本清单 + glossary + schema + api | 补充技术细节到 PRD，术语表统一全局命名 |
```

## 填写说明

| 字段 | 要求 |
|------|------|
| 主文件 | 必须是真实存在的路径（绝对路径或相对于项目根目录的路径）；拆分模式下指向索引文件 |
| 行数 | `wc -l` 的实际结果 |
| 拆分子文件 | 单文件模式填 `—`；拆分模式枚举子目录下全部 `*.md` 真实路径，缺一条即视为 delivery 不合格 |
| 一致性自查结果 | 直接从 Phase 5 检查结果摘要复制 |
| 外部已有文件处理 | 仅在 Phase 1 有外部已有文件时填写此节，否则删除此节 |

## 落盘后

交付清单落盘成功后，输出状态标记：

```
【Skill状态】foundation-builder | DONE
```
