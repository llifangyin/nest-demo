## docker版本

### 启动与验证
-
所有文件准备好之后，在 `nest-demo/` 目录下执行：

```bash
# 第一次启动（构建镜像 + 启动容器，较慢）
docker compose --env-file .env.docker up --build
# 后续启动（镜像已构建，直接启动，较快）
docker compose --env-file .env.docker up

# 后台运行（不占终端）
docker compose --env-file .env.docker up --build -d

# 查看所有容器状态
docker compose ps

# 查看某个服务的日志
docker compose logs gateway
docker compose logs gateway -f  # 实时跟踪

# 停止所有容器  会删除容器但不删除数据
docker compose down

# 只停止容器，保留数据卷
docker compose stop

# 停止并删除数据卷（危险：会清空 MongoDB 数据！）
docker compose down -v

## 修改代码后重启
# 重新构建并重启
docker compose up --build -d
# 只重建某一个服务
docker compose up --build gateway -d

# 数据存在 Docker Volume（命名卷）里
docker volume ls                        # 查看所有卷
docker volume inspect nest-demo_mongo-data  # 查看卷详情
```


### 验证步骤

```bash
# 1. 检查所有容器是否在运行
docker compose ps

### 常用命令速查

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
