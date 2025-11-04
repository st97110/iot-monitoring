import argparse
import subprocess
import os
import shutil
import json
from datetime import datetime
from dateutil.relativedelta import relativedelta

# --- 配置 ---
CONFIG_FILE_PATH = 'config/devices.json' # 指向新的配置文件
INFLUXDB_CT_HOST = 'root@192.168.68.101'
LOCAL_TEMP_DIR = 'temp_download'

def download_by_group(group_name):
    """根據指定的組名下載所有儀器上個月的數據"""
    
    print(f"--- 開始處理儀器組: {group_name} ---")

    # 1. 讀取並解析配置文件
    try:
        with open(CONFIG_FILE_PATH, 'r', encoding='utf-8') as f:
            config_data = json.load(f)
    except FileNotFoundError:
        print(f"錯誤: 配置文件 '{CONFIG_FILE_PATH}' 不存在！")
        return None
    
    # 2. 獲取該組的所有儀器 ID
    device_ids = config_data.get('groups', {}).get(group_name)
    if not device_ids:
        print(f"錯誤: 在配置文件中找不到名為 '{group_name}' 的儀器組。")
        return None
    
    print(f"找到儀器組 '{group_name}' 中的 {len(device_ids)} 個設備。")

    # 3. 計算上個月的年份和月份
    last_month_str = (datetime.now() - relativedelta(months=1)).strftime('%Y%m')
    print(f"目標月份: {last_month_str}")

    # 4. 準備本地臨時目錄
    if os.path.exists(LOCAL_TEMP_DIR):
        shutil.rmtree(LOCAL_TEMP_DIR)
    os.makedirs(LOCAL_TEMP_DIR)

    # 5. 逐一為組內的每個儀器下載數據
    download_count = 0
    for device_id in device_ids:
        device_info = config_data.get('devices', {}).get(device_id)
        if not device_info or 'remote_path' not in device_info:
            print(f"警告: 找不到設備 ID '{device_id}' 的詳細資訊或遠程路徑，已跳過。")
            continue
            
        # 構建遠程路徑模式，例如：/srv/.../WISE-XXXX/{last_month_str}*
        remote_path = device_info['remote_path']
        remote_path_pattern = f"{remote_path}/{last_month_str}*"
        
        remote_source = f"{INFLUXDB_CT_HOST}:'{remote_path_pattern}'"
        # 我們將數據下載到以設備ID命名的子目錄中，以防日期資料夾名稱重複
        local_destination_folder = os.path.join(LOCAL_TEMP_DIR, device_id)
        os.makedirs(local_destination_folder, exist_ok=True)
        
        print(f"正在下載 {device_id} 的數據...")
        try:
            subprocess.run(
                f'scp -r {remote_source} {local_destination_folder}',
                shell=True, check=True, capture_output=True, text=True
            )
            download_count += 1
        except subprocess.CalledProcessError as e:
            if "No such file or directory" in e.stderr:
                print(f"  -> 在 {device_id} 的路徑下找不到 {last_month_str} 月份的數據。")
            else:
                print(f"  -> 下載 {device_id} 的數據時出錯: {e.stderr}")
    
    # 6. 檢查是否有檔案被下載
    if download_count == 0:
        print("警告: 本次操作沒有成功下載任何儀器的數據。")
        return None

    # 7. 將下載的檔案打包成 zip
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