---
name: cloud-deploy
description: >
  将本地代码改动部署到云端服务器。覆盖完整流程：本地构建验证 → SCP 上传 → 云端文件替换 → 服务重启 → 部署验证。
  当用户说「部署」「发布」「推到云端/线上/服务器」「deploy」「上线」「更新服务器代码」时触发此 skill。
  即使用户只说"把改动部署一下"也要使用。覆盖前端（Vite + Nginx）和后端（Java Spring Boot + Maven）两条部署路径。
  当部署涉及代码修复时（修 bug 后部署验证），也必须使用此 skill——它包含了"修复→构建→部署→验证"闭环中的踩坑经验。
---

# Cloud Deploy — 云端部署 Skill

将本地改动安全部署到云端服务器。

## 核心原则

- **先验证再上传**：本地构建/编译必须通过才能部署
- **双写源码和产物**：前端同时更新 `/data/apps/`（源码）和 `/data/www/`（构建产物），避免下次部署脚本回滚
- **最小化上传**：后端只传改动的 Java 文件，不整包替换，减少覆盖风险
- **环境变量一致**：重启后端时必须带 DB 环境变量，从旧进程或 `.env` 获取
- **部署后必验证**：curl API 或浏览器检查，确认新代码已生效

## 环境配置

所有配置从项目根目录 `.env` 读取：

| 变量 | 用途 |
|------|------|
| `CLOUD_IP` | 服务器 IP |
| `CLOUD_SSH_PASSWORD` | SSH 密码 |
| `SERVER_BACKEND_DIR` | 后端源码目录 |
| `SERVER_TOC_DIR` | C 端前端源码目录 |
| `PUBLISH_TOC_DIR` | C 端前端发布目录（Nginx serve） |
| `PUBLISH_ADMIN_DIR` | 管理端前端发布目录 |
| `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` | 后端启动时需要的数据库连接信息 |

SSH 用户统一为 `root`。

本地源码目录不强制写入 `.env`，可以按以下优先级确定：
- 用户直接指定的本地目录
- 仓库内可识别的前端 / 管理端 / 后端模块目录
- 临时在当前会话中约定的本地变量：`LOCAL_TOC_DIR`、`LOCAL_ADMIN_DIR`、`LOCAL_BACKEND_DIR`

## SSH 连接方式

本地没有 `sshpass`，使用 `expect` 处理密码交互：

```bash
expect -c '
set timeout 30
spawn ssh root@${CLOUD_IP}
expect "password:" { send "${CLOUD_SSH_PASSWORD}\r" }
expect "#"
send "你的命令\r"
expect "#"
send "exit\r"
expect eof
'
```

SCP 同理，把 `spawn ssh` 换成 `spawn scp`。

## 部署流程

### Step 0: 读取配置

从 `.env` 文件解析所需的环境变量值。后续步骤中的 `${CLOUD_IP}` 等远端占位符都来自这里；`${LOCAL_TOC_DIR}`、`${LOCAL_ADMIN_DIR}`、`${LOCAL_BACKEND_DIR}` 表示本地源码目录，可由用户指定或由仓库结构识别得到。

### Step 1: 确定改动范围

检查哪些文件被修改了（`git diff --name-only` 或用户告知），判断需要部署：
- **前端（C 端）**：宿主项目 C 端前端源码目录下的文件
- **前端（管理端）**：宿主项目管理端前端源码目录下的文件
- **后端**：宿主项目后端源码目录下的文件

### Step 2: 本地构建验证

#### 前端（C 端 / 管理端）

**管理端构建必须带 base path**：如果管理端部署在 `/admin/` 子路径下，Vite 需要知道这个路径才能生成正确的资源引用。不带这个变量构建出来的 `index.html` 会引用 `/assets/xxx.js` 而不是 `/admin/assets/xxx.js`，导致页面白屏。

```bash
# C 端前端（部署在根路径 /）
cd ${LOCAL_TOC_DIR} && npm run build

# 管理端前端（部署在 /admin/ 子路径）
cd ${LOCAL_ADMIN_DIR} && VITE_PUBLIC_BASE_PATH=/admin/ npx vite build
```

**必须在对应子目录下执行构建**，不要在项目根目录跑 `npx vite build`，否则找不到 `index.html` 入口。

构建成功会生成 `dist/` 目录，包含：
- `index.html` — 入口文件，引用带 hash 的资源
- `assets/` — JS/CSS bundle（文件名含 content hash）

**构建后检查 base path 是否正确（管理端必做）**：
```bash
# 确认 index.html 中的资源引用包含 /admin/ 前缀
grep -o 'src="[^"]*"' dist/index.html
# 预期: src="/admin/assets/index-xxx.js"
# 如果看到 src="/assets/index-xxx.js"（没有 /admin/）→ 构建时漏了 VITE_PUBLIC_BASE_PATH
```

由于 Vite 构建产物文件名含 content hash，`index.html` 和 `assets/` 必须整包替换，不能按单文件更新。
构建成功会生成 `dist/` 目录，包含：
- `index.html` — 入口文件，引用带 hash 的资源
- `assets/` — JS/CSS bundle（文件名含 content hash）

由于 Vite 构建产物文件名含 content hash，`index.html` 和 `assets/` 必须整包替换，不能按单文件更新。

**构建产物健康检查（必做）**：

`npm run build` 成功退出不代表产物正确。两类常见的"构建成功但产物有问题"：

1. **Tailwind CSS 静默降级**：v3 语法 + v4 插件等配置不匹配时，CSS 构建不报错但样式大面积缺失
2. **base path 缺失**：管理端构建时漏了 `VITE_PUBLIC_BASE_PATH=/admin/`，HTML 引用 `/assets/...` 导致 404 白屏

构建完成后，立即执行以下检查：

```bash
# 1. CSS 文件大小检查（正常应 > 15KB，低于 10KB 基本确认样式缺失）
ls -la dist/assets/*.css

# 2. 关键样式类抽检（至少检查 5 个项目常用的类名，仅 Tailwind 项目需要）
cat dist/assets/*.css | grep -oE '\.(bg-white|rounded-xl|p-4|font-bold|shadow-card)' | sort -u
# 预期：5 个全部命中。缺失任何一个 = 构建产物有问题，禁止上传

# 3. base path 检查（管理端必做）
grep -o 'src="[^"]*"' dist/index.html
# 管理端预期: src="/admin/assets/..."
# C 端预期: src="/assets/..."
```

如果 CSS 检查失败，排查方向：
- Tailwind CSS 版本与语法是否匹配（v3 用 `@tailwind`，v4 用 `@import "tailwindcss"`）
- `postcss.config.js` 中的插件是否与 `tailwind.config.js` 兼容
- CSS 入口文件是否正确引用了配置（v4 需要 `@config` 指令）

#### 后端
```bash
cd ${LOCAL_BACKEND_DIR} && JAVA_HOME="/opt/homebrew/opt/openjdk@17" mvn compile
```
本地数据库不可达，编译通过即可（验证 Java 语法正确、无缺失依赖）。不需要 `spring-boot:run`。

### Step 3: 上传文件

#### 3a: 前端

两批文件需要上传：

**源文件** → `${SERVER_TOC_DIR}/`（保持云端源码同步）：
```bash
# SCP 每个改动的源文件到对应的云端路径
# 例如：src/App.vue → ${SERVER_TOC_DIR}/src/App.vue
expect -c '
spawn scp local/path/to/file root@${CLOUD_IP}:${SERVER_TOC_DIR}/对应路径
expect "password:" { send "${CLOUD_SSH_PASSWORD}\r" }
expect eof
'
```

**构建产物** → `${PUBLISH_TOC_DIR}/`（Nginx 直接 serve）：
```bash
# 先清理旧 assets，再整包上传 dist/
expect SSH 到云端执行:
  rm -rf ${PUBLISH_TOC_DIR}/assets
然后 SCP:
  scp dist/index.html → ${PUBLISH_TOC_DIR}/
  scp -r dist/assets → ${PUBLISH_TOC_DIR}/
```

前端部署后 Nginx 立即生效，无需重启。

#### 3b: 后端

只上传改动的 Java 文件：
```bash
# SCP 改动的文件到云端对应路径
# 例如：
# 本地: src/main/java/com/example/app/controller/XxxController.java
# 云端: ${SERVER_BACKEND_DIR}/src/main/java/com/example/app/controller/XxxController.java
```

### Step 4: 重启后端

后端以 `mvn spring-boot:run` 从源码直接运行。重启步骤：

```bash
# 1. 查看当前进程信息（确认 PID 和启动参数）
ps aux | grep spring-boot | grep -v grep

# 2. 杀掉旧进程
pkill -f spring-boot:run
sleep 3

# 3. 带环境变量重启
cd ${SERVER_BACKEND_DIR} && \
  export DB_URL='${DB_URL}' && \
  export DB_USERNAME='${DB_USERNAME}' && \
  export DB_PASSWORD='${DB_PASSWORD}' && \
  nohup mvn spring-boot:run > /tmp/backend.log 2>&1 &

# 4. 等待启动（约 30 秒）
sleep 30
tail -5 /tmp/backend.log
```

环境变量至关重要 — `application.yml` 中 `DB_PASSWORD` 没有默认值，不传则连不上数据库。
如果不确定该传什么值，先用 `ps aux | grep spring-boot` 看旧进程的启动命令，或者读 `.env`。

### Step 5: 部署验证

#### 后端验证
```bash
# 无参数调用应返回错误（参数校验生效）
curl -s http://localhost:8080/api/items
# 期望: {"code":500,"message":"缺少查询参数..."}

# 带参数调用应正常返回
curl -s "http://localhost:8080/api/items?query=demo"
# 期望: {"code":200,...}
```

#### 前端验证
浏览器访问 `http://${CLOUD_IP}/` 检查页面加载正常。或用 Playwright 自动化检查。

## 注意事项

1. **云端不是 git repo** — 不能用 `git pull`，只能 SCP 文件
2. **SCP 目标目录必须已存在** — 如果传到 `/tmp/` 临时目录，先 `mkdir -p`
3. **后端重启有 30 秒空窗期** — 杀掉旧进程到新进程就绪之间 API 不可用
4. **管理端前端**部署流程与 C 端相同，只是目录换成 `${LOCAL_ADMIN_DIR}` 和 `${PUBLISH_ADMIN_DIR}`，但构建时必须带 `VITE_PUBLIC_BASE_PATH=/admin/`
5. **多个 expect 命令**可以合并成一个 SSH 会话内执行多条命令，减少连接次数
6. **SCP 目录 trailing slash 行为不同** — 这是已经踩过的坑：
   - `scp -r dist/assets root@host:/target/` → 在 `/target/` 下创建 `assets/` 目录（正确）
   - `scp -r dist/assets/ root@host:/target/` → 把 `assets/` 里的文件散落到 `/target/` 下（错误）
   - 永远用 **不带** trailing slash 的形式：`scp -r dist/assets`

## 修复→部署→验证闭环

当部署的目的是修复 bug 时（不是单纯发布新功能），容易陷入"改代码 → 构建 → 部署 → 发现没修好 → 再改"的循环。以下是从实际踩坑中提炼的原则：

### 修代码前：先对比 working vs broken

**不要假设任何"基础设施"一定没问题。** 如果页面上 A 功能正常、B 功能异常，首先对比 A 和 B 在代码中的唯一差异是什么，这个差异通常就是根因方向。

示例：某个表单字段双向绑定正常，而某个表格单元格内的选择器失效。唯一差异可能就在 **table slot 上下文**。如果第一次修复失败后就做这个对比，往往一轮就能定位。

### 修完代码后：完整走一遍部署流程

每次改完代码，不要急着只做"最小操作"，而是完整执行 Step 2 → Step 3 → Step 5：

1. **构建前检查**：确认在正确目录、带正确环境变量
2. **构建后检查**：确认 hash 变了（和上次不同）、base path 正确
3. **上传前检查**：先 `rm -rf` 旧 assets，再 SCP（不带 trailing slash）
4. **上传后检查**：SSH 到云端 `ls` 确认文件结构正确
5. **功能验证**：用浏览器或 Playwright 实际操作一遍改动的功能，不要只 curl API

## 部署报告模板

部署完成后输出以下摘要：

```
## 部署报告

**时间**: YYYY-MM-DD HH:MM
**目标**: ${CLOUD_IP}

### 上传文件
| 文件 | 目标路径 | 状态 |
|------|---------|------|
| xxx  | xxx     | 已上传 |

### 服务状态
| 服务 | 操作 | 状态 |
|------|------|------|
| 前端 C 端 | dist 替换 | 已生效 |
| 后端 | 重启 (PID: xxx) | 已启动 |

### 验证结果
| 检查项 | 结果 |
|--------|------|
| API 无参数拦截 | PASS |
| API 正常查询 | PASS |
```
