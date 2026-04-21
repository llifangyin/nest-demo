# 阶段1 构建builder
FROM node:18-alpine AS builder

# 安装构建工具(如 node-gyp 需要的 Python 和 C++ 编译器)
RUN apk add --no-cache python3 make g++

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./
COPY nest-cli.json tsconfig*.json ./

# 安装依赖
# (ci与install的区别：
# ci会删除 node_modules 目录并重新安装，适合生产环境；
# install 会增量安装，适合开发环境)
RUN npm ci

# 复制源代码
COPY apps/ apps/
COPY libs/ libs/

# 构建参数：指定要构建哪个应用
ARG APP_NAME=gateway

# 编译 NestJS 应用
RUN npx nest build ${APP_NAME}

# 阶段2 生产环境

FROM node:18-alpine AS runner

# 创建非 root 用户（安全最佳实践）
# alpine 的 adduser 和 addgroup 命令用法与其他 Linux 发行版略有不同，使用 -S 选项创建系统用户和组
RUN addgroup -S  addgroup && adduser -S appuser -G addgroup

# 设置工作目录
WORKDIR /app

# 从 builder 阶段复制构建好的文件
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 复制构建好的应用文件
COPY --from=builder /app/dist ./dist

# 提前创建 logs 目录并赋予 appuser 写权限（必须在 USER 切换前做）
RUN mkdir -p /app/logs && chown -R appuser:addgroup /app/logs

# 切换到非 root 用户
USER appuser

ARG APP_NAME=gateway
ENV APP_NAME=${APP_NAME}

CMD node dist/apps/${APP_NAME}/main.js