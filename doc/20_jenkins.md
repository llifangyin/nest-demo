# 20. Jenkins CI/CD — 前端部署实战

> **前置知识**：已完成 [18_dockerCompose.md](./18_dockerCompose.md)，理解 Docker 镜像、容器的基本概念。
> **目标**：理解 Jenkins 是什么，并把 `nest-web` 前端项目用 Jenkins 自动构建 + 部署到本地容器，跑通完整流程。

---

## 目录

**第一部分：讲解 — 搞懂原理**

1. [CI/CD 是什么](#1-cicd-是什么)
2. [Jenkins 是什么](#2-jenkins-是什么)
3. [Jenkins 完整流程](#3-jenkins-完整流程)
4. [Jenkinsfile — 流水线的剧本](#4-jenkinsfile--流水线的剧本)
5. [部署到哪里 — 本地方案说明](#5-部署到哪里--本地方案说明)

**第二部分：实操 — 一步步跑通**

6. [环境准备](#6-环境准备)
7. [第一步：用 Docker 启动 Jenkins](#7-第一步用-docker-启动-jenkins)
8. [第二步：初始化 Jenkins](#8-第二步初始化-jenkins)
9. [第三步：写 Jenkinsfile](#9-第三步写-jenkinsfile)
10. [第四步：在 Jenkins 创建 Pipeline Job](#10-第四步在-jenkins-创建-pipeline-job)
11. [第五步：手动触发构建](#11-第五步手动触发构建)
12. [第六步：验证部署结果](#12-第六步验证部署结果)
13. [常见错误排查](#13-常见错误排查)

---

# 第一部分：讲解 — 搞懂原理

---

## 1. CI/CD 是什么

### 你现在的部署方式

```
手动部署（每次上线都要人守着）：
  1. 本地 npm run build → 生成 dist/
  2. scp dist/ 到服务器
  3. 服务器上重启 nginx
  4. 出错了手动回滚
```

### CI/CD 自动化之后

```
CI（持续集成 Continuous Integration）
  = 每次 git push，自动：拉代码 → 安装依赖 → 编译 → 测试
  → 目的：快速发现问题

CD（持续部署 Continuous Deployment）
  = CI 通过后，自动把构建产物部署到目标环境
  → 目的：省去手动操作，每次 push 都能自动上线
```

### 前端类比

```
你平时写的 package.json scripts：
  "build": "max build"

CI/CD 就是：
  有人帮你自动执行这些命令，并且：
  - 出错时发通知
  - 成功时自动替换线上版本
  - 失败时保留旧版本不影响用户
```

---

## 2. Jenkins 是什么

Jenkins 是一个**开源 CI/CD 服务器**，它做的事情就是：

```
监听代码变化（或手动触发）
  → 按照你写的 Jenkinsfile 脚本，一步一步执行命令
  → 每步的日志都记录下来，方便排查问题
```

### Jenkins 核心概念速查

| 概念 | 类比 | 说明 |
|------|------|------|
| **Job / Pipeline** | 一个 npm scripts 任务 | 一条流水线，包含多个步骤 |
| **Jenkinsfile** | package.json 里的 scripts | 用代码描述流水线的每一步 |
| **Stage** | 一个 npm script 命令 | 流水线里的一个阶段（如 Build） |
| **Agent** | 执行命令的机器 | Jenkins 在哪台机器上跑这条流水线 |
| **Credentials** | .env 文件 | 安全存储密码、SSH Key 等敏感信息 |
| **Build Number** | git commit hash | 每次构建的编号，方便回滚 |
| **Console Output** | 终端输出日志 | 点进去看每步命令的执行结果 |

### 和你公司使用方式的对应

```
你公司 Jenkins（图1）配置了：
  GitLab Connection = gitlab
  → Jenkins 用这个连接去拉你们 GitLab 上的代码

  Job 名称 = 药监前端
  → 这就是一个针对前端项目的 Pipeline Job

  Triggers（触发器）
  → 配置成：开发者 push 代码后，GitLab 通知 Jenkins 自动开始构建
```

---

## 3. Jenkins 完整流程

### 以 nest-web 前端项目为例

```
开发者 git push → GitLab
        ↓  （Webhook 通知）
Jenkins 收到触发信号
        ↓
┌─────────────────────────────────────┐
│  Stage 1: Checkout（拉代码）         │
│    git clone nest-web 仓库           │
├─────────────────────────────────────┤
│  Stage 2: Install（装依赖）          │
│    npm ci                            │
├─────────────────────────────────────┤
│  Stage 3: Build（编译打包）          │
│    npm run build → 生成 dist/        │
├─────────────────────────────────────┤
│  Stage 4: Docker Build（制作镜像）   │
│    docker build -t nest-web:v1 .     │
├─────────────────────────────────────┤
│  Stage 5: Deploy（启动新容器）        │
│    停掉旧容器 → 用新镜像启动新容器    │
└─────────────────────────────────────┘
        ↓
用户访问 localhost:8080 看到新版本
```

### 为什么要先 docker build

`nest-web/Dockerfile` 已经写好了两阶段构建：

```
阶段1（builder）：
  FROM node:18-alpine  → 有 Node 环境
  npm ci + npm run build → 生成 dist/

阶段2（runner）：
  FROM nginx:alpine   → 只有 nginx，很小
  把 dist/ 放进去
  最终镜像 ≈ nginx + 你的静态文件
```

所以流水线的结果是：**一个包含最新前端代码的 nginx Docker 镜像**，
把这个镜像跑起来，用户就能访问最新版本。

---

## 4. Jenkinsfile — 流水线的剧本

Jenkinsfile 放在项目根目录，Jenkins 读取它来知道要干什么。

### 基本结构

```groovy
pipeline {
    agent any            // 在任意可用机器上运行

    environment {        // 相当于 .env，定义环境变量
        IMAGE_NAME = 'nest-web'
        CONTAINER_PORT = '80'
        HOST_PORT = '8080'
    }

    stages {             // 所有阶段

        stage('Checkout') {          // 第1步：拉代码
            steps {
                checkout scm         // Jenkins 自动从配置的 Git 仓库拉
            }
        }

        stage('Build Image') {       // 第2步：构建 Docker 镜像
            steps {
                sh "docker build -t ${IMAGE_NAME}:${BUILD_NUMBER} ."
                //   BUILD_NUMBER = Jenkins 内置变量，每次构建自增（1,2,3...）
                //   用它做 tag，方便回滚到任意历史版本
            }
        }

        stage('Deploy') {            // 第3步：部署（替换容器）
            steps {
                sh """
                    docker stop ${IMAGE_NAME} || true
                    docker rm   ${IMAGE_NAME} || true
                    docker run -d \
                      --name ${IMAGE_NAME} \
                      -p ${HOST_PORT}:${CONTAINER_PORT} \
                      ${IMAGE_NAME}:${BUILD_NUMBER}
                """
                // || true：容器不存在时不报错，继续执行
            }
        }
    }

    post {               // 流水线结束后的钩子
        success { echo '部署成功，访问 http://localhost:8080' }
        failure { echo '部署失败，请查看 Console Output' }
    }
}
```

### Groovy 语法只需认识这几个词

| 关键词 | 含义 |
|--------|------|
| `pipeline {}` | 整个流水线容器 |
| `agent any` | 在哪台机器跑 |
| `environment {}` | 定义环境变量 |
| `stage('名字') {}` | 一个具体阶段 |
| `sh '命令'` | 执行 Linux shell 命令 |
| `${变量名}` | 引用变量 |
| `BUILD_NUMBER` | Jenkins 内置变量：本次构建编号 |
| `post { success failure }` | 成功/失败后的回调 |

---

## 5. 部署到哪里 — 本地方案说明

### 不需要虚拟机

学习阶段不需要单独创建虚拟机，原因：
- 虚拟机需要额外配置网络、SSH、磁盘，学习成本高
- Docker 本身就能模拟"服务器"环境
- 你已经装了 Docker Desktop，直接用

### 本地实操方案

```
你的电脑（Windows + Docker Desktop）
│
├── Jenkins 容器（运行 Jenkins 服务）
│     访问：http://localhost:9090
│
└── nest-web 容器（Jenkins 构建后部署到这里）
      访问：http://localhost:8080
      （就是你的"目标服务器"，同一台机器上的另一个容器）
```

### 和真实生产环境的区别

```
本地学习：
  Jenkins 容器 → 构建镜像 → 在同一台机器跑容器

生产环境：
  Jenkins 服务器 → 构建镜像 → push 到镜像仓库 → SSH 到目标服务器拉镜像运行

两者原理完全相同，只是"目标服务器"从 localhost 换成了远程 IP
```

---

# 第二部分：实操 — 一步步跑通

---

## 6. 环境准备

### 检查 Docker 是否正常

```powershell
docker --version
# 输出：Docker version 24.x.x

docker ps
# 输出：空列表（无运行中容器）即可
```

### 实操完成后新增的文件

```
nest-web/
  Dockerfile          ← 已有，不需要改
  nginx.conf          ← 已有，不需要改
  Jenkinsfile         ← 第三步新建
  ...
```

---

## 7. 第一步：用 Docker 启动 Jenkins

### 为什么用 Docker 跑 Jenkins

- 不需要在本机装 Java 环境
- 删除容器就彻底卸载，不污染本机
- 和生产环境的 Jenkins 用法完全一致

### 启动命令

```powershell
docker run -d `
  --name jenkins `
  -p 9090:8080 `
  -p 50000:50000 `
  -v jenkins_home:/var/jenkins_home `
  -v /var/run/docker.sock:/var/run/docker.sock `
  jenkins/jenkins:lts-jdk17
```

### 参数说明

| 参数 | 说明 |
|------|------|
| `-p 9090:8080` | Jenkins Web 界面映射到本机 9090 端口 |
| `-p 50000:50000` | Jenkins Agent 通信端口 |
| `-v jenkins_home:/var/jenkins_home` | Jenkins 数据持久化（重启不丢配置） |
| `-v /var/run/docker.sock:/var/run/docker.sock` | 让 Jenkins 容器能调用宿主机的 Docker |
| `jenkins/jenkins:lts-jdk17` | 官方 LTS 版镜像 |

> **关键**：挂载 `docker.sock` 是让 Jenkins 能在流水线里执行 `docker build` / `docker run` 命令，否则 Jenkins 容器内找不到 Docker。

### 在 Jenkins 容器里安装 Docker CLI

Jenkins 官方镜像里有 Java 但没有 Docker CLI，需要手动安装：

```powershell
# 进入 Jenkins 容器（-u root 以 root 身份执行）
docker exec -u root -it jenkins bash

# 容器内执行：安装 Docker CLI
apt-get update
apt-get install -y docker.io

# 验证
docker --version

# 退出容器
exit
```

### 验证 Jenkins 是否启动

```powershell
# 查看容器是否运行
docker ps

# 查看启动日志（等待完全启动）
docker logs jenkins
# 看到 "Jenkins is fully up and running" 说明成功
```

---

## 8. 第二步：初始化 Jenkins

### 打开 Jenkins 界面

浏览器访问：`http://localhost:9090`

### 获取初始管理员密码

```powershell
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
# 输出一串随机字符，复制它
```

### 初始化步骤

```
1. 粘贴密码 → 点击 Continue

2. 选择 "Install suggested plugins"（安装推荐插件）
   等待安装完成（需要几分钟，需要网络）

3. 创建管理员账号
   用户名：admin
   密码：admin123（自己设，记住即可）
   邮箱：随便填

4. Jenkins URL 保持默认 http://localhost:9090/
   点击 Save and Finish

5. 点击 "Start using Jenkins"
```

### 安装 Docker Pipeline 插件

Jenkins 默认没有 Docker 相关插件：

```
Jenkins 首页
→ Manage Jenkins
→ Plugins
→ Available plugins
→ 搜索：Docker Pipeline
→ 勾选 → Install
→ 安装完成后：Manage Jenkins → Restart（重启 Jenkins）
```

---

## 9. 第三步：写 Jenkinsfile

在 `nest-web/` 根目录新建 `Jenkinsfile`（无后缀名）：

```groovy
pipeline {
    agent any

    environment {
        IMAGE_NAME     = 'nest-web'
        HOST_PORT      = '8080'
        CONTAINER_PORT = '80'
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
                echo "构建编号：${BUILD_NUMBER}"
                echo "代码分支：${GIT_BRANCH}"
            }
        }

        stage('Build Image') {
            steps {
                sh """
                    docker build -t ${IMAGE_NAME}:${BUILD_NUMBER} .
                    docker tag ${IMAGE_NAME}:${BUILD_NUMBER} ${IMAGE_NAME}:latest
                    echo "镜像构建完成：${IMAGE_NAME}:${BUILD_NUMBER}"
                """
            }
        }

        stage('Deploy') {
            steps {
                sh """
                    docker stop ${IMAGE_NAME} || true
                    docker rm   ${IMAGE_NAME} || true
                    docker run -d \
                      --name ${IMAGE_NAME} \
                      -p ${HOST_PORT}:${CONTAINER_PORT} \
                      ${IMAGE_NAME}:${BUILD_NUMBER}
                """
            }
        }

        stage('Verify') {
            steps {
                sh """
                    sleep 3
                    docker ps --filter "name=${IMAGE_NAME}" --format "容器状态：{{.Status}}"
                """
            }
        }
    }

    post {
        success {
            echo "构建 #${BUILD_NUMBER} 部署成功！访问 http://localhost:${HOST_PORT}"
        }
        failure {
            echo "构建 #${BUILD_NUMBER} 失败，请检查 Console Output"
        }
        always {
            // 清理旧镜像，只保留最近 3 个版本
            sh "docker images ${IMAGE_NAME} --format '{{.Tag}}' | sort -n | head -n -3 | xargs -I {} docker rmi ${IMAGE_NAME}:{} || true"
        }
    }
}
```

### 提交到 Git

```powershell
cd d:\code\github-lfy\nestjs-demo\nest-web

git add Jenkinsfile
git commit -m "chore: add Jenkinsfile"
git push
```

---

## 10. 第四步：在 Jenkins 创建 Pipeline Job

### 新建 Job

```
Jenkins 首页 → New Item
  输入名称：nest-web
  选择：Pipeline
  点击 OK
```

### 配置 Pipeline 来源

进入 Job 配置页，找到底部 **Pipeline** 区域：

```
Definition：Pipeline script from SCM
  ↓
SCM：Git
  ↓
Repository URL：
  https://github.com/llifangyin/nest-web.git
  （公开仓库不需要 Credentials）
  ↓
Branch Specifier：*/master
  ↓
Script Path：Jenkinsfile
```

> 如果 Jenkins 容器访问不到 GitHub（网络问题），改用 **Pipeline script** 直接把 Jenkinsfile 内容粘贴进去，同样能跑通。

### 点击 Save

---

## 11. 第五步：手动触发构建

### 第一次构建

```
进入 nest-web Job 页面
→ 点击左侧 "Build Now"
→ Build History 出现 #1
→ 点击 #1 → 点击 "Console Output"
→ 实时观察每个 Stage 的执行日志
```

### 成功的日志长这样

```
[Pipeline] stage (Checkout)
> git checkout master
[Pipeline] stage (Build Image)
+ docker build -t nest-web:1 .
Step 1/8 : FROM node:18-alpine AS builder
...
Successfully tagged nest-web:1
[Pipeline] stage (Deploy)
+ docker stop nest-web
Error: No such container  （第一次正常，容器不存在）
+ docker run -d --name nest-web -p 8080:80 nest-web:1
xxxxxxxxxxxxxxxxxxxxxxxx
[Pipeline] stage (Verify)
容器状态：Up 3 seconds
[Pipeline] End of Pipeline
构建 #1 部署成功！访问 http://localhost:8080
Finished: SUCCESS
```

---
### 停止服务
```bash

docker stop nest-web # 停止nest-web容器
docker rm nest-web # 删除nest-web容器，注意这不会删除镜像，如果需要删除镜像：
docker compose down # 停止并删除 nest-demo 的所有容器和网络
docker stop jenkins # 或者 docker rm -f jenkins 强制删除 jenkins 容器
docker rm jenkins # 删除 jenkins 容器后，jenkins_home 卷里的数据还在，如果不需要了，可以删除卷：
docker volume rm jenkins_home # 删除 jenkins_home 卷，注意这会删除 Jenkins 的所有数据，包括配置和构建历史
```


## 12. 第六步：验证部署结果

### 确认两个容器都在运行

```powershell
docker ps
# 期望看到：
# jenkins    Up xx hours   0.0.0.0:9090->8080/tcp
# nest-web   Up xx seconds 0.0.0.0:8080->80/tcp
```

### 访问部署好的前端

浏览器打开：`http://localhost:8080`

可以看到 nest-web 的登录页面，这就是 Jenkins 自动构建并部署的结果。

## 打通后端
```bash
# docker-compose.yml 注释掉前端的web配置，web在jenkins里构建部署
docker compose up -d  
# 把 nest-web 容器也加入同一个网络：
docker network connect nest-demo_nest-network nest-web
# 修改 nest-web/nginx.conf 里 proxy_pass http://backend:3000;
# 重新构建并部署 Jenkins Job，访问 http://localhost:8080/api/users
```

### 模拟"改代码 → 自动上线"

```
1. 修改 nest-web/src/pages/Login/ 里任意文字
2. git commit + git push
3. 回到 Jenkins → Build Now
4. 等待构建完成（Console Output 看进度）
5. 刷新 http://localhost:8080，修改已生效
```

### 回滚到上一个版本

```
Jenkins → nest-web Job → Build History
→ 找到上一次成功的构建（如 #1）
→ 点进去 → 点 Rebuild
→ Jenkins 重新用 #1 的代码跑一遍流水线
```

---

## 13. 常见错误排查

### `docker: command not found`

```
原因：Jenkins 容器内没有 Docker CLI
解决：
  docker exec -u root -it jenkins bash
  apt-get install -y docker.io
  exit
```

### `permission denied while trying to connect to Docker daemon`

```
原因：jenkins 用户没有权限访问 docker.sock
解决：
  docker exec -u root -it jenkins bash
  chmod 666 /var/run/docker.sock
  exit
```

### `Checkout failed — repository not found`

```
原因：Git 仓库地址或凭证配置错误
解决：
  1. 浏览器验证仓库地址是否能打开
  2. 私有仓库添加 Credentials（用户名+密码或 Token）
  3. 或改用 "Pipeline script" 直接粘贴 Jenkinsfile，绕过 Git
```

### `port is already allocated`（8080 端口冲突）

```
原因：8080 已被其他程序占用
解决：
  # 查看占用情况
  docker ps --filter "publish=8080"
  # 修改 Jenkinsfile 里的 HOST_PORT = '8081'
```

### 构建成功但页面打开空白

```
原因：通常是 SPA 路由问题或 nginx 启动失败
排查：
  docker logs nest-web    # 查看 nginx 日志
  curl http://localhost:8080  # 确认返回了 HTML
nest-web/nginx.conf 已配置 try_files，正常不会有此问题
```

---


## 总结

```
你完成的事情：

Jenkins（Docker 容器）
    ↓  读取 Jenkinsfile
Stage 1: git clone nest-web 代码
    ↓
Stage 2: docker build → nest-web:1 镜像（nginx + dist/）
    ↓
Stage 3: docker run → 容器运行在 localhost:8080
    ↓
浏览器访问 http://localhost:8080 → 看到前端页面
```

### 和公司 Jenkins 的对应关系

| 本地实操 | 公司 Jenkins |
|---------|------------|
| `localhost:9090` | 公司 Jenkins 服务器 |
| GitHub 仓库 | 公司 GitLab 仓库 |
| `localhost:8080` | 生产服务器 IP |
| 手动 Build Now | push 代码自动触发（Webhook） |
| docker run 在本机 | SSH 到目标服务器执行部署 |

**公司的核心流程和你本地实操的完全一样，区别只是把 `localhost` 换成了真实的服务器地址。**

