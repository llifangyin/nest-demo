## nestjs-demo
- 目标：通过实战项目学习 NestJS，涵盖核心功能和常用场景

## 安装docker
- [Docker Desktop](https://www.docker.com/products/docker-desktop)（适合 Windows/Mac，内置 Kubernetes 支持）

## 启动 mongodb / redis / rabbitmq
```bash
docker compose --env-file .env.docker up mongodb redis rabbitmq -d
```

## 启动项目
```bash
# 安装依赖
npm install

# 启动项目
npm run start:all

```