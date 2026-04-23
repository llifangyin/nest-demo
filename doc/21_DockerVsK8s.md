# 1. Docker 部署在哪里？
```
你的 Windows 电脑
└── WSL2 (一个轻量Linux虚拟机)
    └── Docker Engine (运行在WSL2里)
        ├── 容器: gateway-1
        ├── 容器: nest-mongo
        ├── 容器: nest-redis
        └── 容器: nest-rabbitmq
            ...
```
所有容器共享同一个 Linux 内核（WSL2的），它们不是虚拟机，是隔离的进程。
# 2. K8s 集群怎么理解？
本地的 K8s 是单节点集群（图里显示 Nodes: 1，节点名就叫 docker-desktop）
```
生产环境的集群长这样：
┌─────────────────────────────────────┐
│           K8s 集群                  │
│  ┌─────────┐  ┌─────────┐  ┌─────┐ │
│  │ Node 1  │  │ Node 2  │  │Node3│ │
│  │(物理机) │  │(物理机) │  │ ... │ │
│  │ gateway │  │ gateway │  │     │ │
│  │  pod    │  │  pod    │  │     │ │
│  └─────────┘  └─────────┘  └─────┘ │
└─────────────────────────────────────┘

你本地的集群长这样（单节点）：
┌─────────────────────────────────────┐
│           K8s 集群                  │
│  ┌──────────────────────────────┐   │
│  │   Node: docker-desktop       │   │
│  │  (就是你的WSL2那台机器)      │   │
│  │  gateway-pod                 │   │
│  │  mongodb-pod                 │   │
│  │  rabbitmq-pod  ...           │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

# 3. 访问方式区别
```
Docker Compose 访问方式：
浏览器/客户端
    ↓
localhost:3000  (直接通过端口映射)
    ↓
gateway容器

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

K8s 访问方式（没有Ingress时）：
浏览器/客户端
    ↓
??? 进不去！ClusterIP是内部IP，外面访问不到
    
K8s 访问方式（配置Ingress后）：
浏览器/客户端
    ↓
localhost:80 或 域名
    ↓
Ingress（相当于K8s的网关/反向代理）
    ↓
gateway-svc (ClusterIP)
    ↓
gateway-pod
```

# 4. Ingress 怎么配置
## 第一步：安装 Ingress Controller（你本地还没装这个）
```bash
# 安装 nginx ingress controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml

# 等待启动完成
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s
```
## 第二步：创建 Ingress 配置文件 k8s/ingress.yaml
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: nest-ingress
  namespace: nest-demo
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - host: localhost          # 本地用localhost
      http:
        paths:
          - path: /            # 所有请求
            pathType: Prefix
            backend:
              service:
                name: gateway-svc   # 转发到你的gateway服务
                port:
                  number: 3000
```
## 第三步：应用 Ingress 配置
```bash
kubectl apply -f k8s/ingress.yaml

# 查看是否生效
kubectl get ingress -n nest-demo
```
## 验证
```bash
# 看到 ADDRESS 有值就成功了
NAME           CLASS   HOSTS       ADDRESS     PORTS   AGE
nest-ingress   nginx   localhost   localhost   80      10s

# 然后直接访问
curl http://localhost/api/xxx
```

# 5. 总结
WSL2    = 地基（Linux环境）
Docker  = 在地基上盖的独栋小屋（单机）
K8s     = 在地基上建的小区物业（管理多栋楼）
Ingress = 小区的门卫室（统一管理进出）