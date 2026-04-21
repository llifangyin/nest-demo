# RabbitMQ 消息队列

> RabbitMQ 是一个消息队列中间件，让两个服务之间不直接调用，而是通过发消息的方式来通信，发完就走，不等对方处理完。

---

## 一、为什么需要消息队列

```
没有消息队列：                    有了消息队列：

用户注册                          用户注册
   ↓                                ↓
发欢迎邮件（等待...）              把"发邮件"消息丢进队列
发短信（等待...）                  立即返回"注册成功" ✅
发优惠券（等待...）
积分系统（等待...）                 队列里：
                                   [发邮件] [发短信] [发优惠券] [积分]
5秒后才返回"注册成功"                  ↓
                                   各自慢慢处理，不影响用户
```

| 场景 | 类比 | 说明 |
|---|---|---|
| 现实 | 快递站 | 把包裹放快递站，快递员来取 |
| 餐厅 | 点餐系统 | 顾客点餐后，订单进入厨房队列，厨师按顺序做菜 |
| 技术 | 异步任务队列 | 生产者发消息，消费者处理，解耦、削峰、异步 |

---
### 常用的消息队列中间件
 Kafka、RocketMQ、ActiveMQ 等，RabbitMQ 是其中最流行的一个，基于 AMQP 协议，功能强大，社区活跃，适合各种场景。
对比：
| 消息队列 | 适用场景 | 优点 | 缺点 |
|---|---|---|---|
| RabbitMQ | 适合需要复杂路由、可靠投递的场景 | 功能丰富，支持多种交换机类型，社区活跃 | 性能相对 Kafka 较低 |
| Kafka | 适合大数据流处理、日志收集等场景 | 高吞吐量，持久化性能好 | 不支持复杂路由，学习曲线较陡 |
| RocketMQ | 适合大规模分布式消息传递 | 高可靠性，支持顺序消息 | 社区相对较小，学习成本较高 |
| ActiveMQ | 适合企业级应用 | 功能全面，支持多种协议 | 性能相对较低，配置复杂 |

### 常用的应用场景：
- **异步处理**：用户注册后发邮件、生成报告等耗时操作
- **削峰填谷**：高峰期请求过多时，先入队列，慢慢处理，避免服务器过载
- **系统解耦**：生产者和消费者不直接调用，降低耦合度，方便维护和扩展
- **分布式系统**：跨服务通信，消息队列作为中间层


## 二、核心概念

| 概念 | 说明 |
|---|---|
| **Producer（生产者）** | 发送消息的服务，把消息推入队列 |
| **Queue（队列）** | 存储消息的容器，先进先出 |
| **Broker（消息代理）** | RabbitMQ 本身，负责接收、存储、转发消息 |
| **Consumer（消费者）** | 从队列取消息并处理的服务 |
| **Exchange（交换机）** | 接收生产者消息，按规则决定投递到哪个队列 |
| **Binding（绑定）** | 交换机和队列之间的路由规则 |
| **Routing Key（路由键）** | 生产者发消息时带的标签，用于匹配 Binding |

**完整流程：**
```
Producer → Exchange → Binding（routing key 匹配）→ Queue → Consumer
发消息   → 交换机  → 路由规则                    → 队列  → 处理消息
```

---

## 三、Exchange 类型

### 1. Direct Exchange（直连交换机）
根据 routing key 精确匹配，点对点通信。

```
Producer
  ├── routing key: "email"  →  邮件队列  →  发邮件 Consumer
  └── routing key: "sms"    →  短信队列  →  发短信 Consumer
```

### 2. Fanout Exchange（广播交换机）
忽略 routing key，消息广播到所有绑定队列。

```
Producer → Exchange
              ├──→ 邮件队列
              ├──→ 短信队列
              └──→ 优惠券队列
```

### 3. Topic Exchange（主题交换机）
routing key 支持通配符匹配，按类别分发。
- `*` 匹配一个单词
- `#` 匹配零或多个单词

```
routing key: "user.created"    → 匹配 "user.*"  → 用户服务队列
routing key: "order.paid"      → 匹配 "order.#" → 订单服务队列
routing key: "user.email.sent" → 匹配 "#"       → 日志队列
```

### 4. Headers Exchange（头交换机）
根据消息 Header 属性路由，不依赖 routing key，较少使用。

---

## 四、安装 RabbitMQ（Docker）

```bash
# 启动 RabbitMQ，15672 是管理后台端口，5672 是消息端口
docker run -d --name nest-rabbitmq -p 5672:5672 -p 15672:15672 -e RABBITMQ_DEFAULT_USER=admin -e RABBITMQ_DEFAULT_PASS='Password01!' rabbitmq:3-management

# 访问管理后台：http://localhost:15672
# 账号：admin  密码：Password01!
```

---

## 五、NestJS 集成步骤

### 5.1 安装依赖

```bash
npm install @nestjs/microservices amqplib amqp-connection-manager
npm install -D @types/amqplib
```

### 5.2 .env 配置

```dotenv
RABBITMQ_URL=amqp://admin:Password01!@localhost:5672
```

### 5.3 目录结构

```
src/
├── export/
│   ├── export.module.ts       ← 导出功能模块
│   ├── export.controller.ts   ← POST /export/users（触发导出）
│   │                             GET  /export/status/:taskId（查询状态）
│   │                             GET  /export/download/:taskId（下载文件）
│   ├── export.service.ts      ← 生产者：创建任务、发消息到队列
                                triggerExport() 创建任务记录，发消息到 RabbitMQ 队列 （this.client.emit）
│   ├── export.processor.ts    ← 消费者：监听队列、生成 CSV 文件
                                  @EventPattern('export_user') 监听队列
                                  handleExportUsers() 处理消息生成文件
│   └── schemas/
│       └── export-task.schema.ts ← MongoDB 任务状态记录
```

### 5.4 注册 RabbitMQ 客户端（AppModule）

```typescript
// app.module.ts
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    // ... 其他模块
    ClientsModule.registerAsync([
      {
        name: 'EXPORT_SERVICE',   // 注入 token，用于在 Service 里 @Inject('EXPORT_SERVICE')
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.get<string>('RABBITMQ_URL')!],
            queue: 'export_queue',   // 队列名
            queueOptions: { durable: true },  // durable: true 表示 RabbitMQ 重启后队列不丢失
          },
        }),
      },
    ]),
    ExportModule,
  ],
})
export class AppModule {}
```

### 5.5 任务状态 Schema（MongoDB 记录任务进度）

```typescript
// export/schemas/export-task.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type ExportTaskStatus = 'pending' | 'processing' | 'done' | 'failed';

@Schema({ timestamps: true })
export class ExportTask {
  @Prop({ required: true })
  taskId: string;        // 唯一任务 ID，返回给前端轮询用

  @Prop({ default: 'pending' })
  status: ExportTaskStatus;

  @Prop()
  filePath?: string;     // 文件生成后存储路径

  @Prop()
  errorMsg?: string;     // 失败原因
}

export const ExportTaskSchema = SchemaFactory.createForClass(ExportTask);
```

### 5.6 生产者 Service（触发导出）

```typescript
// export/export.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { ExportTask } from './schemas/export-task.schema';

@Injectable()
export class ExportService {
  constructor(
    @Inject('EXPORT_SERVICE') private readonly client: ClientProxy,
    @InjectModel(ExportTask.name) private taskModel: Model<ExportTask>,
  ) {}

  async triggerExport(filter: { name?: string; email?: string }) {
    const taskId = uuidv4();  // 生成唯一任务 ID

    // 1. 先在数据库创建一条 pending 状态的任务记录
    await this.taskModel.create({ taskId, status: 'pending' });

    // 2. 把消息发到 RabbitMQ 队列（发完立即返回，不等处理完）
    //    emit = 发了不管，send = 发了等回复（RPC 模式）
    this.client.emit('export_users', { taskId, filter });

    // 3. 立即把 taskId 返回给前端，前端用它轮询状态
    return { taskId, message: '导出任务已创建，请稍后查询结果' };
  }

  async getTaskStatus(taskId: string) {
    return this.taskModel.findOne({ taskId });
  }
}
```

### 5.7 消费者 Processor（处理消息、生成文件）

```typescript
// export/export.processor.ts
import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { ExportTask } from './schemas/export-task.schema';
import { UserDao } from '../users/dao/user.dao';

@Controller()
export class ExportProcessor {
  constructor(
    @InjectModel(ExportTask.name) private taskModel: Model<ExportTask>,
    private readonly userDao: UserDao,
  ) {}

  // @EventPattern 监听 'export_users' 这个事件（对应生产者 emit 的名字）
  @EventPattern('export_users')
  async handleExportUsers(
    @Payload() data: { taskId: string; filter: { name?: string; email?: string } },
  ) {
    const { taskId, filter } = data;

    // 1. 更新任务状态为 processing
    await this.taskModel.updateOne({ taskId }, { status: 'processing' });

    try {
      // 2. 查询数据库
      const users = await this.userDao.findAll(filter);

      // 3. 生成 CSV 文件
      const csvRows = [
        'name,email,createdAt',   // 表头
        ...users.map((u: any) =>
          `${u.name},${u.email},${u.createdAt}`,
        ),
      ];
      const csvContent = csvRows.join('\n');

      // 4. 写入文件（生产环境应用 OSS/S3，这里用本地文件演示）
      const fileName = `export_${taskId}.csv`;
      const filePath = path.join(process.cwd(), 'exports', fileName);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, csvContent, 'utf-8');

      // 5. 更新任务状态为 done，记录文件路径
      await this.taskModel.updateOne({ taskId }, { status: 'done', filePath });
    } catch (err) {
      // 6. 失败时更新状态为 failed
      await this.taskModel.updateOne({
        taskId,
      }, {
        status: 'failed',
        errorMsg: (err as Error).message,
      });
    }
  }
}
```

### 5.8 Controller（接收前端请求）

```typescript
// export/export.controller.ts
import { Controller, Get, Post, Body, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import { ExportService } from './export.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  // 触发导出任务，立即返回 taskId
  @Post('users')
  triggerExport(@Body() filter: { name?: string; email?: string }) {
    return this.exportService.triggerExport(filter);
  }

  // 前端轮询：查询任务状态
  @Get('status/:taskId')
  getStatus(@Param('taskId') taskId: string) {
    return this.exportService.getTaskStatus(taskId);
  }

  // 下载文件（任务 status === 'done' 后才能调用）
  @Get('download/:taskId')
  async download(@Param('taskId') taskId: string, @Res() res: Response) {
    const task = await this.exportService.getTaskStatus(taskId);
    if (!task || task.status !== 'done' || !task.filePath) {
      return res.status(404).json({ message: '文件不存在或尚未生成' });
    }
    const fileName = path.basename(task.filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'text/csv');
    res.sendFile(task.filePath);
  }
}
```

### 5.9 ExportModule

```typescript
// export/export.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { ExportProcessor } from './export.processor';
import { ExportTask, ExportTaskSchema } from './schemas/export-task.schema';
import { UsersModule } from '../users/users.modules';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ExportTask.name, schema: ExportTaskSchema }]),
    UsersModule,  // 引入 UsersModule，以便 ExportProcessor 使用 UserDao
  ],
  controllers: [ExportController, ExportProcessor],
  providers: [ExportService],
})
export class ExportModule {}
```

### 5.10 启用微服务监听（main.ts）

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 连接 RabbitMQ 微服务（消费者监听）
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL ?? 'amqp://admin:Password01!@localhost:5672'],
      queue: 'export_queue',
      queueOptions: { durable: true },
    },
  });

  await app.startAllMicroservices();   // 先启动微服务监听
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

---

## 六、前端集成步骤

### 6.1 添加导出 API（services/export/ExportController.ts）

```typescript
import { request } from '@umijs/max';

export interface ExportTask {
  taskId: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  filePath?: string;
  errorMsg?: string;
}

// 触发导出，返回 taskId
export function triggerExport(filter?: { name?: string; email?: string }) {
  return request<{ taskId: string; message: string }>('/proxy/export/users', {
    method: 'POST',
    data: filter ?? {},
  });
}

// 查询任务状态
export function getExportStatus(taskId: string) {
  return request<ExportTask>(`/proxy/export/status/${taskId}`, {
    method: 'GET',
  });
}

// 下载文件（直接用 window.open 打开下载链接）
export function downloadExport(taskId: string) {
  window.open(`/proxy/export/download/${taskId}`);
}
```

### 6.2 用户列表页添加导出按钮（关键代码片段）

```tsx
// pages/User/index.tsx 关键部分
import { triggerExport, getExportStatus, downloadExport } from '@/services/export/ExportController';
import { useState, useRef } from 'react';

// 组件内：
const [exporting, setExporting] = useState(false);

const handleExport = async () => {
  setExporting(true);
  const { taskId } = await triggerExport();  // 1. 触发导出，拿到 taskId
  message.info('导出任务已创建，正在处理...');

  // 2. 轮询状态，每 2 秒查一次，最多等 60 秒
  const timer = setInterval(async () => {
    const task = await getExportStatus(taskId);

    if (task.status === 'done') {
      clearInterval(timer);
      setExporting(false);
      message.success('导出成功，即将下载');
      downloadExport(taskId);   // 3. 触发浏览器下载

    } else if (task.status === 'failed') {
      clearInterval(timer);
      setExporting(false);
      message.error(`导出失败：${task.errorMsg}`);
    }
  }, 2000);

  // 超时保护
  setTimeout(() => {
    clearInterval(timer);
    setExporting(false);
  }, 60000);
};

// ProTable 工具栏按钮：
toolBarRender={() => [
  <Button
    key="export"
    loading={exporting}
    onClick={handleExport}
  >
    导出 CSV
  </Button>,
]}
```

---

## 七、完整流程图

```
前端点击"导出 CSV"
        ↓
POST /export/users  →  ExportService.triggerExport()
        ↓                      ↓
  返回 { taskId }         1. MongoDB 创建 pending 任务
        ↓                 2. emit('export_users', { taskId, filter }) → RabbitMQ 队列
前端每 2 秒轮询                ↓
GET /export/status/:taskId   ExportProcessor.handleExportUsers()（消费者）
        ↓                      ↓
  status: pending/processing  1. 更新状态 → processing
        ↓                 2. 查数据库 → 生成 CSV 文件
  status: done            3. 更新状态 → done，记录 filePath
        ↓
GET /export/download/:taskId
        ↓
  浏览器下载 CSV 文件 ✅
```

---

## 八、与其他方案的对比

| 方案 | 优点 | 缺点 | 适用场景 |
|---|---|---|---|
| 直接同步导出 | 简单，不需要额外组件 | 数据量大时请求超时，阻塞服务器 | 数据量 < 1000 条 |
| **RabbitMQ 异步导出** | 不阻塞、可重试、可扩展 | 需要轮询，引入新组件 | 数据量大，耗时操作 |
| WebSocket 推送 | 实时通知，不需要轮询 | 实现复杂 | 配合 RabbitMQ 使用 |
| SSE（Server-Sent Events） | 服务端主动推送 | 单向通信 | 进度条场景 |

---

## 九、注意事项

1. **消息幂等性**：消费者可能收到重复消息（网络异常时 RabbitMQ 会重投递），处理前先检查 taskId 是否已处理。
2. **消息持久化**：队列和消息都要设置 `durable: true`，防止 RabbitMQ 重启丢消息。
3. **死信队列（DLQ）**：配置死信队列接收处理失败的消息，方便排查问题。
4. **文件存储**：生产环境不要存本地文件，应使用 OSS/S3，避免多实例部署时找不到文件。
5. **任务清理**：定时删除过期的导出文件和任务记录，防止磁盘占满。



