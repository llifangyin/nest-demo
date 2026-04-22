## k8s版本(docker 基础上)

### 1. 构建本地镜像
在 `nest-demo/` 目录下执行：

```bash
# 构建镜像（包含 nest-web:latest）
docker compose --env-file .env.docker build
```
### 2. 部署到 Kubernetes
```bash
# 应用 k8s 配置
kubectl apply -f k8s/
```

### 3. 验证部署
```bash
# 查看所有 Pod 状态
kubectl get pods -n nest-demo
# 查看某个 Pod 的日志
kubectl logs <pod-name> -n nest-demo
```
完成后打开浏览器访问 **http://localhost:30080** 即可看到前端页面。

### 4. 操作命令
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

