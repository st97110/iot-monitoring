import fs from 'fs-extra';
import path from 'path';

/**
 * 上傳 Wise 模組的日誌資料
 * 支援:
 *  - POST /upload_log/:macAddress/signal_log/:date/:filename
 *  - POST /upload_log/:macAddress/system_log/:date/:filename
 */
export async function saveWiseLogFile(directory: string, filename: string, buffer: Buffer): Promise<void> {
  await fs.ensureDir(directory);

  const fullPath = path.join(directory, filename);
  const finalPath = await getUniqueFileName(fullPath);

  await fs.writeFile(finalPath, buffer.toString('utf8'), 'utf8');
}

/**
 * 如果檔案已存在，自動加上 (1)、(2)...
 * @param {string} filePath - 原本的路徑
 * @returns {Promise<string>} - 可用的新路徑
 */
async function getUniqueFileName(filePath: string): Promise<string> {
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
