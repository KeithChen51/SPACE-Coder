# 编码规范索引

> **适用项目**：Prime-Trace（Java Spring Boot + Vue 3 + MySQL）
> **规范来源**：阿里巴巴 Java 开发手册 + 项目实际技术栈定制
> **使用方式**：AI 通过 `.agent/skills/coding-standards/SKILL.md` 自动导航；人工可直接浏览本索引
> **权威源说明**：本目录是项目内规范权威源；若当前 AI IDE 不支持 skill，直接从本文件进入即可

---

## 规则等级

| 标记 | 含义 |
|------|------|
| 【强制】 | 必须遵守，违反可能导致 Bug 或严重可维护性问题 |
| 【推荐】 | 建议遵守，提升代码质量和一致性 |
| 【参考】 | 了解即可，视场景灵活采用 |

---

## 子文档一览

| # | 文件 | 适用场景 | 行数 |
|---|------|---------|------|
| 01 | [java-naming.md](./01-java-naming.md) | 类名/方法名/变量名/常量/领域模型命名 | ~80 |
| 02 | [java-formatting.md](./02-java-formatting.md) | 缩进/大括号/换行/注释格式 | ~60 |
| 03 | [java-oop.md](./03-java-oop.md) | OOP 规约/集合处理/并发 | ~80 |
| 04 | [java-exception-log.md](./04-java-exception-log.md) | 异常处理/日志输出 | ~60 |
| 05 | [mysql-table.md](./05-mysql-table.md) | 建表/字段/索引 | ~80 |
| 06 | [mysql-sql-orm.md](./06-mysql-sql-orm.md) | SQL 语句/MyBatis ORM 映射 | ~60 |
| 07 | [vue-frontend.md](./07-vue-frontend.md) | Vue 3 组件/样式/请求层 | ~60 |
| 08 | [engineering.md](./08-engineering.md) | 工程分层/领域模型/API 路径 | ~50 |
| 09 | [api-design.md](./09-api-design.md) | REST API 设计/响应格式/分页 | ~70 |
| 10 | [testing.md](./10-testing.md) | 单元测试/自动化断言规范 | ~60 |
| 11 | [test-case-design.md](./11-test-case-design.md) | 测试用例文档设计/编号/验收矩阵/缺陷回归 | ~170 |

---

## 加载规则

1. **AI 加载**：通过 `coding-standards` skill 自动匹配任务类型 → 只读 1-2 个子文档
2. **人工查阅**：按上表找到对应文件直接阅读
3. **禁止全量读入**：11 个子文档总计 ~850 行，禁止一次性全部读取
