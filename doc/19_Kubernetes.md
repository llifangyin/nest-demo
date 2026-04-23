# 19. Kubernetes — 容器编排进阶

> **前置知识**：已完成 [18_dockerCompose.md](./18_dockerCompose.md)，理解容器、镜像、Docker Compose 的基本概念。
> **目标**：理解 Kubernetes 是什么、解决什么问题，并把本项目部署到本地 Kubernetes 集群（Docker Desktop 内置）。

---

## 目录

**第一部分：先搞懂概念**

1. [Kubernetes 是什么 — 从 Docker Compose 说起](#1-kubernetes-是什么--从-docker-compose-说起)
2. [核心概念速览](#2-核心概念速览)
3. [Pod — 最小部署单元](#3-pod--最小部署单元)
4. [Deployment — 管理 Pod 的控制器](#4-deployment--管理-pod-的控制器)
5. [Service — 容器间通信 + 对外暴露](#5-service--容器间通信--对外暴露)
6. [ConfigMap & Secret — 配置管理](#6-configmap--secret--配置管理)
7. [整体架构图](#7-整体架构图)

**第二部分：部署命令 + 验证方式 + 常见问题**

8. [部署命令完整执行顺序](#8-部署命令完整执行顺序)
9. [kubectl 常用命令速查](#9-kubectl-常用命令速查)
10. [验证部署是否成功](#10-验证部署是否成功)
11. [K8s 与 Docker Compose 部署的区别](#11-k8s-与-docker-compose-部署的区别)
12. [能访问页面吗](#12-能访问页面吗)

**第三部分：实操 — yaml 文件配置**

13. [启用 Docker Desktop 内置 Kubernetes](#13-启用-docker-desktop-内置-kubernetes)
14. [目录结构](#14-目录结构)
15. [基础配置文件（namespace / secret / configmap）](#15-基础配置文件namespace--secret--configmap)
16. [基础设施（MongoDB / RabbitMQ / Redis）](#16-基础设施mongodb--rabbitmq--redis)
17. [业务服务（user-service / product-service / export-worker / gateway）](#17-业务服务user-service--product-service--export-worker--gateway)
18. [前端服务（web — nginx + React SPA）](#18-前端服务web--nginx--react-spa)

---

# 第一部分：先搞懂概念

---

## 1. Kubernetes 是什么 — 从 Docker Compose 说起

### Docker Compose 的局限

你已经用 Docker Compose 把所有服务跑起来了，很好用。但它有一个核心局限：

```
Docker Compose 是单机工具
  → 只能在一台机器上运行
  → 某个容器崩了，不会自动重启（restart 策略只是尝试）
  → 流量多了，无法自动扩容（一个服务只有一个容器）
  → 部署新版本时会有短暂停机
```

### Kubernetes（K8s）解决什么

```
Kubernetes 是集群管理工具
  → 可以管理几十台、几百台服务器上的容器
  → 容器崩了自动重启，节点挂了自动迁移
  → 一键扩容：gateway 从 1 个实例变 10 个实例
  → 滚动更新：不停机发布新版本
  → 自动负载均衡
```

### 前端类比

```
Docker Compose  ≈  本地 webpack dev server（单机、开发用）
Kubernetes      ≈  CDN + 负载均衡 + 自动伸缩（生产级）

就像你用 npm run dev 和用 Vercel/AWS 部署的区别
```

---

## 2. 核心概念速览

| 概念 | 类比 | 一句话说明 |
|------|------|-----------|
| **Cluster（集群）**| 整个机房 | 一组服务器，由 K8s 统一管理 |
| **Node（节点）** | 一台服务器 | 集群中的一台机器，运行容器 |
| **Pod** | 一个进程组 | K8s 最小部署单元，包含一个或多个容器 |
| **Deployment** | PM2 进程管理 | 管理 Pod 的副本数量、更新策略 |
| **Service** | nginx upstream | 给 Pod 提供稳定的访问地址（内部 DNS + 负载均衡）|
| **ConfigMap** | `.env` 文件 | 非敏感配置（地址、端口）|
| **Secret** | `.env` 中的密码 | 敏感配置（密码、token），base64 加密存储 |
| **Namespace** | 文件夹 | 隔离不同环境（dev/staging/prod）|
| **Ingress** | nginx 反向代理 | 管理外部 HTTP 流量路由 |
| **PersistentVolume** | Docker Volume | 持久化存储，容器删了数据还在 |

---

## 3. Pod — 最小部署单元

Pod 是 K8s 里最小的调度单位，类比 Docker 里的容器（但更准确说是"一组紧密关联的容器"）。
pod 全称是 "Pod of Containers"，它可以包含一个或多个容器，这些容器共享网络和存储。
```yaml
# 一个简单的 Pod 定义
apiVersion: v1
kind: Pod
metadata:
  name: gateway-pod
#spec 全称是 specification，定义 Pod 的具体内容
spec:
  containers:
    - name: gateway         # 容器名
      image: nest-gateway   # 镜像名
      ports:
        - containerPort: 3000
```

**重要**：一般不直接创建 Pod，而是通过 Deployment 管理，原因：
- Pod 崩了不会自动重建（Deployment 会）
- Deployment 可以管理多个 Pod 副本

---

## 4. Deployment — 管理 Pod 的控制器

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gateway
spec:
  replicas: 2          # 运行 2 个 Pod 副本（高可用） replicas 是复数形式，表示副本数量
  selector:
    matchLabels:
      app: gateway
  template:            # Pod 模板
    metadata:
      labels:
        app: gateway   # 标签，Service 通过这个找到对应的 Pod
    spec:
      containers:
        - name: gateway
          image: nest-gateway:latest
          ports:
            - containerPort: 3000
```

**Deployment 自动保证**：
- 始终有 `replicas` 个 Pod 在运行
- 某个 Pod 崩了，自动重建一个新的
- 更新镜像时，滚动替换（先启新的，再停旧的）

---

## 5. Service — 容器间通信 + 对外暴露

Pod 的 IP 每次重建都会变化，不能直接访问。Service 提供**稳定的访问入口**。

```yaml
apiVersion: v1
kind: Service
metadata:
  name: gateway-svc      # 其他服务通过这个名字访问
spec:
  selector:
    app: gateway         # 找到所有 label=gateway 的 Pod
  ports:
    - port: 3000         # Service 端口
      targetPort: 3000   # Pod 里容器的端口
  type: ClusterIP        # 只在集群内部可访问（默认）
```

### Service 三种类型

| 类型 | 用途 |
|------|------|
| `ClusterIP` | 集群内部访问（微服务互通）|
| `NodePort` | 暴露到宿主机端口（开发调试用）|
| `LoadBalancer` | 云服务商提供公网 IP（生产用）|

---

## 6. ConfigMap & Secret — 配置管理

### ConfigMap（非敏感配置）

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nest-config
data:
  MONGODB_URI: "mongodb://root:xxx@mongodb-svc:27017/nest-demo?authSource=admin"
  RABBITMQ_URL: "amqp://admin:xxx@rabbitmq-svc:5672"
  USER_SERVICE_HOST: "user-service-svc"
  PRODUCT_SERVICE_HOST: "product-service-svc"
```

### Secret（敏感配置 — 密码）

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: nest-secret
type: Opaque
data:
  # 值需要 base64 编码：echo -n "Password01!" | base64
  MONGO_ROOT_PASS: UGFzc3dvcmQwMSE=
  JWT_SECRET: xxxxx
```

在 Deployment 里引用：

```yaml
env:
  - name: MONGODB_URI
    valueFrom:
      configMapKeyRef:
        name: nest-config
        key: MONGODB_URI
  - name: MONGO_ROOT_PASS
    valueFrom:
      secretKeyRef:
        name: nest-secret
        key: MONGO_ROOT_PASS
```

---

## 7. 整体架构图

```
外部流量
    ↓
┌─────────────────────────────────────────────────────────┐
│  Kubernetes Cluster                                      │
│                                                         │
│  Ingress（HTTP 路由）                                    │
│    ├── /proxy/* → gateway-svc:3000                      │
│    └── /*       → web-svc:80                            │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐                    │
│  │ gateway Pod  │   │   web Pod    │                    │
│  │ (x2 副本)    │   │  (nginx)     │                    │
│  └──────┬───────┘   └──────────────┘                    │
│         │ TCP                                           │
│  ┌──────┴──────────────────────┐                        │
│  │  user-service-svc           │  product-service-svc   │
│  │  Pod x1                     │  Pod x1                │
│  └──────────────────────────── ┘                        │
│                                                         │
│  mongodb-svc    rabbitmq-svc    redis-svc               │
│  (StatefulSet)  (Deployment)    (Deployment)            │
│                                                         │
│  PersistentVolume: mongo-pv / rabbitmq-pv               │
└─────────────────────────────────────────────────────────┘
```

---

# 第二部分：部署命令 + 验证方式 + 常见问题

---

## 8. 部署命令完整执行顺序

> 确保 K8s 已启动（底部绿点 `Kubernetes running`），在 `nest-demo/` 目录下执行。

```bash
# ① 先构建本地镜像（K8s 使用本地镜像，需要先 build）
docker compose --env-file .env.docker build


# ② 创建命名空间（相当于新建一个隔离的工作区）
kubectl apply -f k8s/namespace.yaml

# kubectl apply -f k8s/ 一次执行整个目录下的所有 yaml 文件，或者分步骤执行每个文件

# ③ 注入配置和密码
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml

# ④ 部署基础设施
kubectl apply -f k8s/mongodb/
kubectl apply -f k8s/rabbitmq/
kubectl apply -f k8s/redis/

# ⑤ 等待 MongoDB 就绪后再启动依赖它的业务服务
kubectl wait --for=condition=ready pod -l app=mongodb -n nest-demo --timeout=120s

# ⑥ 部署业务服务
kubectl apply -f k8s/export-worker/
kubectl apply -f k8s/user-service/
kubectl apply -f k8s/product-service/
kubectl apply -f k8s/gateway/
kubectl apply -f k8s/web/
```

完成后打开浏览器访问 **http://localhost:30080** 即可看到前端页面。

**更新代码后重新部署：**

```bash
# 重新构建镜像 → 重启对应 Deployment
docker compose --env-file .env.docker build
kubectl rollout restart deployment/gateway -n nest-demo
kubectl rollout restart deployment/web -n nest-demo
```

---

## 9. kubectl 常用命令速查

```bash
# ===== 查看状态 =====
kubectl get pods -n nest-demo               # 查看所有 Pod（STATUS 应为 Running）
kubectl get pods -n nest-demo -o wide       # 含 IP、所在节点
kubectl get services -n nest-demo           # 查看所有 Service 和端口
kubectl get all -n nest-demo                # 查看命名空间所有资源

# ===== 查看日志 =====
kubectl logs -l app=gateway -n nest-demo    # 查看 gateway 日志
kubectl logs <pod-name> -n nest-demo -f     # 实时跟踪某个 Pod 的日志
kubectl logs <pod-name> -n nest-demo --previous  # 查看崩溃前的日志

# ===== 排错 =====
kubectl describe pod <pod-name> -n nest-demo     # 查看 Pod 详情和 Events（启动失败必看）
kubectl get events -n nest-demo                  # 查看所有事件
kubectl exec -it <pod-name> -n nest-demo -- sh   # 进入 Pod 内部调试

# ===== 资源管理 =====
kubectl apply -f k8s/                            # 应用整个目录下所有 yaml
kubectl delete -f k8s/                           # 删除整个目录下所有资源
kubectl rollout restart deployment/gateway -n nest-demo  # 重启 Deployment

# ===== 扩缩容 =====
kubectl scale deployment gateway --replicas=3 -n nest-demo
kubectl scale deployment gateway --replicas=1 -n nest-demo

# ===== 滚动更新 =====
kubectl rollout status deployment/gateway -n nest-demo   # 查看更新进度
kubectl rollout undo deployment/gateway -n nest-demo     # 回滚到上个版本

# ===== 清理 =====
kubectl delete namespace nest-demo          # 删除整个命名空间（含所有资源）
```

---

## 10. 验证部署是否成功

### 第一步：查看 Pod 状态

```bash
kubectl get pods -n nest-demo
```

期望所有 Pod 都是 `Running`，`RESTARTS` 不要持续增加：

```
NAME                               READY   STATUS    RESTARTS   AGE
mongodb-xxxx                       1/1     Running   0          2m
rabbitmq-xxxx                      1/1     Running   0          2m
redis-xxxx                         1/1     Running   0          2m
user-service-xxxx                  1/1     Running   0          1m
product-service-xxxx               1/1     Running   0          1m
export-worker-xxxx                 1/1     Running   0          1m
gateway-xxxx                       1/1     Running   0          1m
web-xxxx                           1/1     Running   0          1m
```

### 第二步：验证接口 & 页面

```bash
# 打开浏览器访问前端页面（NodePort 30080）
start http://localhost:30080

# 测试 gateway 健康检查（NodePort 30000）
curl http://localhost:30000/health

# 测试登录接口
curl -X POST http://localhost:30000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Password01!"}'
```

### 第三步：查看日志确认启动正常

```bash
# 查看 gateway 日志
kubectl logs -l app=gateway -n nest-demo

# 查看 user-service 日志
kubectl logs -l app=user-service -n nest-demo
```

### Pod 启动失败排查

```bash
# 查看 Pod 的 Events（最重要的排错命令）
kubectl describe pod <pod-name> -n nest-demo

# 常见原因：
# ImagePullBackOff  → 镜像不存在，检查镜像名或重新 docker build
# CrashLoopBackOff  → 容器启动后崩溃，用 logs --previous 查看崩溃日志
# Pending           → 资源不足或 PVC 未绑定
```

---

## 11. K8s 与 Docker Compose 部署的区别

| 维度 | Docker Compose | Kubernetes（本地）|
|------|---------------|-----------------|
| **启动命令** | `docker compose up -d` | `kubectl apply -f k8s/` |
| **停止** | `docker compose down` | `kubectl delete namespace nest-demo` |
| **查看日志** | `docker compose logs gateway` | `kubectl logs -l app=gateway -n nest-demo` |
| **进入容器** | `docker exec -it <name> sh` | `kubectl exec -it <pod> -n nest-demo -- sh` |
| **重启服务** | `docker compose restart gateway` | `kubectl rollout restart deployment/gateway -n nest-demo` |
| **访问端口** | 直接 `localhost:3000` | NodePort `localhost:30000` |
| **镜像来源** | 本地 build，直接使用 | 本地 build，`imagePullPolicy: Never` |
| **数据持久化** | named volume | PersistentVolumeClaim (PVC) |
| **服务间通信** | 服务名（如 `mongodb`）| 服务名 + 命名空间（如 `mongodb-svc`）|
| **配置注入** | `.env.docker` 文件 | ConfigMap + Secret |
| **崩溃恢复** | `restart: unless-stopped`（有限）| 自动重建 Pod（可靠）|
| **扩容** | 不支持 | `kubectl scale --replicas=3` |

**核心区别总结：**

```
Docker Compose：
  → 一个命令启动所有服务，配置集中在一个文件里
  → 适合开发调试，操作简单

Kubernetes：
  → 配置分散在多个 yaml 文件里，每类资源独立管理
  → 更健壮：Pod 崩了自动重建、支持扩容、滚动更新
  → 操作命令更多，但更灵活
```

---

## 12. 能访问页面吗

### 当前 K8s 部署状态（前后端全部在 K8s）

执行完 `kubectl apply -f k8s/web/` 后，所有服务均已在 K8s 中运行：

| 服务 | 访问地址 | 说明 |
|------|---------|------|
| **前端页面** | **http://localhost:30080** | nest-web React SPA |
| Gateway API | http://localhost:30000 | 后端接口 |
| RabbitMQ 管理界面 | http://localhost:31672 | 账号 admin/Password01! |

### nginx 如何代理到后端

nest-web 的 nginx 配置通过 K8s **ConfigMap** 注入，把 Docker Compose 里的 `gateway` 服务名替换成了 K8s 的 `gateway-svc`：

```
浏览器 → http://localhost:30080
  ↓
nginx（web Pod）
  ├── /proxy/* → proxy_pass http://gateway-svc:3000/   ← K8s Service DNS
  └── /*       → index.html（SPA 路由）
```

> Docker Compose 的 `nginx.conf` 里用的是 `http://gateway:3000/`（Compose 服务名），K8s 里通过 ConfigMap 挂载不同配置，两套环境互不干扰。

---

# 第三部分：实操 — yaml 文件配置

---

## 13. 启用 Docker Desktop 内置 Kubernetes

1. 打开 Docker Desktop → 右上角 ⚙️ Settings
2. 左侧菜单选 **Kubernetes**
3. 勾选 **Enable Kubernetes**
4. 点击 **Apply & Restart**（需要下载组件，首次启动约 3-5 分钟）
5. 等待左下角出现两个绿点：Docker 和 Kubernetes 都变绿

验证：

```bash
kubectl version --short
# 期望输出：
# Client Version: v1.xx.x
# Server Version: v1.xx.x

kubectl get nodes
# 期望：一个 docker-desktop 节点，STATUS=Ready
```

---

## 14. 目录结构

新建目录 `nest-demo/k8s/`，把所有 K8s 配置文件放在里面。
> yaml 全称 "YAML Ain't Markup Language"，人类可读的配置格式，K8s 用它定义所有资源对象。

```
nest-demo/k8s/
├── namespace.yaml          # 命名空间
├── secret.yaml             # 密码
├── configmap.yaml          # 配置
├── mongodb/
│   ├── pvc.yaml            # 持久化存储
│   ├── deployment.yaml
│   └── service.yaml
├── rabbitmq/
│   ├── deployment.yaml
│   └── service.yaml
├── redis/
│   ├── deployment.yaml
│   └── service.yaml
├── user-service/
│   ├── deployment.yaml
│   └── service.yaml
├── product-service/
│   ├── deployment.yaml
│   └── service.yaml
├── export-worker/
│   └── deployment.yaml
├── gateway/
│   ├── deployment.yaml
│   └── service.yaml
└── web/
    ├── configmap.yaml      # nginx 配置（proxy 指向 gateway-svc）
    ├── deployment.yaml
    └── service.yaml        # NodePort 30080 → 浏览器访问
```

## 15. 基础配置文件（namespace / secret / configmap）

### `k8s/namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: nest-demo
```

### `k8s/secret.yaml`

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: nest-secret
  namespace: nest-demo
type: Opaque
stringData:
  # stringData 会自动 base64，不用手动编码
  MONGO_ROOT_USER: root
  MONGO_ROOT_PASS: Password01!
  MONGODB_URI: mongodb://root:Password01!@mongodb-svc:27017/nest-demo?authSource=admin
  RABBITMQ_USER: admin
  RABBITMQ_PASS: Password01!
  RABBITMQ_URL: amqp://admin:Password01!@rabbitmq-svc:5672
  REDIS_PASS: Password01!
  JWT_SECRET: your-jwt-secret-here
  ADMIN_INIT_PASSWORD: Password01!
  ADMIN_INIT_EMAIL: admin@example.com
```

### `k8s/configmap.yaml`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nest-config
  namespace: nest-demo
data:
  PORT: "3000"
  REDIS_HOST: redis-svc
  REDIS_PORT: "6379"
  USER_SERVICE_HOST: user-service-svc
  PRODUCT_SERVICE_HOST: product-service-svc
  JWT_EXPIRES_IN: 1d
  TZ: Asia/Shanghai
```

## 16. 基础设施（MongoDB / RabbitMQ / Redis）

### `k8s/mongodb/pvc.yaml`（持久化存储声明）

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mongo-pvc
  namespace: nest-demo
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

### `k8s/mongodb/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mongodb
  namespace: nest-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mongodb
  template:
    metadata:
      labels:
        app: mongodb
    spec:
      containers:
        - name: mongodb
          image: mongo:7
          ports:
            - containerPort: 27017
          env:
            - name: MONGO_INITDB_ROOT_USERNAME
              valueFrom:
                secretKeyRef:
                  name: nest-secret
                  key: MONGO_ROOT_USER
            - name: MONGO_INITDB_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: nest-secret
                  key: MONGO_ROOT_PASS
          volumeMounts:
            - name: mongo-data
              mountPath: /data/db
      volumes:
        - name: mongo-data
          persistentVolumeClaim:
            claimName: mongo-pvc
```

### `k8s/mongodb/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mongodb-svc
  namespace: nest-demo
spec:
  selector:
    app: mongodb
  ports:
    - port: 27017
      targetPort: 27017
```

### `k8s/rabbitmq/pvc.yaml`

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: rabbitmq-pvc
  namespace: nest-demo
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 512Mi
```

### `k8s/rabbitmq/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rabbitmq
  namespace: nest-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: rabbitmq
  template:
    metadata:
      labels:
        app: rabbitmq
    spec:
      containers:
        - name: rabbitmq
          image: rabbitmq:3.13-management-alpine
          ports:
            - containerPort: 5672    # AMQP 协议端口（业务服务连接）
            - containerPort: 15672   # 管理界面端口
          env:
            - name: RABBITMQ_DEFAULT_USER
              valueFrom:
                secretKeyRef:
                  name: nest-secret
                  key: RABBITMQ_USER
            - name: RABBITMQ_DEFAULT_PASS
              valueFrom:
                secretKeyRef:
                  name: nest-secret
                  key: RABBITMQ_PASS
          volumeMounts:
            - name: rabbitmq-data
              mountPath: /var/lib/rabbitmq
      volumes:
        - name: rabbitmq-data
          persistentVolumeClaim:
            claimName: rabbitmq-pvc
```

### `k8s/rabbitmq/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: rabbitmq-svc
  namespace: nest-demo
spec:
  selector:
    app: rabbitmq
  ports:
    - name: amqp
      port: 5672
      targetPort: 5672
    - name: management
      port: 15672
      targetPort: 15672
      nodePort: 31672   # 浏览器访问管理界面：http://localhost:31672
  type: NodePort
```

### `k8s/redis/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: nest-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          command: ["redis-server", "--requirepass", "$(REDIS_PASS)"]
          env:
            - name: REDIS_PASS
              valueFrom:
                secretKeyRef:
                  name: nest-secret
                  key: REDIS_PASS
          ports:
            - containerPort: 6379
          volumeMounts:
            - name: redis-data
              mountPath: /data
      volumes:
        - name: redis-data
          emptyDir: {}   # 缓存数据，使用临时卷即可
```

### `k8s/redis/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: redis-svc
  namespace: nest-demo
spec:
  selector:
    app: redis
  ports:
    - port: 6379
      targetPort: 6379
```

---

## 17. 业务服务（user-service / product-service / export-worker / gateway）

### `k8s/export-worker/pvc.yaml`（export-worker 与 gateway 共享的文件卷）

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: export-files-pvc
  namespace: nest-demo
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

### `k8s/user-service/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  namespace: nest-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
    spec:
      containers:
        - name: user-service
          image: nest-demo-user-service:latest
          imagePullPolicy: Never
          ports:
            - containerPort: 3001   # TCP 微服务端口
          envFrom:
            - configMapRef:
                name: nest-config
            - secretRef:
                name: nest-secret
```

### `k8s/user-service/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: user-service-svc
  namespace: nest-demo
spec:
  selector:
    app: user-service
  ports:
    - port: 3001
      targetPort: 3001
  type: ClusterIP   # 仅集群内部可访问（gateway 通过 TCP 连接）
```

### `k8s/product-service/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: product-service
  namespace: nest-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: product-service
  template:
    metadata:
      labels:
        app: product-service
    spec:
      containers:
        - name: product-service
          image: nest-demo-product-service:latest
          imagePullPolicy: Never
          ports:
            - containerPort: 3002   # TCP 微服务端口
          envFrom:
            - configMapRef:
                name: nest-config
            - secretRef:
                name: nest-secret
```

### `k8s/product-service/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: product-service-svc
  namespace: nest-demo
spec:
  selector:
    app: product-service
  ports:
    - port: 3002
      targetPort: 3002
  type: ClusterIP   # 仅集群内部可访问（gateway 通过 TCP 连接）
```

### `k8s/export-worker/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: export-worker
  namespace: nest-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: export-worker
  template:
    metadata:
      labels:
        app: export-worker
    spec:
      containers:
        - name: export-worker
          image: nest-demo-export-worker:latest
          imagePullPolicy: Never
          envFrom:
            - configMapRef:
                name: nest-config
            - secretRef:
                name: nest-secret
          volumeMounts:
            - name: export-files
              mountPath: /app/dist/apps/exports   # 写入导出文件
      volumes:
        - name: export-files
          persistentVolumeClaim:
            claimName: export-files-pvc
```

> export-worker 是 RabbitMQ 消费者，不对外提供服务，**不需要 Service**。

### `k8s/gateway/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gateway
  namespace: nest-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: gateway
  template:
    metadata:
      labels:
        app: gateway
    spec:
      containers:
        - name: gateway
          image: nest-demo-gateway:latest
          imagePullPolicy: Never
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: nest-config
            - secretRef:
                name: nest-secret
          volumeMounts:
            - name: export-files
              mountPath: /app/dist/apps/exports   # 读取导出文件（与 export-worker 共享）
      volumes:
        - name: export-files
          persistentVolumeClaim:
            claimName: export-files-pvc
```

### `k8s/gateway/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: gateway-svc
  namespace: nest-demo
spec:
  selector:
    app: gateway
  ports:
    - port: 3000
      targetPort: 3000
      nodePort: 30000      # 宿主机端口，访问 localhost:30000
  type: NodePort           # 本地学习用 NodePort 对外暴露
```

`k8s/gateway/service.yaml`：已在上方展示，不再重复。

---

## 18. 前端服务（web — nginx + React SPA）

> nest-web 是 React（UmiJS）SPA，打包后由 nginx 托管。nginx 在 K8s 内通过 Service DNS 代理 API 请求到 gateway。

### 关键点：为什么要 ConfigMap？

nest-web 的 `nginx.conf` 里写的是 `proxy_pass http://gateway:3000/`（Docker Compose 服务名）。  
在 K8s 里 gateway 的 Service 名是 `gateway-svc`，所以需要**不同的 nginx 配置**。  
通过 ConfigMap 挂载覆盖容器内的 `/etc/nginx/conf.d/default.conf`，无需修改镜像，两套环境互不干扰。

### `k8s/web/configmap.yaml`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-nginx-conf
  namespace: nest-demo
data:
  default.conf: |
    server {
        listen 80;
        server_name localhost;

        root /usr/share/nginx/html;
        index index.html;

        # 反向代理：/proxy/* 转发到 K8s gateway Service
        location /proxy/ {
            proxy_pass http://gateway-svc:3000/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        # SPA history 路由：未匹配路径返回 index.html
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
```

### `k8s/web/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: nest-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nest-web:latest      # docker compose build 打出的镜像名
          imagePullPolicy: Never      # 本地镜像，不从远端拉取
          ports:
            - containerPort: 80
          volumeMounts:
            - name: nginx-conf
              mountPath: /etc/nginx/conf.d/default.conf
              subPath: default.conf   # 只覆盖 default.conf，不影响其他 nginx 配置
      volumes:
        - name: nginx-conf
          configMap:
            name: web-nginx-conf      # 挂载 K8s 版本的 nginx 配置
```

### `k8s/web/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-svc
  namespace: nest-demo
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30080   # 浏览器访问：http://localhost:30080
  type: NodePort
```

### docker-compose.yml 同步修改

在 `web` 服务下添加 `image: nest-web:latest`，让 `docker compose build` 打出的镜像名与 K8s deployment 一致：

```yaml
web:
  build:
    context: ../nest-web
    dockerfile: Dockerfile
  image: nest-web:latest      # 显式命名，K8s imagePullPolicy: Never 可复用此镜像
  ...
```

---

> 💡 **学习路径建议**：
> 1. 本地 Docker Desktop K8s 把项目跑通（当前阶段）
> 2. 学习 [Helm](https://helm.sh/)——K8s 的 npm，用 Chart 管理一组 yaml
> 3. 了解 CI/CD（GitHub Actions 自动构建镜像 → 推送到镜像仓库 → 自动部署到 K8s）
> 4. 云服务商托管 K8s（阿里云 ACK / 腾讯云 TKE / AWS EKS）
