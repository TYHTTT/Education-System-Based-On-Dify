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

## 检查和构建

```powershell
# 前端检查和生产构建
cd frontend
npm run typecheck
npm run lint
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
```

## 当前 API

| 接口 | 用途 |
| --- | --- |
| `GET /health` | 服务状态 |
| `POST /api/v1/chat` | 自由问答与知识点对话 |
| `POST /api/v1/students/register` | 管理员创建并分配学生账号（需要管理员登录） |
| `POST /api/v1/students/login`、`logout` | 学生登录和退出 |
| `GET /api/v1/students/me` | 当前学生 |
| `PATCH /api/v1/students/me` | 学生修改自己的 `username`、`display_name`，用户名冲突返回 409；管理员预览不可调用 |
| `PUT /api/v1/students/me/password` | 学生提交 `current_password`、`new_password` 修改密码，成功后撤销该学生全部登录会话；当前密码错误返回 403 |
| `POST /api/v1/admins/register`、`login`、`logout` | 管理员创建、登录和退出 |
| `GET /api/v1/admins/me` | 验证当前管理员 |
| `PATCH /api/v1/admins/me` | 管理员修改自己的 `username`、`display_name`，用户名冲突返回 409 |
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
