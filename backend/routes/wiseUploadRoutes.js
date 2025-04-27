// routes/wiseUploadRoutes.js

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const router = express.Router();
const { DATA_DIR } = require('../config/config');
const logger = require('../utils/logger');

/**
 * 上傳 Wise 模組的日誌資料
 * 支援:
 *  - POST /upload_log/:macAddress/signal_log/:date/:filename
 *  - POST /upload_log/:macAddress/system_log/:date/:filename
 */
router.post('/:macAddress/:logType/:date/:filename', async (req, res) => {
  try {
    const { macAddress, logType, date, filename } = req.params;

    // 確認 logType 合法
    if (logType !== 'signal_log' && logType !== 'system_log') {
      return res.status(400).json({ error: '不支援的logType，必須是 signal_log 或 system_log' });
    }

    // 解析 body (WISE 上傳的是 raw buffer)
    if (!req.body || !Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: '無效的請求內容，必須是檔案或文字' });
    }
    const bodyText = req.body.toString('utf8');  // 把 buffer 轉成 UTF-8 字串

    // 組成存檔路徑
    const saveDir = path.join(DATA_DIR, cleanMac, logType, date);
    const savePath = path.join(saveDir, filename);

    // 確保資料夾存在
    await fs.ensureDir(saveDir);

    // 檢查是否有同名檔案，若有自動改名
    const finalPath = await getUniqueFileName(savePath);

    // 寫入檔案
    await fs.writeFile(finalPath, bodyText);

    logger.info(`已收到並儲存檔案: ${finalPath}`);
    res.json({ success: true });
  } catch (error) {
    logger.error(`儲存上傳檔案錯誤: ${error.message}`);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

/**
 * 如果檔案已存在，自動加上 (1)、(2)...
 * @param {string} filePath - 原本的路徑
 * @returns {Promise<string>} - 可用的新路徑
 */
async function getUniqueFileName(filePath) {
  let newPath = filePath;
  let count = 1;

  while (await fs.pathExists(newPath)) {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    newPath = path.join(dir, `${base} (${count})${ext}`);
    count++;
  }

  return newPath;
}

module.exports = router;
