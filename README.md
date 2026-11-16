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

模型、提示词、知识资料和检索策略在 Dify 应用中配置。后台“课程管理”集中管理课程与自由问答的 Dify 服务：在页面顶部展开“自由问答 Dify 配置”设置学生首页的自由问答服务；进入对应课程的详情／编辑页，填写课程 Dify 地址、API Key 与学习完成门限。也可点击页面顶部的“自由问答配置”快捷展开。原 `/admin/settings` 地址会自动跳转到 `/admin/courses#free-qa-settings`。

自建 Dify 时请使用实例的 Service API 地址（包含 `/v1`），不要填写 WebApp 分享地址或知识库 API Key。保存后的密钥加密存储，不回显明文；输入框留空会保留原密钥，填写新密钥才会替换。自由问答配置独立加载和保存，课程搜索、分页及列表加载失败不影响该表单；保存成功后清空密钥输入框。沿用原后台配置接口，无需数据库升级。

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

已有数据库启用密钥使用管理时，再执行：

```powershell
./backend/.venv/Scripts/python.exe operations/database/migrate_dify_credential_status.py
```

该脚本仅为凭据增加 `enabled` 字段，已有凭据默认启用；重复执行不会重新启用已停用的凭据，也不会修改密钥、配置和调用记录。新数据库由初始化脚本直接创建该字段。

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

学生登录页仅提供登录，账号和初始密码由管理员统一分配。管理员登录后，在后台导航或概览中进入“学生管理”（`/admin/students`），填写学生姓名、用户名、初始密码和确认密码，点击“创建学生账号”。创建成功后，将用户名和初始密码告知学生；用户名重复时会提示更换。

右侧“批量创建学生账号”支持每行填写一名学生，格式为 `学生姓名,用户名,密码`，必须使用英文逗号 `,` 分隔，不使用中文逗号 `，`，无需填写方括号，字段内不能包含英文逗号。空行会忽略，提交前会校验格式、长度及批次内重复用户名；有校验错误时不会创建任何账号。创建后显示逐行结果，成功的行会移出输入框，仅保留失败或未处理的行供修正后重试。

页面调用 `POST /api/v1/students/register`，携带管理员 Bearer Token，并提交 `username`、`password` 和 `display_name`；该接口不接受学生或未登录用户自行注册。

下方“学生账号列表”支持按姓名或用户名搜索和分页查看。点击对应账号的“删除”，在弹窗中确认后永久删除该学生账号、全部登录会话和学习进度；历史 Dify 调用日志与用量记录保留。删除后的账号无法再登录，此操作无法恢复。单个或批量创建成功后，列表会自动刷新。

管理员可在后台概览的个人账户卡片中点击“删除管理员账号”，输入当前管理员密码并确认后永久删除自己的账号。删除成功后自动清除管理员登录状态，返回管理员登录界面；其他管理员、课程、学生账号和历史调用记录保留。此操作无法恢复，需要新管理员账号时仍须使用管理员创建授权码。

同一账户卡片中的“修改密码”支持输入当前密码、新密码及确认新密码（8–128 个字符）。修改成功后当前管理员登录凭据立即失效，页面返回管理员登录界面，需使用新密码重新登录；其他账号不受影响。

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
| `POST /api/v1/students/register` | 管理员创建并分配学生账号（需要管理员登录） |
| `POST /api/v1/students/login`、`logout` | 学生登录和退出 |
| `GET /api/v1/students/me` | 当前学生 |
| `POST /api/v1/admins/register`、`login`、`logout` | 管理员创建、登录和退出 |
| `GET /api/v1/admins/me` | 验证当前管理员 |
| `DELETE /api/v1/admins/me` | 删除当前登录的管理员账号，请求体 `{"password":"当前管理员密码"}`；密码错误返回 403，成功返回 204 并使当前登录凭据失效 |
| `PUT /api/v1/admins/me/password` | 修改当前管理员密码，请求体包含 `current_password` 和 `new_password`；当前密码错误返回 403，成功返回 204 并使当前登录凭据失效 |
| `GET /api/v1/admin/students` | 管理员按姓名或用户名搜索学生账号；`q` 为关键词，`page` 默认 1，`page_size` 默认 20、最大 50 |
| `DELETE /api/v1/admin/students/{student_id}` | 管理员永久删除学生账号、登录会话及学习进度，保留历史调用日志；成功返回 204，不存在返回 404 |
| `GET /api/v1/admin/dify/call-logs` | 管理员组合筛选调用日志；支持 `credential_id`、`student`、`course`、`topic`、`student_type`、`business_type`、`status`、`started_from`、`started_before`；`page` 默认 1，`page_size` 默认 20、最大 50 |
| `GET /api/v1/admin/dify/call-logs/filter-options` | 管理员读取有调用记录的凭据选项及关联标签，不返回密钥或指纹 |
| `GET /api/v1/admin/dify/call-logs/{call_id}` | 管理员查看单次调用详情；`call_id` 为 UUID，记录不存在时返回 404 |
| `GET /api/v1/admin/dify/call-logs/overview` | 管理员用量概览，接受日志相同筛选条件，统计全部匹配调用，不接收分页参数 |
| `GET /api/v1/admin/dify/call-logs/trends` | 管理员每日趋势与分组对比，接受日志相同筛选条件；默认最近 30 天、最多 366 个日期；`group_by=credential/course`，`group_page` 默认 1，`group_page_size` 默认 10、最大 20 |
| `GET /api/v1/admin/dify/credentials` | 管理员查看每个凭据的累计用量与启停状态；`page` 默认 1，`page_size` 默认 20、最大 50 |
| `PATCH /api/v1/admin/dify/credentials/{credential_id}` | 管理员启停凭据，请求体 `{"enabled": false}` 或 `{"enabled": true}`；ID 为 UUID，不存在返回 404 |
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
