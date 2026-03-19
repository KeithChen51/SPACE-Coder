# 测试执行报告模板

## 目录结构

按**测试人员 → 区块**两层组织，参照团队表（`docs/ai-rules.md` §11）中的 git 用户名。

**命名规则**：所有中文区块报告文件和截图目录统一加 `测试验收-` 前缀，避免与 PRD 等文档混淆。

```
docs/test-case/reports/
├── defects.md                                    # 缺陷跟踪（全项目唯一）
└── {git用户名}/                                  # 按测试人员
    ├── index.md                                  # 索引（总览 + 链接各区块）
    ├── 测试验收-区块1-车辆选择.md                 # 按区块拆报告
    ├── 测试验收-区块2-状态判定.md
    └── screenshots/
        ├── 测试验收-区块1-车辆选择/               # 按区块分截图
        │   ├── CTC-B1-11.png
        │   └── ...
        └── 测试验收-区块2-状态判定/
            └── ...
```

## index.md 模板

```markdown
# 测试执行报告 — {姓名}

> **最后更新**: YYYY-MM-DD HH:MM
> **执行环境**: ${API_BASE_URL}

---

## 执行进度

| 区块 | 用例数 | 状态 | 报告 |
|------|--------|------|------|
| 区块1-车辆选择 | 15 | ✅ 15 PASS | [测试验收-区块1-车辆选择.md](测试验收-区块1-车辆选择.md) |
| 区块2-状态判定 | 19 | ⏳ 进行中 | [测试验收-区块2-状态判定.md](测试验收-区块2-状态判定.md) |

## 缺陷跟踪

> [defects.md](../defects.md) — 全项目共用
```

## 区块报告模板

每个区块一个文件，文件名格式为 `测试验收-{区块名}.md`（如 `测试验收-区块2-状态判定.md`）。

```markdown
# {区块名} — 测试报告

> **测试人员**: {git用户名}
> **执行环境**: ${API_BASE_URL}

---

## 第1轮（YYYY-MM-DD）

> 用例总数: 19 | PASS: 17 | FAIL: 2 | BLOCKED: 0

| 编号 | 名称 | 类型 | 结果 | 关键证据 |
|------|------|------|------|---------|
| CTC-STA-01 | NOT_DUE | API | ✅ PASS | status="NOT_DUE", themeColor="green" |
| CTC-STA-02 | DUE-天数 | API | ❌ FAIL | status="NOT_DUE", 预期 DUE |
| ... | | | | |

### 失败详情

> 详见 [defects.md](../defects.md) #8、#9
```

## 截图路径

截图保存到 `{git用户名}/screenshots/测试验收-{区块名}/` 下：
```
reports/hyhmacstudio/screenshots/测试验收-区块2-状态判定/CTC-STA-11.png
```

区块报告中引用截图的相对路径：
```markdown
[截图](screenshots/测试验收-区块2-状态判定/CTC-STA-11.png)
```

defects.md 中引用截图的相对路径（从 reports/ 根目录出发）：
```markdown
[截图](hyhmacstudio/screenshots/测试验收-区块2-状态判定/CTC-STA-11.png)
```

## 追加规则

- 每跑完一个区块，创建新的区块报告文件 + 更新 index.md 的进度表
- 同一区块重新跑（回归），在该区块文件中追加新的 `## 第N轮` 节
- 更新 index.md 头部的"最后更新"时间
