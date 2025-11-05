import argparse
import subprocess
import os
import shutil
import json
from datetime import datetime
from dateutil.relativedelta import relativedelta

# --- 配置 ---
CONFIG_FILE_PATH = 'config/devices.json'
INFLUXDB_CT_HOST = 'root@192.168.68.101'
LOCAL_TEMP_DIR = 'temp_download'

def download_by_group(group_name):
    """根據指定的組名下載所有儀器上個月的數據"""
    
    print(f"--- 開始處理儀器組: {group_name} ---")

    # 1. 讀取並解析配置文件
    try:
        with open(CONFIG_FILE_PATH, 'r', encoding='utf-8') as f:
            devices_config = json.load(f)
    except FileNotFoundError:
        print(f"錯誤: 配置文件 '{CONFIG_FILE_PATH}' 不存在！")
        return None
    
    # 2. 獲取該組的所有儀器 ID
    device_ids = devices_config.get('groups', {}).get(group_name)
    if not device_ids:
        print(f"錯誤: 在配置文件中找不到名為 '{group_name}' 的儀器組。")
        return None
    
    last_month_str = (datetime.now() - relativedelta(months=1)).strftime('%Y%m')
    print(f"目标月份: {last_month_str}")

    # 4. 準備本地臨時目錄
    if os.path.exists(LOCAL_TEMP_DIR):
        shutil.rmtree(LOCAL_TEMP_DIR)
    os.makedirs(LOCAL_TEMP_DIR)

    # 5. 逐一為組內的每個儀器下載數據
    download_count = 0
    rename_map = {} # 用來存儲原始文件夾名和新文件夾名的映射
    
    for device_id in device_ids:
        device_info = devices_config.get('devices', {}).get(device_id)
        if not device_info:
            print(f"警告: 在配置文件中找不到名為 '{device_id}' 的檔案。")
            continue
            
        remote_path = device_info.get('remote_path')
        folder_name = device_info.get('folder_name', device_id) # 如果沒定義，就用 ID 作為文件夾名
        
        # 將ID和文件夾名添加到映射中
        rename_map[device_id] = folder_name
        
        remote_path_pattern = f"{remote_path}/{last_month_str}*"
        remote_source = f"{INFLUXDB_CT_HOST}:'{remote_path_pattern}'"
        
        # 將數據下載到臨時目錄
        instrument_temp_dir = os.path.join(LOCAL_TEMP_DIR, device_id)
        os.makedirs(instrument_temp_dir, exist_ok=True)
        
        print(f"正在下載 {device_id} 的數據...")
        try:
            subprocess.run(
                f'scp -r {remote_source} {instrument_temp_dir}',
                shell=True, check=True, capture_output=True, text=True
            )
            # 檢查臨時目錄是否為空
            if not any(os.scandir(instrument_temp_dir)):
                print(f"  -> 警告: 找不到 {last_month_str} 月份的數據，移除空文件夾。")
                os.rmdir(instrument_temp_dir)
            else:
                download_count += 1
        except subprocess.CalledProcessError:
            print(f"  -> 找不到 {last_month_str} 月份的數據或下載時發生錯誤。")

    if download_count == 0:
        print("警告: 本次操作未下載任何數據。")
        shutil.rmtree(LOCAL_TEMP_DIR)
        return None

    # 6. 重命名下載的文件
    print("\n--- 開始重命名 ---")
    for original_name, new_name in rename_map.items():
        original_path = os.path.join(LOCAL_TEMP_DIR, original_name)
        new_path = os.path.join(LOCAL_TEMP_DIR, new_name)
        if os.path.exists(original_path):
            print(f"重命名: '{original_name}' -> '{new_name}'")
            os.rename(original_path, new_path)
    
    # 7. 將數據打包成 ZIP 文件
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    zip_filename_base = f"backup_{group_name}_{last_month_str}_{timestamp}"
    zip_filepath = shutil.make_archive(zip_filename_base, 'zip', LOCAL_TEMP_DIR)
    
    print(f"--- 成功將 {download_count} 個儀器的數據打包為: {zip_filepath} ---")
    
    # 8. 清理臨時目錄
    shutil.rmtree(LOCAL_TEMP_DIR)
    return zip_filepath

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='根據指定的儀器組下載並打包上個月的備份數據。')
    parser.add_argument('group_name', type=str, help='要下載的儀器組名 (例如 "T8-WISE")')
    args = parser.parse_args()
    
    final_zip_file = download_by_group(args.group_name)
    
    if final_zip_file:
        with open(os.environ['GITHUB_OUTPUT'], 'a') as hf:
            print(f'zip_filename={final_zip_file}', file=hf)