# 编码规范索引

> **适用项目**：通用 Java Spring Boot + Vue 3 + MySQL 技术栈项目
> **规范来源**：阿里巴巴 Java 开发手册 + 项目实际技术栈定制
> **使用方式**：AI 通过 `project-manager-suite/skills/coding-standards/SKILL.md` 自动导航；人工可直接浏览本索引
> **权威源说明**：本目录是当前 skill 的规范权威源；若当前 AI IDE 不支持 skill，直接从本文件进入即可

---

## 规则等级

| 标记 | 含义 |
|------|------|
| 【强制】 | 必须遵守，违反可能导致 Bug 或严重可维护性问题 |
| 【推荐】 | 建议遵守，提升代码质量和一致性 |
| 【参考】 | 了解即可，视场景灵活采用 |

---

## 当前规范文件一览

| # | 文件 | 适用场景 |
|---|------|---------|
| 01 | [01-java-naming.md](./01-java-naming.md) | 类名、方法名、变量名、常量、DTO / VO / Entity 命名 |
| 02 | [02-java-formatting.md](./02-java-formatting.md) | Java 缩进、大括号、换行、注释格式 |
| 03 | [03-java-oop.md](./03-java-oop.md) | OOP 规约、集合处理、并发与设计细节 |
| 04 | [04-java-exception-log.md](./04-java-exception-log.md) | 异常处理、日志输出、错误口径 |
| 05 | [05-mysql-table.md](./05-mysql-table.md) | 建表、字段、索引、DDL 规范 |
| 06 | [06-mysql-sql-orm.md](./06-mysql-sql-orm.md) | SQL 编写、查询优化、MyBatis / ORM 映射 |
| 07 | [07-vue-frontend.md](./07-vue-frontend.md) | Vue 3 组件、页面、交互与样式规范 |
| 08 | [08-engineering.md](./08-engineering.md) | 工程分层、领域模型、模块边界 |
| 09 | [09-api-design.md](./09-api-design.md) | REST API 设计、请求响应格式、分页与契约 |

---

## 当前范围说明

- 当前仓库实际内置的是 `01` 到 `09` 共 9 份规范文档。
- 测试规范和测试用例文档规范目前**未在本目录落地文件**，维护索引时不应提前列出不存在的文件。
- 若后续补充 `10-testing.md`、`11-test-case-design.md`，应同步更新本索引和 `coding-standards/SKILL.md` 的路由表。

---

## 加载规则

1. **AI 加载**：通过 `coding-standards` skill 自动匹配任务类型，只读取 1-2 个最相关子文档。
2. **人工查阅**：按上表找到对应文件直接阅读。
3. **禁止全量读入**：除非在做规范盘点或规则迁移，否则不要一次性读完整个目录。
