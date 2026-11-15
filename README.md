# 技术栈

- 前端：Next.js、React、TypeScript、Tailwind CSS。
- 后端：FastAPI、Pydantic、Uvicorn、Python。
- AI 能力：Dify Agent。问答、课程辅导、动态出题、评价和补救均通过后端调用 Dify。
- 数据库：PostgreSQL，保存账户、课程目录、学习状态、作答分数与后台配置。课程资料与检索由 Dify 管理，不需要 `pgvector`。

# 启动方式

## 环境变量

首次配置时，复制 `backend/.env.example` 为 `backend/.env.local`，填写数据库、管理员创建授权码和前端来源。已有配置不要覆盖。Dify 地址、API Key 与每门课程的完成门限在管理员后台填写：

```env
# PostgreSQL 连接串示例
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ml_coach

# 前端地址，默认即可用于本地开发
FRONTEND_ORIGIN=http://localhost:3000

# 创建管理员时使用的独立授权码
ADMIN_AUTHCODE=替换为你的管理员创建授权码
# Dify 请求超时；地址与密钥通过管理员后台管理
DIFY_TIMEOUT_SECONDS=120
```

复制 `frontend/.env.example` 为 `frontend/.env.local`，配置：

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

如果前后端不在同一台机器或端口，需要同步修改后端的 `FRONTEND_ORIGIN` 和前端的 `NEXT_PUBLIC_API_BASE_URL` 。

模型、提示词、知识资料和检索策略在 Dify 应用中配置。在后台“课程管理 → 编辑课程”分别填写各课程的 Dify 地址、API Key 与学习完成门限；后台“Dify 配置”单独设置自由问答服务。自建 Dify 时请使用实例的 Service API 地址（包含 `/v1`），不要填写 WebApp 分享地址或知识库 API Key。保存后的密钥加密存储，不回显明文；输入框留空会保留原密钥，填写新密钥才会替换。

## 安装依赖

需要 Node.js、Python 和 PostgreSQL。在项目根目录运行：

```powershell
python -m venv backend/.venv
./backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
cd frontend
npm install
cd ..
```

## 后端

新数据库先在项目根目录运行 `./backend/.venv/Scripts/python.exe operations/database/initialize.py` 初始化表结构。需要默认课程时，再进入 `backend` 目录执行 `./.venv/Scripts/python.exe -m app.cli.seed_curriculum` 手动导入；该命令会重新写入默认知识点，仅在需要导入时使用。服务启动不再自动导入课程，以免永久删除的知识点在重启后重新出现。

已有数据库升级到 Dify 凭据身份版本时，在项目根目录执行：

```powershell
./backend/.venv/Scripts/python.exe operations/database/migrate_dify_credentials.py
```

该命令使用 `backend/.env.local` 中的数据库与加密配置，增量创建凭据表、添加关联字段，并为已有课程和自由问答配置建立内部 ID。可以重复执行；不会重建业务表或覆盖原有密钥。回填需要原来的 `backend/.runtime/settings.key` 或同一个 `SETTINGS_ENCRYPTION_KEY`；无法解密时整次升级回滚。新建数据库直接初始化即可。

已有数据库启用 Dify 调用明细时，先完成上面的凭据身份升级，再执行：

```powershell
./backend/.venv/Scripts/python.exe operations/database/migrate_dify_call_logs.py
```

该脚本只创建调用明细表及索引，可以重复执行；新数据库直接初始化即可获得完整结构。

Windows PowerShell：

```powershell
cd backend
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端健康检查：`http://localhost:8000/health`

## 前端

```powershell
cd frontend
npm run dev
```

然后访问 `http://localhost:3000`。

## 测试和构建

```powershell
# 后端测试
cd backend
./.venv/Scripts/python.exe -m pytest -q -p no:cacheprovider

# 前端检查和生产构建
cd ../frontend
npm run typecheck
npm run lint
npm run test:practice-content
npm run test:storage
npm run test:knowledge-graph
npm run build
```

## 运行数据说明

业务数据存储在 `DATABASE_URL` 指向的 PostgreSQL 数据库中，课程资料由 Dify 管理。

当前保留 11 张表：学生、管理员、学生登录会话、课程、章节、知识点、知识点关联、学生学习状态、自由问答 Dify 配置、Dify 凭据和 Dify 调用明细。知识点通过 `chapter_id` 关联章节，章节名称及顺序不再重复存储在知识点中。删除知识点、章节或课程均为永久删除，关联关系和学习分数同步清理；调用明细独立保留历史归属 ID。

Dify 凭据按规范化服务地址和 API Key 的 SHA-256 指纹去重，密钥继续加密存储。同一服务下多个课程及自由问答复用同一 Key 时共享内部 ID；更换 Key 或服务地址会关联另一条凭据，旧记录保留，换回原 Key 和服务地址时复用原 ID。只修改课程名称、完成门限或留空密钥不会改变凭据身份。现有配置中的加密字段保留以兼容原有读写；内部凭据 ID 和指纹不通过现有前端接口返回。

真实 Dify 调用在发起前创建一条 `dify_call_logs` 记录，结束后更新为成功、失败、超时或取消。记录学生／匿名身份、课程、知识点、学习模式、凭据 ID、带时区的起止时间、耗时、Token、NUMERIC 费用、币种及上游标识；不保存问题、回答、请求头、明文密钥或上游错误正文。缺失用量为 NULL，实际报告的零值保留；失败也保留已收到的用量，费用采用 Dify 报告值。

`POST /api/v1/chat` 可选传入 UUID 格式的 `request_id`，同一业务请求显式重试时复用该值；每次实际上游调用仍使用独立明细 ID、分别计量，不自动重试、不复用旧回答。不传时后端为本次请求生成 ID。结束记录仅从“进行中”更新一次，重复结束处理不会重复计量。

首次日志写入失败会在调用 Dify 前返回 503，避免产生未记录的调用；上游执行后结束写入失败，则保留进行中的记录供后续核对，仍返回已获得的回答或原调用错误。进程中断也可能留下进行中的记录，自动补查在后续异常核对功能中实现。

管理员登录后，通过后台导航或概览中的“调用日志”进入 `/admin/call-logs`，按时间倒序分页查看最近调用。列表每页 20 条，展示学生、课程／知识点、业务类型、状态、输入／输出／总 Token、Dify 报告费用与币种、耗时及凭据内部 ID。时间固定显示北京时间，缺失用量显示“未知”，实际零值保留，费用以字符串传输以保持精度。可手动刷新，加载失败时可重试；手机端可横向滚动表格。已删除的账户或课程仍通过原 ID 展示历史归属。列表接口仅管理员可访问且禁止缓存。

列表支持按 Key（内部凭据 ID）、学生姓名／用户名／ID、课程名称／ID、知识点名称／ID、学生类型、业务类型、状态和时间范围组合筛选。名称与 ID 按字面子串匹配，不区分大小写，不将 `%`、`_` 作为通配符；历史记录可以按原 ID 查找。凭据选项展示其当前课程／自由问答标签，无当前关联的标记为历史凭据，另有“未关联凭据”选项。筛选提交后回到第 1 页，条件保存在 URL 中，翻页、刷新及详情返回时保留，也可以一键清除。

时间范围使用北京时间，包含开始时间、不包含截止时间；即 `started_at >= started_from AND started_at < started_before`。接口时间必须携带时区，例如 `2026-11-16T00:00:00+08:00`，通过 URL 参数传递时需要编码。学生类型参数为 `registered` 或 `anonymous`，未关联凭据使用 `credential_id=unassigned`；其他凭据使用 UUID。所有条件以交集查询，总量与分页使用相同条件和数据库快照。

点击列表中的“查看详情”进入 `/admin/call-logs/{callId}`，查看单次调用的完整用量、费用、业务归属、HTTP 状态、错误类型、起止时间、业务请求编号，以及会话、消息、任务、工作流运行标识。错误摘要由固定类型生成，不回显上游错误正文或密钥信息。未知用量不代表零消耗；进行中记录会提示可能仍在执行或结束记录未写入，可手动刷新核对。详情页支持失败重试及不存在记录提示，返回列表时保留原页码和筛选条件；详情接口仍要求管理员身份，并禁止缓存。

费用同时支持人民币参考换算：列表和详情优先显示“约 … CNY”，并保留原金额及币种。原币种为 CNY 时直接显示，不重复换算；详情中展示汇率、发布日期和来源，列表可通过金额提示查看汇率信息。汇率来自 [Frankfurter v2 的公开参考汇率](https://frankfurter.dev/)，按查看时的最新可用数据计算，因此历史记录的人民币估算可能随汇率更新；数据库中的原始费用不变。这是显示估算，不改变原币种记账或额度口径。

后端使用 Decimal 计算，并以字符串传输换算结果，小额费用不四舍五入到零。每个币种的成功汇率缓存 1 小时，失败结果缓存 1 分钟；查询公开接口时只发送币种代码，不发送学生、调用、密钥或金额。获取汇率失败或币种不受支持时，日志仍正常显示原金额，并提示“人民币暂未换算”；未知原费用仍显示“未知”。此功能无需数据库升级。

学生提交答案后，后端读取 AI 的本次总分（满分 100），保存最新分数、最高分及作答次数，并按该课程的完成门限更新知识点状态。新课程默认门限 `80`，严格高于门限标记“已完成”，等于或低于门限标记“学习中”，后续低分会改回学习中。管理员修改门限时，已保存的最新评分也会重新判定状态。仅作答评价会记录分数；讲解、追问和自由问答不会改变成绩。后端在作答请求中追加一条简短的评分格式要求，隐藏回复末尾的评分标记；未返回有效分数时提示未评分并保留原状态。

新部署由初始化脚本直接创建当前表结构；已有数据库依次使用上面的 Dify 凭据与调用明细增量升级脚本。更早版本的数据部署需导入当前数据库导出的结构与数据。

配置加密密钥与数据库分开存放：默认自动生成 `backend/.runtime/settings.key`，已排除 Git 跟踪；部署时需保持该文件持久化、不可随意更换。多实例部署可通过同一个 `SETTINGS_ENCRYPTION_KEY` 提供固定 Fernet 主密钥。Dify 密钥修改后新的请求立即生效，更换应用时已有对话可能需要重新开始。

## 当前代码结构

```text
backend/app/
  api/             # 问答、账户、课程目录、知识图谱、概览和开始学习
  core/            # 环境配置、异常、日志与课程枚举
  curriculum/      # 四门课程目录与幂等同步
  db/              # PostgreSQL 连接
  schemas/         # 当前请求响应与学习状态类型
  services/        # Dify、会话签名、账户与学习状态
frontend/
  app/             # 自由问答、登录、课程学习、知识图谱、课程管理、设置
  components/      # 对话、目录、输入及会话状态
  lib/             # 统一 API、类型、存储、参考答案分离
  tests/           # 存储兼容、对话恢复、答案展示与图谱布局测试
operations/database/ # 当前数据库初始化结构和入口
```

## 当前 API

| 接口 | 用途 |
| --- | --- |
| `GET /health` | 服务状态 |
| `POST /api/v1/chat` | 自由问答与知识点对话 |
| `POST /api/v1/students/register`、`login`、`logout` | 账户操作 |
| `GET /api/v1/students/me` | 当前学生 |
| `POST /api/v1/admins/register`、`login`、`logout` | 管理员创建、登录和退出 |
| `GET /api/v1/admins/me` | 验证当前管理员 |
| `GET /api/v1/admin/dify/call-logs` | 管理员组合筛选调用日志；支持 `credential_id`、`student`、`course`、`topic`、`student_type`、`business_type`、`status`、`started_from`、`started_before`；`page` 默认 1，`page_size` 默认 20、最大 50 |
| `GET /api/v1/admin/dify/call-logs/filter-options` | 管理员读取有调用记录的凭据选项及关联标签，不返回密钥或指纹 |
| `GET /api/v1/admin/dify/call-logs/{call_id}` | 管理员查看单次调用详情；`call_id` 为 UUID，记录不存在时返回 404 |
| `GET /api/v1/courses` | 学生端可用课程列表 |
| `GET /api/v1/knowledge-graph` | 学生登录后读取已启用课程的知识图谱 |
| `GET /api/v1/admin/knowledge-graph` | 管理员读取知识图谱（含停用课程） |
| `GET`、`POST /api/v1/admin/courses` | 管理员查询、新增课程 |
| `GET`、`PATCH`、`DELETE /api/v1/admin/courses/{course_id}` | 管理员查看、修改、删除课程 |
| `GET /api/v1/admin/related-topics` | 搜索相关知识点候选，支持课程、当前节点排除和分页 |
| `GET`、`POST /api/v1/admin/courses/{course_id}/topics` | 查询编排、新增知识点（提交固定 `chapter_id`） |
| `POST /api/v1/admin/courses/{course_id}/topics/groups` | 新增独立章节，提交 `title` |
| `PUT`、`DELETE /api/v1/admin/courses/{course_id}/topics/{topic_id}` | 修改、永久删除所属知识点及数据库相关数据 |
| `PUT /api/v1/admin/courses/{course_id}/topics/order` | 调整章内知识点顺序 |
| `PATCH /api/v1/admin/courses/{course_id}/topics/groups/{chapter_id}` | 重命名章节 |
| `DELETE /api/v1/admin/courses/{course_id}/topics/groups/{chapter_id}` | 永久删除章节及其知识点，需提交确认的 `title` 和 `topic_ids` |
| `POST /api/v1/admin/courses/{course_id}/topics/groups/order` | 调整章节顺序 |
| `GET /api/v1/curriculum/topics`、`topics/{topic_id}` | 知识点列表与详情 |
| `GET /api/v1/courses/{course}/outline` | 分组课程目录 |
| `GET /api/v1/learning/dashboard` | 课程概览和学习进度 |
| `POST /api/v1/learning/topics/{topic_id}/start` | 保存开始学习状态 |
