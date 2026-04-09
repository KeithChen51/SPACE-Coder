# Phase 5: 一致性自查

> 本文件在进入 Phase 5 时由 SKILL.md 指令加载。

## 触发条件

Phase 4 所有子文档完成并获用户确认后进入。

## 输入

- 所有已产出的子 PRD 文件
- `explainer-flow-<slug>.md`（用户流程）
- `explainer-c-interaction-<slug>.md` / `explainer-b-interaction-<slug>.md`（交互语义，仅 locked 条目）
- `explainer-b-permission-<slug>.md`（B 端权限矩阵）
- `foundation-glossary-<slug>.md`（术语表）
- `foundation-schema-<slug>.md`（数据库 Schema）
- `foundation-api-<slug>.md`（API 接口设计）
- `prd-feature-list-<slug>.md`（功能列表）
- `prd-main-<slug>.md`（主文档）

## 检查矩阵

| # | 检查维度 | 验证逻辑 |
|---|---------|---------|
| P1 | 子 PRD 数据链路 ↔ Schema | 子 PRD 数据链路表中每个"来源表.列"在 foundation-schema 中存在 |
| P2 | 子 PRD 接口引用 ↔ API | 子 PRD 引用的每个接口在 foundation-api 中存在，字段名一致 |
| P3 | 子 PRD 术语 ↔ 术语表 | 子 PRD 中出现的业务术语在 foundation-glossary 中有定义 |
| P4 | 子 PRD ↔ 功能列表 | 功能列表中的每个区块都有对应子 PRD，无遗漏 |
| P5 | 主 PRD 索引 ↔ 子 PRD | 主 PRD 子 PRD 索引表与实际产出的子文档一致 |
| P6 | 子 PRD 交互 ↔ 交互语义 | 子 PRD 中描述的交互行为与 explainer 交互语义中对应的 locked 条目一致，不自行重新定义 |
| P7 | 子 PRD 权限 ↔ 权限矩阵 | 子 PRD 中涉及的角色权限描述与 explainer-b-permission 矩阵一致 |
| P8 | 功能列表流程 ↔ 用户流程 | 功能列表中的页面覆盖范围与 explainer-flow 中定义的用户流程一致，无遗漏流程 |

## 检查方式

### P1: 数据链路 ↔ Schema

逐份子 PRD，提取所有数据链路表中的"数据源（服务端读取）"和"配置源（服务端读取）"列：

```markdown
| 子 PRD | UI 元素 | 来源表.列 | Schema 中存在 |
|--------|---------|----------|--------------|
| prd-xxx-轮播区 | 轮播图片 | banner.image_url | ✓ |
| prd-xxx-商品区 | 分类名 | ❌ 无对应 | ✗ |
```

### P2: 接口引用 ↔ API

逐份子 PRD，提取所有引用的接口路径：

```markdown
| 子 PRD | 引用接口 | foundation-api 中存在 | 字段一致 |
|--------|---------|---------------------|---------|
| prd-xxx-轮播区 | GET /api/banner | ✓ | ✓ |
| prd-xxx-商品区 | GET /api/product/recommend | ✗ | — |
```

### P3: 术语 ↔ 术语表

逐份子 PRD，提取业务术语（非技术术语），与 foundation-glossary 对比：

```markdown
| 子 PRD | 使用术语 | glossary 中存在 |
|--------|---------|----------------|
| prd-xxx-轮播区 | 轮播 | ✓ |
| prd-xxx-商品区 | 推荐商品 | ✗ |
```

### P4: 功能列表 ↔ 子 PRD

对比功能总表中的区块列表与实际产出的子 PRD 文件：

```markdown
| # | 区块 | 子 PRD 文件 | 存在 |
|---|------|-----------|------|
| 1 | 轮播区 | prd-xxx-轮播区.md | ✓ |
| 2 | 商品推荐区 | prd-xxx-商品推荐区.md | ✓ |
| 3 | 底部导航 | — | ✗ 缺失 |
```

### P5: 主 PRD 索引 ↔ 子 PRD

对比主文档子 PRD 索引表与实际产出的子 PRD 文件，确保双向引用完整。

## 不一致时的处理

| 不一致类型 | 处理方式 |
|-----------|---------|
| 子 PRD 写错（引用了不存在的表/接口/术语） | 修正子 PRD |
| foundation 产物漏了（确实需要新增字段/接口） | 标记为"需回溯 foundation-builder 补充" |
| 功能列表有区块但缺子 PRD | 补写缺失的子 PRD |
| 主 PRD 索引不完整 | 回填主 PRD 索引表 |

**回溯 foundation-builder**：如果检查发现 foundation 产物确实缺少了子 PRD 需要的表/字段/接口，不在 prd-writer 中自行定义，而是：
1. 列出所有需要 foundation-builder 补充的项
2. 向用户报告，由用户决定是否触发 foundation-builder 增量更新
3. foundation-builder 更新完成后，重新执行 Phase 5 检查

## 检查结果摘要

```markdown
## 一致性自查结果

- 检查时间: YYYY-MM-DD HH:MM
- P1 数据链路覆盖: x/x (100%)
- P2 接口引用覆盖: x/x (100%)
- P3 术语覆盖: x/x (100%)
- P4 功能列表→子PRD: x/x (100%)
- P5 主PRD索引完整: ✓
- P6 交互语义一致: x/x (100%)
- P7 权限矩阵一致: x/x (100%)
- P8 流程覆盖: x/x (100%)
- 需回溯 foundation-builder: 无 / 列表
```
