# 常用命令
- 启动容器 docker start nest-mongo
- 停止容器 docker stop nest-mongo
- 删除容器 docker rm nest-mongo


# 重新启动，用环境变量直接初始化 root 用户
-v nest-mongo-data:/data/db 挂载持久化卷，以后重建容器数据不会再丢失。
```bash
docker run -d -p 27017:27017 --name nest-mongo `
  -v nest-mongo-data:/data/db `
  -e MONGO_INITDB_ROOT_USERNAME=admin `
  -e MONGO_INITDB_ROOT_PASSWORD=Password01! `
  mongo:7
```

## 创建用户
登录 MongoDB 容器，创建一个名为 zanyu 的用户，并赋予 nest-demo 数据库的读写权限：
```
use admin
db.createUser({
  user: "zanyu",
  pwd: "Password01!",
  roles: [
    { role: "readWrite", db: "nest-demo" }
  ]
})
```

## 数据库方法
### 用户管理
- 创建用户：db.createUser()
- 删除用户：db.dropUser()
- 修改用户：db.updateUser()
- 查看用户：db.getUsers()

### 数据库管理
- 创建数据库：use <database_name>
- 删除数据库：db.dropDatabase()
- 查看数据库：show dbs
- 切换数据库：use <database_name>
- 查看当前数据库：db.getName()

### 集合管理
- 创建集合：db.createCollection()
- 删除集合：db.collection.drop()
- 查看集合：show collections
- 插入文档：db.collection.insertOne() / db.collection.insertMany()
- 查询文档：db.collection.find()
- 更新文档：db.collection.updateOne() / db.collection.updateMany()
- 删除文档：db.collection.deleteOne() / db.collection.deleteMany()


### 内置库
- admin：管理数据库和用户权限
- local：复制集成员之间的数据同步
- config：分片集群的配置数据
### 常用命令
- 查看当前用户：db.runCommand({ connectionStatus: 1 })
- 查看当前数据库：db.getName()
- 查看当前用户权限：db.runCommand({ usersInfo: 1 })
- 查看当前连接数：db.serverStatus().connections
- 查看当前数据库大小：db.stats()
- 查看当前集合大小：db.collection.stats()
- 查看当前索引：db.collection.getIndexes()
