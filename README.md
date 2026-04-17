## nestjs-demo
- 目标：通过实战项目学习 NestJS，涵盖核心功能和常用场景


## 启动数据库：

### 数据库连接地址：

``` MONGODB_URI=mongodb://zanyu:Password01!@localhost:27017/nest-demo?authSource=admin```

### 环境准备:  安装docker desktop

### 第一次启动 创建 MongoDB 容器
```bash
#第一次启动 MongoDB 容器，使用环境变量初始化 root 用户 admin，密码 Password01!，并挂载持久化卷 nest-mongo-data。
# 持久化卷可以确保即使容器被删除，数据也不会丢失。

docker run -d -p 27017:27017 --name nest-mongo `
  -v nest-mongo-data:/data/db `
  -e MONGO_INITDB_ROOT_USERNAME=admin `
  -e MONGO_INITDB_ROOT_PASSWORD=Password01! `
  mongo:7
```

### 后续启动
```bash
# 启动 MongoDB
docker start nest-mongo
```

##  启动 Redis

### 第一次启动 创建 Redis 容器
```bash 
docker run -d -p 6379:6379 --name nest-redis redis:7
```
### 后续启动 
```bash
docker start nest-redis
```

## 启动RabbitMQ
### 第一次启动 创建 RabbitMQ 容器
```bash
docker run -d --name nest-rabbitmq `
  -p 5672:5672 `
  -p 15672:15672 `
  -e RABBITMQ_DEFAULT_USER=admin `
  -e RABBITMQ_DEFAULT_PASS='Password01!' `
  rabbitmq:3-management
```
### 后续启动
```bash
docker start nest-rabbitmq
```


## 启动项目
```bash
# 安装依赖
npm install

# 启动项目
npm run start:dev

```