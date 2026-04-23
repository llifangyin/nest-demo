# 18. Docker Compose 部署 — 一条命令启动整个微服务集群

> **前置知识**：你已经完成 [16_microservice.md](./16_microservice.md)，4 个服务可以在本地分别启动。
> **目标**：用 Docker Compose 把所有服务（网关 + 用户服务 + 商品服务 + 导出 Worker + MongoDB + RabbitMQ）打包成容器，一条命令部署，既能本地联调，也能上服务器。

---

## 目录

**第一部分：先搞懂概念**

1. [Docker 是什么 — 前端视角](#1-docker-是什么--前端视角)
2. [容器 vs 虚拟机 — 为什么用容器](#2-容器-vs-虚拟机--为什么用容器)
3. [Dockerfile — 打包食谱](#3-dockerfile--打包食谱)
4. [Docker Compose — 指挥多个容器](#4-docker-compose--指挥多个容器)
5. [本项目容器架构图](#5-本项目容器架构图)
6. [关键配置项速查](#6-关键配置项速查)

**第二部分：动手配置（按步骤来）**

7. [第一步：安装 Docker Desktop](#7-第一步安装-docker-desktop)
8. [第二步：写 Dockerfile（4 个服务共用一个）](#8-第二步写-dockerfile4-个服务共用一个)
9. [第三步：写 docker-compose.yml](#9-第三步写-docker-composeyml)
10. [第四步：准备环境变量文件](#10-第四步准备环境变量文件)
11. [第五步：添加 .dockerignore](#11-第五步添加-dockerignore)
12. [第六步：修改服务代码中的硬编码地址](#12-第六步修改服务代码中的硬编码地址)
13. [第七步：启动与验证](#13-第七步启动与验证)
14. [常用命令速查](#14-常用命令速查)
15. [常见问题](#15-常见问题)

---

# 第一部分：先搞懂概念

---

## 1. Docker 是什么 — 前端视角

### 类比

```
本地开发 = 你在自己电脑上装了 Node 18、npm、MongoDB...
           每个人电脑环境不一样，"我这里能跑"别人那里不一定能跑

Docker   = 把你的应用 + 运行环境打包进一个"集装箱"（容器）
           集装箱在哪里运行，里面的东西都一样
           就像 npm install 后 node_modules 一样，所有人跑出来的结果一致
```

更直观的类比：

| 现实世界 | Docker 世界 |
|---------|------------|
| 集装箱 | 容器（Container）|
| 集装箱的设计图 | 镜像（Image）|
| 造集装箱的说明书 | Dockerfile |
| 港口（管理很多集装箱）| Docker Compose |
| Docker Hub | npm 仓库（存公共镜像）|

### 前端为什么要学 Docker

- 你写的前端项目需要部署到服务器 → 需要 Docker 打包
- 后端同学说"给你个 docker-compose.yml"，你需要能看懂、能改
- CI/CD 流水线（GitHub Actions / Jenkins）几乎全用 Docker

---

## 2. 容器 vs 虚拟机 — 为什么用容器

```
虚拟机（VM）                    容器（Container）
┌─────────────────┐            ┌─────────────────┐
│  App A          │            │  App A          │
├─────────────────┤            ├─────────────────┤
│  完整 OS（几 GB）│            │  只有必要的库    │
├─────────────────┤            │ （几十 MB）      │
│  Hypervisor     │            ├─────────────────┤
│  宿主机 OS      │            │  Docker 引擎    │
└─────────────────┘            │  宿主机 OS      │
                               └─────────────────┘
```

| | 虚拟机 | 容器 |
|--|--|--|
| 启动时间 | 分钟级 | 秒级 |
| 体积 | GB | MB |
| 性能 | 有损耗 | 接近原生 |
| 隔离性 | 完全隔离 | 进程级隔离 |
| 适用场景 | 完全不同的 OS | 应用部署、微服务 |

---

## 3. Dockerfile — 打包食谱

Dockerfile 就是一份"如何制作这个容器"的食谱，每一行是一个步骤：

```dockerfile
# 基础镜像（就像说"我要用 Node 18 环境"）
# alpines 是一个轻量级 Linux 发行版，镜像更小，构建更快
FROM node:18-alpine

# 设置工作目录（就像 cd /app）
WORKDIR /app

# 复制 package.json（先复制这个，利用缓存加速构建）
COPY package*.json ./

# 安装依赖（就像 npm install）
RUN npm install

# 复制源码
COPY . .

# 构建（就像 npm run build）
RUN npm run build

# 启动命令（就像 node dist/main.js）
CMD ["node", "dist/apps/gateway/main.js"]
```

### Dockerfile 指令速查

| 指令 | 作用 | 类比 |
|------|------|------|
| `FROM` | 基础镜像 | `extends` 继承 |
| `WORKDIR` | 设置工作目录 | `cd` |
| `COPY` | 复制文件 | 复制粘贴 |
| `RUN` | 构建时执行命令 | 安装依赖/编译 |
| `CMD` | 容器启动命令 | `npm start` |
| `EXPOSE` | 声明端口（仅文档作用）| 注释说明 |
| `ENV` | 设置环境变量 | `.env` 文件 |
| `ARG` | 构建时参数 | 配置项 |

---

## 4. Docker Compose — 指挥多个容器

单个 Dockerfile 只能管一个服务。本项目有：
- gateway（网关）
- user-service（用户服务）
- product-service（商品服务）
- export-worker（导出 Worker）
- MongoDB（数据库）
- RabbitMQ（消息队列）

**6 个服务** 要同时启动、互联互通，用 `docker-compose.yml` 统一管理：

```yaml
services:          # 定义所有服务
  gateway:         # 服务名
    build: .       # 用当前目录的 Dockerfile 构建
    ports:
      - "3000:3000" # 宿主机端口:容器内端口
    depends_on:    # 依赖，控制启动顺序
      - mongodb
    environment:   # 环境变量
      - MONGODB_URI=mongodb://...
```

### Docker Compose vs 手动启动

| 手动启动（现在）| Docker Compose |
|---|---|
| 4 个终端分别 `npm run start:xxx` | `docker compose up` 一条命令 |
| 本地装了 Node / MongoDB / RabbitMQ | 所有依赖都在容器里，本地零安装 |
| "我这里能跑"| 任何有 Docker 的机器都能跑 |
| 重启后需要重新启动 | `docker compose up -d` 后台运行，重启机器自动恢复 |

---

## 5. 本项目容器架构图

```
┌─────────────────────────────────────────────────────────────┐
│  Docker Network: nest-network                               │
│                                                             │
│  ┌──────────────┐   TCP    ┌──────────────────┐            │
│  │  gateway     │◄────────►│  user-service    │            │
│  │  port: 3000  │          │  port: 3001      │            │
│  │  (HTTP 对外) │   TCP    ├──────────────────┤            │
│  │              │◄────────►│  product-service │            │
│  │              │          │  port: 3002      │            │
│  │              │  RabbitMQ├──────────────────┤            │
│  │              │─────────►│  export-worker   │            │
│  └──────┬───────┘          └────────┬─────────┘            │
│         │                           │                       │
│         │         ┌─────────────────┤                       │
│         │         ▼                 ▼                       │
│  ┌──────▼──────────────────────────────────────┐           │
│  │  mongodb       │     rabbitmq                │           │
│  │  port: 27017   │     port: 5672/15672        │           │
│  └────────────────┴─────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
         ▲
    宿主机访问 localhost:3000
```

**重点**：容器之间通过**服务名**互相访问，而不是 `localhost`。

```
本地开发：MONGODB_URI=mongodb://localhost:27017/...
Docker：  MONGODB_URI=mongodb://mongodb:27017/...
                                ^^^^^^^ 这里是容器服务名
```

---

## 6. 关键配置项速查

### 端口映射 `ports`

```yaml
ports:
  - "3000:3000"   # 宿主机端口:容器内端口
  - "8080:3000"   # 外部用 8080 访问，容器内是 3000
```

### 依赖关系 `depends_on`

```yaml
depends_on:
  mongodb:
    condition: service_healthy  # 等 MongoDB 健康检查通过才启动
  rabbitmq:
    condition: service_healthy
```

### 健康检查 `healthcheck`

```yaml
healthcheck:
  test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
  interval: 10s   # 每 10 秒检查一次
  timeout: 5s     # 超时时间
  retries: 5      # 失败 5 次才标记为 unhealthy
```

### 数据持久化 `volumes`

```yaml
volumes:
  - mongo-data:/data/db   # 命名卷，容器删了数据还在
  - ./logs:/app/logs      # 绑定挂载，直接映射到宿主机目录
```

### 网络 `networks`

```yaml
networks:
  nest-network:
    driver: bridge   # 默认桥接网络，同一网络内服务名互通
```

---

# 第二部分：动手配置

---

## 7. 第一步：安装 Docker Desktop

1. 访问 [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)
2. 下载 Windows 版，安装（需要开启 WSL2 或 Hyper-V）
3. 安装完成后验证：

```bash
docker --version
docker compose version
```

输出类似：
```
Docker version 26.x.x
Docker Compose version v2.x.x
```

> **提示**：在 Windows 上，Docker Desktop 需要开启 WSL2（Windows Subsystem for Linux 2），安装程序会引导你完成。如果提示"需要更新 WSL 内核"，按提示操作即可。

---

## 8. 第二步：写 Dockerfile（4 个服务共用一个）

本项目是 Monorepo，4 个服务（gateway / user-service / product-service / export-worker）在同一个代码仓库里，**共用同一个 Dockerfile**，通过构建参数 `APP_NAME` 区分。

### 多阶段构建（Multi-stage Build）

Dockerfile 用了**多阶段构建**技巧，最终镜像只包含运行时需要的东西，不包含源码和开发工具：

```
阶段 1 (builder)：安装所有依赖 + 编译 TypeScript → 生成 dist/
阶段 2 (runner)：只复制 dist/ + node_modules 中的生产依赖 → 最小镜像
```

### 文件位置：`nest-demo/Dockerfile`

```dockerfile
# ============================================================
# 多阶段构建 — 所有 NestJS 服务共用此 Dockerfile
# 通过 build arg APP_NAME 区分要构建哪个服务
# ============================================================

# -------- 阶段 1：构建（builder）--------
FROM node:18-alpine AS builder

# 安装构建工具（某些 npm 包的 native 依赖需要）
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 先复制 package.json（利用 Docker 层缓存）
COPY package*.json ./
COPY nest-cli.json tsconfig*.json ./

# 安装所有依赖（含 devDependencies，需要 TypeScript 编译）
RUN npm ci

# 复制全部源码
COPY apps/ apps/
COPY libs/ libs/

# 构建参数：指定要构建哪个应用
ARG APP_NAME=gateway

# 编译 TypeScript
RUN npx nest build ${APP_NAME}

# -------- 阶段 2：运行（runner）--------
FROM node:18-alpine AS runner

# 创建非 root 用户，提升安全性
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# 只复制生产依赖
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 从 builder 阶段复制编译产物
COPY --from=builder /app/dist ./dist

USER appuser

ARG APP_NAME=gateway
ENV APP_NAME=${APP_NAME}

CMD node dist/apps/${APP_NAME}/main.js
```

> ✅ 此文件已创建：`nest-demo/Dockerfile`

---

## 9. 第三步：写 docker-compose.yml

`docker-compose.yml` 放在 `nest-demo/` 根目录。

### 关键点说明

| 配置 | 说明 |
|------|------|
| `build.args.APP_NAME` | 告诉 Dockerfile 要构建哪个服务（gateway/user-service/...）|
| `depends_on.condition: service_healthy` | 等依赖服务健康检查通过才启动，避免"数据库还没好，服务就崩了" |
| `networks: nest-network` | 所有服务在同一个虚拟网络里，可以用服务名互访 |
| `volumes: mongo-data` | MongoDB 数据持久化，容器删掉数据也不丢 |
| `restart: unless-stopped` | 容器崩了自动重启，除非手动停止 |

### 文件位置：`nest-demo/docker-compose.yml`

```yaml
services:

  # ================================================================
  # 基础设施层
  # ================================================================

  mongodb:
    image: mongo:7
    container_name: nest-mongo
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASS}
      MONGO_INITDB_DATABASE: ${MONGO_DB_NAME}
    volumes:
      - mongo-data:/data/db
    networks:
      - nest-network
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: nest-rabbitmq
    restart: unless-stopped
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASS}
    ports:
      - "15672:15672"    # 管理界面
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    networks:
      - nest-network
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  redis:
    image: redis:7-alpine
    container_name: nest-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASS}
    volumes:
      - redis-data:/data
    networks:
      - nest-network

  # ================================================================
  # 业务服务层
  # ================================================================

  user-service:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        APP_NAME: user-service
    restart: unless-stopped
    env_file:
      - .env.docker
    networks:
      - nest-network
    depends_on:
      mongodb:
        condition: service_healthy

  product-service:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        APP_NAME: product-service
    restart: unless-stopped
    env_file:
      - .env.docker
    networks:
      - nest-network
    depends_on:
      mongodb:
        condition: service_healthy

  export-worker:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        APP_NAME: export-worker
    restart: unless-stopped
    env_file:
      - .env.docker
    networks:
      - nest-network
    depends_on:
      mongodb:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy

  gateway:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        APP_NAME: gateway
    restart: unless-stopped
    env_file:
      - .env.docker
    ports:
      - "3000:3000"
    volumes:
      - gateway-logs:/app/logs
    networks:
      - nest-network
    depends_on:
      mongodb:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
      user-service:
        condition: service_healthy
      product-service:
        condition: service_healthy

networks:
  nest-network:
    driver: bridge

volumes:
  mongo-data:
  rabbitmq-data:
  redis-data:
  export-files:
  gateway-logs:
```

> ✅ 此文件已创建：`nest-demo/docker-compose.yml`

---

## 10. 第四步：准备环境变量文件

Docker Compose 里不写密码，密码放在 `.env.docker` 文件里，通过 `env_file` 注入。

> ⚠️ `.env.docker` 和 `.env` 的区别：
> - `.env`：本地开发，地址用 `localhost`
> - `.env.docker`：容器环境，地址用**服务名**（如 `mongodb`、`rabbitmq`）

### 文件位置：`nest-demo/.env.docker`

```bash
# ---- HTTP 端口 ----
PORT=3000

# ---- MongoDB（服务名 mongodb，不是 localhost！）----
MONGODB_URI=mongodb://zanyu:Password01!@mongodb:27017/nest-demo?authSource=admin
MONGO_ROOT_USER=root
MONGO_ROOT_PASS=RootPassword01!
MONGO_DB_NAME=nest-demo

# ---- Redis（服务名 redis）----
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASS=RedisPassword01!

# ---- RabbitMQ（服务名 rabbitmq）----
RABBITMQ_URL=amqp://admin:Password01!@rabbitmq:5672
RABBITMQ_USER=admin
RABBITMQ_PASS=Password01!

# ---- TCP 微服务地址（Docker 容器服务名）----
USER_SERVICE_HOST=user-service
PRODUCT_SERVICE_HOST=product-service

# ---- JWT ----
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRES_IN=1d
```

> ✅ 此文件已创建：`nest-demo/.env.docker`
> 
> ⚠️ 请确保 `.env.docker` 在 `.gitignore` 中已被忽略（含密码，不能提交到 Git）

---

## 11. 第五步：添加 .dockerignore

`.dockerignore` 告诉 Docker 哪些文件不需要复制进镜像（类似 `.gitignore`）。

### 文件位置：`nest-demo/.dockerignore`

```
node_modules/
dist/
logs/
*.log
.env
.env.*
!.env.example
.git/
.gitignore
.vscode/
**/*.spec.ts
**/*.e2e-spec.ts
test/
doc/
README.md
.DS_Store
```

> ✅ 此文件已创建：`nest-demo/.dockerignore`

---

## 12. 第六步：修改服务代码中的硬编码地址

当前代码里有几处硬编码的 `127.0.0.1`，在 Docker 里服务之间不能用 `127.0.0.1`，要改成 `0.0.0.0`（监听所有网卡）或从环境变量读取。

### 12.1 user-service / product-service — TCP 监听地址

**`apps/user-service/src/main.ts`** 和 **`apps/product-service/src/main.ts`**：

```typescript
// ❌ 改前：容器里 127.0.0.1 只代表容器自己，网关连不上
options: {
  host: '127.0.0.1',
  port: USER_SERVICE_PORT,
}

// ✅ 改后：0.0.0.0 表示监听所有网卡，容器间可以连接
options: {
  host: '0.0.0.0',
  port: USER_SERVICE_PORT,
}
```

> ✅ 已修改：`apps/user-service/src/main.ts` 和 `apps/product-service/src/main.ts`

### 12.2 gateway — TCP 客户端连接地址（用环境变量）

**`apps/gateway/src/gateway.module.ts`** 中的 `ClientsModule`：

```typescript
// ❌ 改前：硬编码 localhost，Docker 里连不到 user-service
ClientsModule.register([
  {
    name: USER_SERVICE,
    transport: Transport.TCP,
    options: { host: 'localhost', port: USER_SERVICE_PORT },
  },
])

// ✅ 改后：从环境变量读取 host（本地默认 localhost，Docker 里注入服务名）
ClientsModule.registerAsync([
  {
    name: USER_SERVICE,
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      transport: Transport.TCP,
      options: {
        host: config.get<string>('USER_SERVICE_HOST', 'localhost'),
        port: USER_SERVICE_PORT,
      },
    }),
  },
  {
    name: PRODUCT_SERVICE,
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      transport: Transport.TCP,
      options: {
        host: config.get<string>('PRODUCT_SERVICE_HOST', 'localhost'),
        port: PRODUCT_SERVICE_PORT,
      },
    }),
  },
])
```

> ✅ 已修改：`apps/gateway/src/gateway.module.ts`
> 
> 本地开发时不需要设置 `USER_SERVICE_HOST`，默认值 `localhost` 就能用。
> Docker 里通过 `.env.docker` 注入 `USER_SERVICE_HOST=user-service`。

---

## 13. 第七步：启动与验证

所有文件准备好之后，在 `nest-demo/` 目录下执行：

```bash
# 第一次启动（构建镜像 + 启动容器，较慢）
docker compose --env-file .env.docker up --build

# 后台运行（不占终端）
docker compose --env-file .env.docker up --build -d

# 查看所有容器状态
docker compose ps

# 查看某个服务的日志
docker compose logs gateway
docker compose logs gateway -f  # 实时跟踪

# 停止所有容器
docker compose down

# 停止并删除数据卷（危险：会清空 MongoDB 数据！）
docker compose down -v
```

### 验证步骤

```bash
# 1. 检查所有容器是否在运行
docker compose ps
# 期望：6 个服务全部 Up/Running

# 2. 健康检查端点
curl http://localhost:3000/health
# 期望：{ "status": "ok", "info": { "mongodb": { "status": "up" }, ... } }

# 3. 测试登录
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"name":"admin","password":"xxx"}'
```

---

## 14. 常用命令速查

```bash
# ===== 镜像操作 =====
docker images                      # 查看所有本地镜像
docker rmi <image_id>              # 删除镜像
docker image prune                 # 清理无用镜像

# ===== 容器操作 =====
docker ps                          # 查看运行中的容器
docker ps -a                       # 查看所有容器（含停止的）
docker stop <container_id>         # 停止容器
docker rm <container_id>           # 删除容器
docker exec -it <name> sh          # 进入容器内部 Shell

# ===== Compose 操作 =====
docker compose up                  # 前台启动
docker compose up -d               # 后台启动
docker compose up --build          # 强制重新构建镜像
docker compose down                # 停止并删除容器
docker compose restart gateway     # 重启单个服务
docker compose logs -f             # 实时查看所有日志
docker compose logs gateway -f     # 实时查看网关日志
docker compose exec gateway sh     # 进入网关容器 Shell

# ===== 清理 =====
docker system prune                # 清理所有无用资源（镜像/容器/网络）
docker system prune -a             # 连带清理未使用的镜像（节省磁盘）
```

---

## 15. 常见问题

### Q1：容器启动了但服务连接失败？

最常见的原因是**地址还在用 localhost**。容器里的 `localhost` 只代表**当前容器自己**，不是宿主机，也不是其他容器。

```
✅ 容器间通信：用 Docker Compose 里的服务名
   MONGODB_URI=mongodb://mongodb:27017/...
                         ^^^^^^^ 这是 compose 里的 service 名

✅ 宿主机访问容器：localhost:3000（因为做了端口映射 -p 3000:3000）
```

### Q2：镜像体积太大怎么办？

确保使用了多阶段构建，并且最终阶段只复制 `dist/` 和 `node_modules`（生产依赖），不复制 `src/`、`.ts` 源码文件。

可以用 `alpine` 版本的 Node 镜像（`node:18-alpine`），比 `node:18` 小很多（50MB vs 300MB）。

### Q3：代码改了怎么让 Docker 更新？

```bash
# 重新构建并重启
docker compose up --build -d

# 只重建某一个服务
docker compose up --build gateway -d
```

### Q4：MongoDB 数据在哪里？

数据存在 Docker Volume（命名卷）里：

```bash
docker volume ls                        # 查看所有卷
docker volume inspect nest-demo_mongo-data  # 查看卷详情
```

只要不执行 `docker compose down -v`，数据就不会丢失。

### Q5：RabbitMQ 管理界面怎么访问？

`docker-compose.yml` 里 RabbitMQ 映射了 15672 端口（管理界面）：

```
http://localhost:15672
用户名: admin
密码: 和 .env.docker 里 RABBITMQ_DEFAULT_PASS 一致
```

### Q6：Windows 上 Docker 很慢怎么办？

把代码放在 WSL2 文件系统里（`\\wsl$\Ubuntu\home\...`）而不是 Windows 文件系统（`C:\...`），文件 I/O 性能会提升很多倍。

### Q7：生产环境和开发环境怎么区分？

可以有两个 compose 文件：
- `docker-compose.yml`：基础配置
- `docker-compose.dev.yml`：开发环境覆盖（比如挂载源码热重载）
- `docker-compose.prod.yml`：生产环境覆盖（比如加资源限制）

```bash
# 开发
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# 生产
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

> 💡 **下一步**：掌握 Docker Compose 本地部署后，可以进一步学习 CI/CD（持续集成/持续部署），用 GitHub Actions 在代码推送时自动构建镜像、部署到服务器。
