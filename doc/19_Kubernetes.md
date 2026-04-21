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

**第二部分：动手实操**

8. [第一步：启用 Docker Desktop 内置 Kubernetes](#8-第一步启用-docker-desktop-内置-kubernetes)
9. [第二步：了解 kubectl 基本命令](#9-第二步了解-kubectl-基本命令)
10. [第三步：部署基础设施（MongoDB / RabbitMQ / Redis）](#10-第三步部署基础设施mongodb--rabbitmq--redis)
11. [第四步：创建 Secret 管理密码](#11-第四步创建-secret-管理密码)
12. [第五步：部署业务服务](#12-第五步部署业务服务)
13. [第六步：验证与访问](#13-第六步验证与访问)
14. [常用命令速查](#14-常用命令速查)
15. [Docker Compose vs Kubernetes 对比](#15-docker-compose-vs-kubernetes-对比)

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

# 第二部分：动手实操

> 本项目使用 **Docker Desktop 内置的 Kubernetes**，不需要额外安装，适合本地学习。

---

## 8. 第一步：启用 Docker Desktop 内置 Kubernetes

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

## 9. 第二步：了解 kubectl 基本命令

`kubectl` 是操作 Kubernetes 的命令行工具，类比 `docker` 命令：

```bash
# ===== 查看资源 =====
kubectl get pods                    # 查看所有 Pod
kubectl get pods -o wide            # 查看 Pod 详情（含 IP、所在节点）
kubectl get deployments             # 查看所有 Deployment
kubectl get services                # 查看所有 Service
kubectl get all                     # 查看所有资源

# ===== 查看日志 =====
kubectl logs <pod-name>             # 查看 Pod 日志
kubectl logs <pod-name> -f          # 实时跟踪
kubectl logs <pod-name> --previous  # 查看上次崩溃的日志

# ===== 调试 =====
kubectl describe pod <pod-name>     # 查看 Pod 详细信息（含 Events，排错用）
kubectl exec -it <pod-name> -- sh   # 进入 Pod Shell

# ===== 应用配置 =====
kubectl apply -f <file.yaml>        # 应用配置文件（创建或更新）
kubectl delete -f <file.yaml>       # 删除配置文件定义的资源
kubectl delete pod <pod-name>       # 删除 Pod（Deployment 会自动重建）

# ===== 命名空间 =====
kubectl get pods -n <namespace>     # 查看指定命名空间的 Pod
kubectl get pods --all-namespaces   # 查看所有命名空间
```

---

## 10. 第三步：部署基础设施（MongoDB / RabbitMQ / Redis）

新建目录 `nest-demo/k8s/`，把所有 K8s 配置文件放在里面。

### 目录结构
yaml文件全称是 "YAML Ain't Markup Language"，是一种人类可读的数据序列化格式，常用于配置文件。Kubernetes 使用 YAML 文件定义资源对象，如 Pod、Deployment、Service 等。
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
└── gateway/
    ├── deployment.yaml
    └── service.yaml
```

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

## 11. 第四步：创建 Secret 管理密码

> ⚠️ `secret.yaml` 里有密码，不要提交到 Git。生产环境用 [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) 或云服务商的 KMS。

```bash
# 在 nest-demo/ 目录下

# 创建命名空间
kubectl apply -f k8s/namespace.yaml

# 创建 Secret 和 ConfigMap
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml

# 验证
kubectl get secret -n nest-demo
kubectl get configmap -n nest-demo
```

---

## 12. 第五步：部署业务服务

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

`k8s/gateway/service.yaml`：

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

### 一次性部署所有服务

```bash
# 部署基础设施
kubectl apply -f k8s/mongodb/
kubectl apply -f k8s/rabbitmq/
kubectl apply -f k8s/redis/

# 等待基础设施就绪
kubectl wait --for=condition=ready pod -l app=mongodb -n nest-demo --timeout=60s

# 部署业务服务
kubectl apply -f k8s/user-service/
kubectl apply -f k8s/product-service/
kubectl apply -f k8s/export-worker/
kubectl apply -f k8s/gateway/
```

---

## 13. 第六步：验证与访问

```bash
# 查看所有 Pod 状态（等待全部 Running）
kubectl get pods -n nest-demo

# 查看 Service（找到 gateway-svc 的 NodePort）
kubectl get services -n nest-demo

# 查看某个 Pod 的日志
kubectl logs -l app=gateway -n nest-demo

# 测试接口（NodePort 30000）
curl http://localhost:30000/health

# 进入 gateway Pod 调试
kubectl exec -it $(kubectl get pod -l app=gateway -n nest-demo -o name) -n nest-demo -- sh
```

---

## 14. 常用命令速查

```bash
# ===== 资源管理 =====
kubectl apply -f k8s/              # 应用整个目录下所有 yaml
kubectl delete -f k8s/             # 删除整个目录下所有资源
kubectl rollout restart deployment/gateway -n nest-demo  # 重启 Deployment

# ===== 扩缩容 =====
kubectl scale deployment gateway --replicas=3 -n nest-demo   # 扩容到 3 个副本
kubectl scale deployment gateway --replicas=1 -n nest-demo   # 缩容回 1 个

# ===== 滚动更新 =====
kubectl set image deployment/gateway gateway=nest-demo-gateway:v2 -n nest-demo
kubectl rollout status deployment/gateway -n nest-demo   # 查看更新进度
kubectl rollout undo deployment/gateway -n nest-demo     # 回滚到上个版本

# ===== 排错 =====
kubectl describe pod <name> -n nest-demo    # 查看 Pod 事件（启动失败必看）
kubectl get events -n nest-demo             # 查看命名空间所有事件

# ===== 清理 =====
kubectl delete namespace nest-demo          # 删除整个命名空间（含所有资源）
```

---

## 15. Docker Compose vs Kubernetes 对比

| 维度 | Docker Compose | Kubernetes |
|------|---------------|-----------|
| **适用场景** | 本地开发、单机部署 | 生产环境、多节点集群 |
| **配置文件** | `docker-compose.yml`（1个文件）| 多个 `.yaml` 文件 |
| **高可用** | 不支持（单实例）| 支持（多副本 + 自动重建）|
| **自动扩容** | 手动 | `kubectl scale` 或 HPA 自动 |
| **滚动更新** | 停机更新 | 不停机滚动更新 |
| **服务发现** | 服务名 DNS | 服务名 DNS（Service）|
| **学习成本** | 低 | 高 |
| **运维复杂度** | 低 | 高 |
| **适合阶段** | 开发 / 学习 / 小项目 | 中大型生产项目 |

---

> 💡 **学习路径建议**：
> 1. 本地 Docker Desktop K8s 把项目跑通（当前阶段）
> 2. 学习 [Helm](https://helm.sh/)——K8s 的 npm，用 Chart 管理一组 yaml
> 3. 了解 CI/CD（GitHub Actions 自动构建镜像 → 推送到镜像仓库 → 自动部署到 K8s）
> 4. 云服务商托管 K8s（阿里云 ACK / 腾讯云 TKE / AWS EKS）
