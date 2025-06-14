// backend/server.ts
process.env.TZ = 'Asia/Taipei';

import { app } from './app';
import { config } from './config/config';
import { logger } from './utils/logger';
import { start as startDataScanScheduler, stop as stopDataScanScheduler } from './schedulers/dataScanScheduler';

const PORT = config.port || 3000;

const server = app.listen(PORT, () => {
  logger.info(`伺服器已啟動：http://localhost:${PORT} (時區: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`); // 另一種檢查方式
  startDataScanScheduler();  // 啟動排程
});

// 優雅關閉 (例如 Ctrl+C)
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  logger.info('收到關閉信號，正在關閉伺服器...');
  stopDataScanScheduler(); // 停掉排程
  server.close(() => {
    logger.info('伺服器已成功關閉');
    process.exit(0);
  });

  // 超過10秒還沒關，就強制關掉
  setTimeout(() => {
    logger.error('強制關閉伺服器');
    process.exit(1);
  }, 10000);
}
