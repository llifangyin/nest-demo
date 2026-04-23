# nestw-web


## 使用 Docker 安装 jenkins
```bash
docker run -d `
  --name jenkins `
  -p 9090:8080 `
  -p 50000:50000 `
  -v jenkins_home:/var/jenkins_home `
  -v /var/run/docker.sock:/var/run/docker.sock `
  jenkins/jenkins:lts-jdk17
```

## Jenkins里安装 Docker CLI

```bash
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


## 初始化密码
### 获取密码
```bash
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
# 在浏览器访问 http://localhost:9090，输入上面获取的密码，完成 Jenkins 的初始设置
```
### 初始设置步骤
1. 粘贴密码，完成初始设置
2. 选择 "Install suggested plugins"，安装推荐插件
3. 创建管理员账号
4. 点击 "New Item"，输入 Job 名称，选择 "Freestyle project"，点击 "OK"
5. 在 "Build" 部分，选择 "Execute shell"，输入以下命令：


##  Docker Pipeline 插件

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

## Jenkinsfile 示例

如nest-web 项目根目录下的 Jenkinsfile


## Jenkins 创建 Pipeline Job
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

## 构建
配置好 Pipeline 后，点击 **Build Now**，Jenkins 会自动拉取代码、构建镜像、运行容器，并把 nest-web 部署到 http://localhost:8080。

## 验证
访问 http://localhost:8080，看到登录页面就说明 Jenkins 自动构建部署成功了。

```powershell
docker ps
# 期望看到：
# jenkins    Up xx hours   0.0.0.0:9090->8080/tcp
# nest-web   Up xx seconds 0.0.0.0:8080->80/tcp
```

## 打通后端 （docker启动后端的话）
```bash
# docker-compose.yml 注释掉前端的web配置，web在jenkins里构建部署
docker compose up -d  
# 把 nest-web 容器也加入同一个网络：
docker network connect nest-demo_nest-network nest-web
# 修改 nest-web/nginx.conf 里 proxy_pass http://backend:3000;
# 重新构建并部署 Jenkins Job，访问 http://localhost:8080/api/users
``` 
## 停止服务
```bash
docker compose down # 停止并删除 nest-demo 的所有容器和网络
docker stop jenkins # 或者 docker rm -f jenkins 强制删除 jenkins 容器
docker rm jenkins # 删除 jenkins 容器后，jenkins_home 卷里的数据还在，如果不需要了，可以删除卷：
docker volume rm jenkins_home # 删除 jenkins_home 卷，注意这会删除 Jenkins 的所有数据，包括配置和构建历史
# 停止nest-web容器
docker stop nest-web
docker rm nest-web

```

