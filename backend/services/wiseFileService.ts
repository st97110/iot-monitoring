// backend/services/wiseFileService.ts
import fs from 'fs-extra';
import path from 'path';

/**
 * 儲存上傳的 Wise CSV 檔案
 * 支援:
 *  - POST /upload_log/:macAddress/signal_log/:date/:filename
 *  - POST /upload_log/:macAddress/system_log/:date/:filename
 * @param directory 儲存目錄
 * @param filename 檔案名稱
 * @param buffer 檔案內容
 */
export async function saveWiseLogFile(directory: string, filename: string, buffer: Buffer): Promise<void> {
  await fs.ensureDir(directory);

  const fullPath = path.join(directory, filename);
  const finalPath = await getUniqueFileName(fullPath);

  await fs.writeFile(finalPath, buffer.toString('utf8'), 'utf8');
}

/**
 * 搬移 CSV 檔案到裝置的 write 資料夾
 * @param originalPath 原始檔案路徑
 * @param deviceDir 裝置資料夾路徑（ex: upload_log/WISE-xxx）
 */
export async function moveCsvAfterWrite(originalPath: string, deviceDir: string): Promise<void> {
  const writeDir = path.join(deviceDir, 'write');
  await fs.ensureDir(writeDir);

  const filename = path.basename(originalPath);
  const targetPath = path.join(writeDir, filename);

  const finalTargetPath = await getUniqueFileName(targetPath);

  await fs.move(originalPath, finalTargetPath, { overwrite: false });
}

/**
 * 防止檔名衝突，自動加 (1)、(2) 等
 * @param filePath - 原本的路徑
 * @returns - 可用的新路徑
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
