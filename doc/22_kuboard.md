# 22. Kuboard — Kubernetes 可视化管理平台

> **前置知识**：已完成 [19_Kubernetes.md](./19_Kubernetes.md)，理解 Pod / Deployment / Service / ConfigMap / Secret 等基本概念。  
> **目标**：理解 Kuboard 是什么、解决什么问题，并学会用 Kuboard 管理本项目的 K8s 部署。

---

## 目录

**第一部分：先搞懂概念**

1. [Kuboard 是什么 — 从 kubectl 说起](#1-kuboard-是什么--从-kubectl-说起)
2. [Kuboard 核心功能速览](#2-kuboard-核心功能速览)
3. [Kuboard 的架构：它怎么连接集群](#3-kuboard-的架构它怎么连接集群)
4. [Kuboard 与 kubectl 的关系](#4-kuboard-与-kubectl-的关系)
5. [多集群管理 — Kuboard 的核心优势](#5-多集群管理--kuboard-的核心优势)

**第二部分：实操 — 用 Kuboard 管理 nest-demo 项目**

6. [安装 Kuboard](#6-安装-kuboard)
7. [接入 K8s 集群](#7-接入-k8s-集群)
8. [认识 Kuboard 界面](#8-认识-kuboard-界面)
9. [进入集群 — 找到 nest-demo 命名空间](#9-进入集群--找到-nest-demo-命名空间)
10. [查看工作负载（Deployment / Pod）](#10-查看工作负载deployment--pod)
11. [查看日志](#11-查看日志)
12. [进入容器终端（exec）](#12-进入容器终端exec)
13. [更新镜像 / 重启服务](#13-更新镜像--重启服务)
14. [查看和编辑 ConfigMap / Secret](#14-查看和编辑-configmap--secret)
15. [查看 Service 和端口](#15-查看-service-和端口)
16. [常见操作对照表（kubectl vs Kuboard）](#16-常见操作对照表kubectl-vs-kuboard)
17. [常见问题排查](#17-常见问题排查)

---

# 第一部分：先搞懂概念

---

## 1. Kuboard 是什么 — 从 kubectl 说起

### kubectl 的局限

学 K8s 时，你用 `kubectl` 命令行操作：

```bash
kubectl get pods -n nest-demo
kubectl logs -l app=gateway -n nest-demo
kubectl rollout restart deployment/gateway -n nest-demo
```

命令行功能强大，但有几个不便：

```
问题 1：命令多、难记
  → 查看某个 Pod 的事件，要记住 kubectl describe pod <name> -n <ns>
  → 日志实时滚动，要加 -f 参数
  → 进入容器，要拼一长串命令

问题 2：多集群难管理
  → 公司有 dev / test / 生产 三套集群
  → 每次切换要 kubectl config use-context xxx
  → 容易操作错集群（高危！）

问题 3：没有全局视图
  → 看不到所有服务的资源用量、健康状态一览表
  → 出问题了，要一个一个 describe 查

问题 4：新人上手慢
  → 不熟悉命令行的同事难以参与运维工作
```

### Kuboard 解决什么

Kuboard 是一个 **K8s 可视化管理 Web 界面**，把所有 kubectl 操作变成点击：

```
kubectl get pods          → 点开命名空间，一目了然看所有 Pod 状态
kubectl logs gateway-xxx  → 点击 Pod 旁边的「日志」按钮
kubectl exec -it xxx -- sh → 点击「终端」按钮
kubectl rollout restart   → 点击「重启」按钮
多集群切换               → 左上角下拉框
```

> **类比前端**：`kubectl` 就像 MySQL 命令行，Kuboard 就像 Navicat / DataGrip — 功能一样，Kuboard 更直观。

---

## 2. Kuboard 核心功能速览

| 功能 | 说明 |
|------|------|
| **工作负载管理** | 查看 / 创建 / 编辑 / 删除 Deployment、StatefulSet、DaemonSet |
| **Pod 管理** | 查看 Pod 状态、实时日志、进入终端（exec）|
| **配置管理** | 可视化编辑 ConfigMap、Secret（不用手动 base64）|
| **存储管理** | 查看 PVC / PV 绑定状态、使用量 |
| **Service / Ingress** | 查看服务暴露端口，配置路由规则 |
| **多集群** | 一个 Kuboard 管理 dev / test / prod 多套集群 |
| **事件流** | 实时查看 K8s Events，快速定位启动失败原因 |
| **监控集成** | 可接入 Prometheus / Grafana 展示资源监控 |
| **RBAC 权限** | 多用户、按命名空间分配权限（适合团队协作）|

---

## 3. Kuboard 的架构：它怎么连接集群

```
┌────────────────────────────────────────────────────┐
│  你的浏览器                                         │
│  http://172.30.0.3:24002/kuboard                   │
└──────────────────┬─────────────────────────────────┘
                   │ HTTP
┌──────────────────▼─────────────────────────────────┐
│  Kuboard 服务（部署在某台机器上）                    │
│  - 提供 Web UI                                      │
│  - 保存集群连接信息（kubeconfig）                    │
│  - 转发 kubectl API 请求                            │
└──────────────────┬─────────────────────────────────┘
                   │ K8s API（HTTPS）
   ┌───────────────┼───────────────┐
   ▼               ▼               ▼
dev-k8s         test-k8s        yanshi-k8s
（集群1）        （集群2）        （集群3）
```

**关键点**：Kuboard 本身也是一个服务，它通过 `kubeconfig`（包含集群 API 地址和认证信息）连接到各个 K8s 集群，然后把操作结果渲染成 Web 页面给你。

你在图中看到的 `dev-k8s`、`test-k8s`、`yanshi-k8s` 就是三个已接入的集群。

---

## 4. Kuboard 与 kubectl 的关系

```
你                    Kuboard Web UI
 │                         │
 │ 点击「重启 gateway」     │
 │ ──────────────────────► │
 │                         │ 调用 K8s API：
 │                         │ PATCH /apis/apps/v1/namespaces/nest-demo/deployments/gateway
 │                         │ （等同于 kubectl rollout restart deployment/gateway -n nest-demo）
 │                         │
 │                    K8s API Server
 │                         │
 │ 看到 Pod 变成 Running    │
 │ ◄────────────────────── │
```

**Kuboard 不是独立的系统**，它只是 K8s API 的一个可视化客户端，底层调用的是完全相同的 K8s API。所有 Kuboard 能做的事，kubectl 也能做，反之亦然。

---

## 5. 多集群管理 — Kuboard 的核心优势

从图中看到，你们公司有三个集群：

| 集群名 | 用途 | 说明 |
|--------|------|------|
| `dev-k8s` | 开发环境 | 开发人员日常联调，可以随意重启、改配置 |
| `test-k8s` | 测试环境 | 测试同学验收功能，数据相对稳定 |
| `yanshi-k8s` | 演示/预发环境 | 给产品/客户演示用，配置接近生产 |

> 生产环境（prod）通常不放在 Kuboard 里，或者用只读权限，防止误操作。

多集群的好处：
```
传统方式（kubectl）:
  → 要操作 test 集群，先执行: kubectl config use-context test-k8s
  → 忘记切换 → 误操作了 dev 的数据库 → 悲剧

Kuboard 方式:
  → 左上角明显显示当前集群名（dev / test / yanshi）
  → 点击对应集群卡片才能进入
  → 视觉隔离，大幅降低误操作风险
```

---

# 第二部分：实操 — 用 Kuboard 管理 nest-demo 项目

---

## 6. 安装 Kuboard

Kuboard 本身是一个 Web 服务，有两种安装方式。

### 方式一：Docker 独立运行（推荐本地体验）

无需把 Kuboard 部署进 K8s 集群，直接在任意一台有 Docker 的机器上运行：
```bash
docker rm -f kuboard

docker run -d `
  --restart=unless-stopped `
  --name=kuboard `
  -p 24002:80/tcp `
  -p 10081:10081/tcp `
  -p 10081:10081/udp `
  -e KUBOARD_ENDPOINT="http://172.27.160.1:24002" `
  -e KUBOARD_AGENT_SERVER_UDP_PORT="10081" `
  -e KUBOARD_AGENT_SERVER_TCP_PORT="10081" `
  -v D:/kuboard-data:/data `
  eipwork/kuboard:v3
```

参数说明：

| 参数 | 说明 |
|------|------|
| `-p 24002:80` | 把容器 80 端口映射到宿主机 24002（可自定义）|
| `KUBOARD_ENDPOINT` | 填写本机的实际 IP，Kuboard Agent 用于回连 |
| `-v /root/kuboard-data:/data` | 持久化存储（集群连接配置不丢失）|
| `eipwork/kuboard:v3` | 使用 v3 版本（当前主流版本）|

启动后访问：`http://localhost:24002`  
默认用户名：`admin`，默认密码：`Kuboard123`

> Windows 本地体验可以把 `-v /root/kuboard-data:/data` 改为 `-v D:/kuboard-data:/data`

---
#### 删掉旧容器
如果之前安装过 Kuboard，先删除旧容器：

```bash
docker rm -f kuboard
```

### 方式二：部署到 K8s 集群内

适合生产环境，Kuboard 本身也跑在 K8s 里（高可用）：

```bash
# 下载安装 yaml
kubectl apply -f https://addons.kuboard.cn/kuboard/kuboard-v3.yaml
```

等待 Pod 就绪：

```bash
kubectl get pods -n kuboard -w
# 等到所有 Pod 变为 Running
```

查看访问端口：

```bash
kubectl get service -n kuboard
# kuboard-v3   NodePort   ...   24002:3xxxx/TCP
```

> **注意**：方式二是把 Kuboard 自己部署进 K8s，和后面「接入集群」是两件事。  

---

### 版本说明

```
Kuboard v3（推荐）
  - 支持多集群管理（一个 Kuboard 管多套集群）
  - 支持多用户 / RBAC 权限
  - 需要 K8s 1.13+

Kuboard v2（已停止维护）
  - 单集群，作为 DaemonSet 部署在集群内
  - 老文档/教程中常见，不再推荐
```

---

## 7. 接入 K8s 集群

安装好 Kuboard 后，它默认没有连接任何集群，需要手动接入。

### 步骤

**1. 打开 Kuboard 首页 → 点击「添加集群」**

**2. 选择接入方式**

Kuboard 提供三种方式：

| 方式 | 适用场景 | 说明 |
|------|---------|------|
| **agent 方式（推荐）** | 集群在内网/防火墙后 | 集群内安装 Agent，主动连接 Kuboard |
| kubeconfig 方式 | 能直接访问集群 API | 上传 `~/.kube/config` 文件 |
| Service Account 方式 | 权限受限场景 | 用 SA Token 接入 |

---

**3. Agent 方式详解（最常用）**

在 Kuboard 界面填写集群名称后，会生成一段安装命令，形如：

```bash
kubectl apply -f https://addons.kuboard.cn/kuboard/kuboard-agent.yaml \
  -e KUBOARD_ENDPOINT=http://172.30.0.3:24002 \
  -e KUBOARD_AGENT_KEY=xxxxxxxxxxxx
```

**在目标 K8s 集群上执行该命令**，即可将集群注册到 Kuboard。

Agent 工作原理：
```
K8s 集群（内网）
  └── kuboard-agent Pod
        └── 主动建立 WebSocket 长连接 → Kuboard 服务（172.30.0.3:24002）
              ← Kuboard UI 通过此连接转发所有 kubectl 操作
```

这样即使 Kuboard 在外网，也能管理内网集群（只需集群能出网）。

---

**4. 验证接入成功**

回到 Kuboard 首页，看到集群卡片变为「已就绪」状态，说明连接正常：

```
┌───────────┐
│ dev-k8s   │
│  已就绪   │  ← 绿色表示连接正常
│K8S-v1.19  │
└───────────┘
```

如果显示「连接失败」，检查：
- Kuboard `KUBOARD_ENDPOINT` 配置的 IP 是否可从集群内访问
- Agent Pod 是否正常运行：`kubectl get pods -n kuboard`
- 防火墙是否放行 10081 端口（UDP/TCP）

---

## 8. 认识 Kuboard 界面

安装并接入集群后，打开 Kuboard（如 `http://172.30.0.3:24002/kuboard`），首页是集群列表：

```
┌─────────────────────────────────────────────────────┐
│  Kuboard 首页                                        │
│                                                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐       │
│  │ dev-k8s   │  │ test-k8s  │  │yanshi-k8s │       │
│  │  已就绪   │  │  已就绪   │  │  已就绪   │       │
│  │K8S-v1.xx  │  │K8S-v1.xx  │  │K8S-v1.xx  │       │
│  └───────────┘  └───────────┘  └───────────┘       │
└─────────────────────────────────────────────────────┘
```

点击某个集群卡片，进入该集群的**概览页**，可以看到：
- 节点数量和状态
- 命名空间列表
- 集群资源用量（CPU / 内存）

---

## 9. 进入集群 — 找到 nest-demo 命名空间

进入集群后，左侧菜单选择 **「名称空间」**（即 Namespace）：

```
左侧菜单
├── 集群
│   ├── 节点
│   └── 持久化存储
└── 名称空间          ← 点这里
    ├── default
    ├── kube-system
    └── nest-demo     ← 选择我们的命名空间
```

进入 `nest-demo` 命名空间后，就能看到该命名空间下的所有资源。

> **等同于 kubectl**：`kubectl get all -n nest-demo`

---

## 10. 查看工作负载（Deployment / Pod）

在 `nest-demo` 命名空间内，点击左侧 **「工作负载」→「Deployments」**：

```
可以看到所有 Deployment 列表：

名称                  期望  就绪  镜像
─────────────────────────────────────────────
gateway               1     1     nest-demo-gateway:latest    ✅ Running
web                   1     1     nest-web:latest             ✅ Running
user-service          1     1     nest-demo-user-service:latest  ✅ Running
product-service       1     1     nest-demo-product-service:latest ✅ Running
export-worker         1     1     nest-demo-export-worker:latest   ✅ Running
mongodb               1     1     mongo:7                     ✅ Running
rabbitmq              1     1     rabbitmq:3.13-management-alpine  ✅ Running
redis                 1     1     redis:7-alpine              ✅ Running
```

点击某个 Deployment（如 `gateway`），进入详情页，可以看到：
- Pod 列表（如有多副本则显示多个）
- 每个 Pod 的 IP、节点、状态
- 环境变量（来自 ConfigMap / Secret）
- Volume 挂载信息

---

## 11. 查看日志

**方式一：从 Deployment 详情页进入**
1. 进入 `gateway` Deployment 详情
2. 找到对应的 Pod（如 `gateway-7d8f9b-xxxx`）
3. 点击 Pod 右侧的 **「日志」** 按钮

**方式二：从 Pod 列表直接查看**
1. 左侧菜单 → 「工作负载」→「Pods」
2. 找到 Pod，点击右侧操作列的日志图标

日志页面功能：
```
┌─────────────────────────────────────────┐
│  gateway-7d8f9b-xxxx 日志               │
│  [实时滚动] [搜索关键词] [下载]          │
│                                         │
│  [Nest] LOG [NestApplication] ...       │
│  [Nest] LOG Mapped {/health, GET} ...   │
│  [Nest] LOG NestApplication started ... │
└─────────────────────────────────────────┘
```

> **等同于 kubectl**：`kubectl logs gateway-7d8f9b-xxxx -n nest-demo -f`

---

## 12. 进入容器终端（exec）

1. 在 Pod 详情页，点击 **「终端」** 按钮
2. 选择容器（如果 Pod 里有多个容器）
3. 浏览器内打开一个 Shell 终端

```bash
# 在 gateway 容器内可以执行：
ls /app
env | grep MONGODB_URI    # 查看环境变量是否注入正确
wget -qO- http://localhost:3000/health  # 测试接口
```

> **等同于 kubectl**：`kubectl exec -it gateway-7d8f9b-xxxx -n nest-demo -- sh`

**排错典型场景**：
```
gateway 报 ECONNREFUSED 连不上 user-service？
→ 进入 gateway 容器终端
→ wget -qO- http://user-service-svc:3001  （测试 Service DNS 是否通）
→ 如果通，说明是应用层问题；如果不通，说明 Service / Pod 有问题
```

---

## 13. 更新镜像 / 重启服务

### 场景 1：只重启（代码没变，配置变了）

1. 进入 Deployment 详情（如 `gateway`）
2. 右上角点击 **「重启」** 按钮
3. K8s 滚动重启 Pod，期间服务不中断

> **等同于 kubectl**：`kubectl rollout restart deployment/gateway -n nest-demo`

### 场景 2：更新镜像版本

前提：已经在本地或 CI/CD 构建并推送了新镜像（如 `nest-demo-gateway:v2`）

1. 进入 Deployment 详情 → 点击 **「编辑」**
2. 找到 `containers[0].image` 字段
3. 修改镜像 tag（如 `latest` → `v2`）
4. 点击保存，K8s 自动滚动更新

> **等同于 kubectl**：`kubectl set image deployment/gateway gateway=nest-demo-gateway:v2 -n nest-demo`

### 场景 3：查看更新进度

在 Deployment 详情页，可以看到滚动更新状态：
```
更新策略：RollingUpdate
期望副本：1
就绪副本：1    ← 更新完成后变为 1
不可用：0
```

---

## 14. 查看和编辑 ConfigMap / Secret

### 查看 ConfigMap

1. 左侧菜单 → 「配置」→「ConfigMap」
2. 找到 `nest-config`，点击进入
3. 可以看到所有键值对：

```
REDIS_HOST:              redis-svc
USER_SERVICE_HOST:       user-service-svc
PRODUCT_SERVICE_HOST:    product-service-svc
TZ:                      Asia/Shanghai
...
```

4. 点击 **「编辑」** 可以直接修改（保存后需重启依赖该 ConfigMap 的 Pod）

### 查看 Secret

1. 左侧菜单 → 「配置」→「Secret」
2. 找到 `nest-secret`，点击进入
3. 密码字段默认显示 `***`，点击眼睛图标可以查看明文

> **注意**：直接在 Kuboard 上改 Secret，下次 `kubectl apply -f k8s/secret.yaml` 会覆盖回去。建议保持 yaml 文件是唯一修改入口，Kuboard 只做查看。

### ConfigMap 修改后生效流程

```
在 Kuboard 编辑 ConfigMap
    ↓
K8s 自动更新 ConfigMap 内容（约 1 分钟同步）
    ↓
但 Pod 内的环境变量不会自动更新（envFrom 是启动时注入的）
    ↓
需要重启 Pod：在 Kuboard 点「重启 Deployment」
    ↓
新 Pod 启动时读取最新 ConfigMap，生效
```

---

## 15. 查看 Service 和端口

1. 左侧菜单 → 「网络」→「Service」
2. 可以看到所有 Service 列表：

```
名称                类型        ClusterIP        端口
──────────────────────────────────────────────────────────
gateway-svc         NodePort    10.96.x.x        3000:30000
web-svc             NodePort    10.96.x.x        80:30080
rabbitmq-svc        NodePort    10.96.x.x        5672,15672:31672
user-service-svc    ClusterIP   10.96.x.x        3001
product-service-svc ClusterIP   10.96.x.x        3002
mongodb-svc         ClusterIP   10.96.x.x        27017
redis-svc           ClusterIP   10.96.x.x        6379
```

从这里可以直观看到：
- 哪些服务对外暴露了端口（NodePort）
- 哪些只在集群内部通信（ClusterIP）
- 端口映射关系（容器端口 → 宿主机端口）

---

## 16. 常见操作对照表（kubectl vs Kuboard）

| 操作 | kubectl 命令 | Kuboard 操作路径 |
|------|-------------|-----------------|
| 查看所有 Pod | `kubectl get pods -n nest-demo` | 命名空间 → 工作负载 → Pods |
| 查看 Pod 日志 | `kubectl logs <pod> -n nest-demo -f` | Pod 详情 → 日志按钮 |
| 进入容器 | `kubectl exec -it <pod> -n nest-demo -- sh` | Pod 详情 → 终端按钮 |
| 重启服务 | `kubectl rollout restart deployment/gateway -n nest-demo` | Deployment 详情 → 重启 |
| 查看启动失败原因 | `kubectl describe pod <pod> -n nest-demo` | Pod 详情 → Events 面板 |
| 修改副本数 | `kubectl scale deployment gateway --replicas=3 -n nest-demo` | Deployment 详情 → 编辑 → replicas |
| 查看 ConfigMap | `kubectl get configmap nest-config -n nest-demo -o yaml` | 配置 → ConfigMap → nest-config |
| 查看 Secret | `kubectl get secret nest-secret -n nest-demo -o yaml` | 配置 → Secret → nest-secret |
| 查看 Service | `kubectl get services -n nest-demo` | 网络 → Service |
| 查看所有事件 | `kubectl get events -n nest-demo` | 命名空间概览 → 事件 |
| 删除 Pod（触发重建） | `kubectl delete pod <pod> -n nest-demo` | Pod 详情 → 删除（Deployment 会自动重建）|

---

> 💡 **使用建议**：
> - **日常排查**用 Kuboard（看日志、看事件、进终端）—— 更直观
> - **批量部署**用 kubectl（`kubectl apply -f k8s/`）—— 脚本化、可重复
> - **配置文件**以 yaml 为唯一来源（git 管理），Kuboard 上的修改是临时的
> - **多人协作**在 Kuboard 里开账号、按命名空间分配权限，防止误操作生产环境

---

## 17. 常见问题排查

### 问题 1：进入 Kuboard 后左侧菜单全部灰色，无法点击

**现象**：登录成功，看到集群信息，但左侧所有菜单项都是灰色不可点击状态。

**原因**：此时处于"集群导入配置页"，还没有真正进入集群管理界面。

**解决**：
1. 点击顶部面包屑中的集群名称（如 `nset`），或回到首页点击集群卡片的「进入集群」
2. 进入集群后，点击左侧「名称空间 - 选择」，选择目标命名空间（如 `nest-demo`）
3. 左侧菜单即全部激活可用

---

### 问题 2：切换命名空间时报错 `User "admin" cannot get resource "namespaces"`

**现象**：切换命名空间弹窗出现红色报错：
```
namespaces "nest-demo" is forbidden: User "admin" cannot get resource "namespaces" in API group "" in the namespace "nest-demo"
```

**原因**：Kuboard 的「使用 ServiceAccount kuboard-admin 扮演 admin」功能依赖 K8s 的 Impersonation 机制，需要提前在 K8s 中为 admin 用户绑定 ClusterRole。本地 Docker Desktop K8s 默认没有这个绑定，导致权限被拒绝。

**解决**：在「切换集群/名称空间」弹窗中，将身份选项改为第一项：

**「使用 ServiceAccount kuboard-admin」**（不要选"扮演 admin"那一项）

`kuboard-admin` 这个 ServiceAccount 在安装 Kuboard Agent 时已被赋予 `cluster-admin` 权限，可以完整访问集群，无需额外配置。

```
弹窗中三个选项：
  ○ 使用 ServiceAccount kuboard-admin       ← 选这个 ✅
  ○ 使用 ServiceAccount kuboard-viewer
  ● 使用 ServiceAccount kuboard-admin 扮演 admin  ← 本地环境会报权限错误 ❌
```
