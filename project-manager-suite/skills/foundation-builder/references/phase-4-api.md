# Phase 4: API 接口设计

> 本文件在进入 Phase 4 时由 SKILL.md 指令加载。
> 同时加载：`coding-standards/references/09-api-design.md`

## 触发条件

Phase 3 Schema 已获用户确认后进入。

## 输入

- 已确认的术语表（`foundation-glossary-<slug>.md`）
- 已确认的 Schema（`foundation-schema-<slug>.md`）
- 页面代码文件（Vue 3 组件）
- `coding-standards/references/09-api-design.md`（外部规范，运行时读取）

## 表 → 接口映射逻辑

```
已确认的 Schema 表
  ↓
逐表推导接口：

C 端（/api/xxx）：
  - 列表页消费的表 → GET /api/<resource> 列表接口（带分页）
  - 详情页消费的表 → GET /api/<resource>/:id 详情接口
  - 一般只读（除非页面有表单提交动作，如用户下单、提交表单）
  - 聚合/统计展示 → GET /api/<resource>/summary

运营端（/api/admin/xxx）：
  - 固定行配置表（如全局配置，行数不变）→ GET + PUT
  - 可增删资源表 → 完整 CRUD：
    - GET    /api/admin/<resource>     列表（带分页+筛选）
    - GET    /api/admin/<resource>/:id 详情
    - POST   /api/admin/<resource>     新增
    - PUT    /api/admin/<resource>/:id 编辑
    - DELETE /api/admin/<resource>/:id 删除
  - 特殊操作 → 独立接口：
    - 上下架：PUT /api/admin/<resource>/:id/status
    - 排序：  PUT /api/admin/<resource>/sort
    - 批量操作：POST /api/admin/<resource>/batch-<action>
```

## coding-standards/09 规范要点（提醒）

加载 `coding-standards/references/09-api-design.md` 后，重点关注：

| 规范项 | 要求 |
|--------|------|
| 路径格式 | 全小写，连字符分隔（如 `/api/admin/order-label`） |
| C 端路径前缀 | `/api/xxx` |
| 管理台路径前缀 | `/api/admin/xxx` |
| 响应格式 | `{ code: number, msg: string, data: T }` |
| JSON 字段命名 | camelCase |
| 分页请求 | `page` + `pageSize` 参数 |
| 分页响应 | `{ list: T[], total: number, page: number, pageSize: number }` |
| HTTP 方法 | GET 查询 / POST 新增 / PUT 全量更新 / DELETE 删除 |

## 产物模板

文件名：`foundation-api-<slug>.md`

```markdown
# API 接口设计 - <项目名称>

> 生成时间: YYYY-MM-DD HH:MM
> 来源: foundation-builder Phase 4
> 关联: [术语表](foundation-glossary-<slug>.md) · [Schema](foundation-schema-<slug>.md)

---

## §1 全接口总览

### C 端接口

| # | 方法 | 路径 | 用途 | 详见 |
|---|------|------|------|------|
| 1 | GET | /api/xxx | xxx | §2.1 |

### 管理台接口

| # | 方法 | 路径 | 用途 | 详见 |
|---|------|------|------|------|
| 1 | GET | /api/admin/xxx | xxx | §3.1 |

---

## §2 C 端接口

### 2.1 `GET /api/xxx` — 用途

> 消费页面: <页面名称>
> 数据源表: <table_name>

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|

**响应 data**：

| 字段 | 类型 | 说明 | 来源表.列 |
|------|------|------|----------|

---

## §3 管理台接口

### 3.1 `GET /api/admin/xxx` — 用途

> 消费页面: <管理台页面名称>
> 数据源表: <table_name>

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|

**响应 data**：

| 字段 | 类型 | 说明 | 来源表.列 |
|------|------|------|----------|
```

## 接口设计原则

1. **逻辑独立**：每个接口只做一件事，不混合多个操作
2. **低耦合**：接口间不互相依赖调用结果
3. **来源可追溯**：响应中的每个业务字段必须标注 `来源表.列`
4. **请求可追溯**：请求中的每个业务字段必须对应 Schema 中的某个可写列

## 拆分规则

当产物超过 400 行时，拆为索引文件 + 子文件目录：

```
foundation-api-<slug>.md             ← 索引文件
  内容：全接口总览表格 + 指向子文件的链接

foundation-api-<slug>/
  ├── <module_name_1>.md             ← 单模块接口定义（按业务域分组）
  ├── <module_name_2>.md
  └── ...
```

## Schema 使用接口回填

Phase 4 完成后，回填 `foundation-schema-<slug>.md` 中每张表的 **使用接口** 占位：

1. 遍历所有已设计的 API 接口
2. 对于每个接口，找到其 `数据源表`
3. 在对应表的 **使用接口** 区域追加该接口信息
4. 格式：`- METHOD /api/path — 用途`

## 增量模式

若已有前次 `foundation-api-<slug>.md`：

1. 对比当前 Schema 与前次 API 的对应关系
2. **新增**：新增的 Schema 表 → 推导新接口追加
3. **变更**：已有表字段变更 → 更新对应接口的请求/响应字段
4. **可疑**：前次存在但对应表已标记删除的接口 → 标记为 `⚠️ 待确认`
5. 变更表格中增加 `变更` 列标记

## 用户确认要点

向用户确认时，提示关注：

1. 接口是否覆盖了所有页面的数据操作需求
2. C 端是否只有读取接口（除非页面有明确的提交动作）
3. 管理台的 CRUD 是否完整
4. 特殊操作（上下架、排序等）是否有独立接口
5. 分页接口的筛选参数是否合理

确认后方可进入 Phase 5。
