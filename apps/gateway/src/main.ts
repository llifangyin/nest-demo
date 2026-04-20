import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { GatewayModule } from './gateway.module';
import { FileLogger } from './logger/file-logger';

async function bootstrap() {
  const logger = new FileLogger();
  const app = await NestFactory.create(GatewayModule, { logger });
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  const port = process.env.port ?? 3000;
  await app.listen(port);

  const blue  = '\x1b[34m';
  const cyan  = '\x1b[36m';
  const gold  = '\x1b[33m';
  const reset = '\x1b[0m';
  const bold  = '\x1b[1m';

  console.log(`
${blue}${bold}╔════════════════════════════════════════╗
║          API GATEWAY  ONLINE           ║
╚════════════════════════════════════════╝${reset}
${cyan}  ► HTTP   : http://localhost:${port}
  ► 模式    : JWT 鉴权 + 限流 + 健康检查
  ► 健康检查: http://localhost:${port}/health${reset}
`);

  console.log(`${gold}${bold}
                       _ooOoo_
                      o8888888o
                      88" . "88
                      (| -_- |)
                      O\\  =  /O
                   ____/\`---'\\____
                 .'  \\|     |//  \`.
                /  \\|||  :  |||//  \\
               /  _||||| -:- |||||-  \\
               |   | \\\\  -  /// |   |
               | \\_|  ''\`---/''  |   |
               \\  .-\\__  \`-\`  ___/-. /
             ___\`. .'  /--.--\\  \`. . __
          ."" '<  \`.___\\_<|>_/___.'  >'""
         | | :  \`- \\\`\`;\`\\ _ /\`;\`/ - \` : | |
         \\  \\ \`-.   \\_ __\\ /__ _/   .-\` /  /
    ======\`-.____\`-.___\\_____/___.-\`____.-'======
                       \`=---='

    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         如来佛祖保佑       永不宕机      永无BUG${reset}
`);
}
bootstrap();
