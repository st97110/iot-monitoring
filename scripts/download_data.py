import argparse
import csv
import json
import os
import shutil
import subprocess
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo

from dateutil.relativedelta import relativedelta

# --- Config ---
CONFIG_FILE_PATH = "scripts/devices.json"
INFLUXDB_CT_HOST = "root@192.168.68.101"
LOCAL_TEMP_DIR = "temp_download"
DEFAULT_TIMEZONE = "Asia/Taipei"

DB_ONLY_STORAGE_VALUES = {"db_only", "influxdb", "database"}
INFLUX_REQUIRED_ENV_VARS = (
    "INFLUX_URL",
    "INFLUX_ORG",
    "INFLUX_TOKEN_WISE",
    "INFLUX_BUCKET_WISE",
)


def normalize_storage(device_info: Dict[str, Any]) -> str:
    return str(device_info.get("storage", "file")).strip().lower()


def is_db_only_device(device_info: Dict[str, Any]) -> bool:
    return normalize_storage(device_info) in DB_ONLY_STORAGE_VALUES


def load_devices_config() -> Dict[str, Any]:
    with open(CONFIG_FILE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_timezone() -> ZoneInfo:
    tz_name = os.environ.get("TZ", DEFAULT_TIMEZONE)
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo(DEFAULT_TIMEZONE)


def get_last_month_window(timezone: ZoneInfo) -> Tuple[str, str, str]:
    now = datetime.now(timezone)
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_start = current_month_start - relativedelta(months=1)
    return (
        last_month_start.strftime("%Y%m"),
        last_month_start.isoformat(),
        current_month_start.isoformat(),
    )


def ensure_clean_temp_dir() -> None:
    if os.path.exists(LOCAL_TEMP_DIR):
        shutil.rmtree(LOCAL_TEMP_DIR)
    os.makedirs(LOCAL_TEMP_DIR)


def ensure_influx_env() -> Dict[str, str]:
    missing = [name for name in INFLUX_REQUIRED_ENV_VARS if not os.environ.get(name)]
    if missing:
        joined = ", ".join(missing)
        raise RuntimeError(
            f"Missing required Influx env vars for DB-only devices: {joined}"
        )

    return {
        "url": os.environ["INFLUX_URL"],
        "org": os.environ["INFLUX_ORG"],
        "token": os.environ["INFLUX_TOKEN_WISE"],
        "bucket": os.environ["INFLUX_BUCKET_WISE"],
    }


def flux_escape(value: Any) -> str:
    return str(value).replace("\\", "\\\\").replace('"', '\\"')


def build_flux_query(
    bucket: str,
    measurement: str,
    start_iso: str,
    stop_iso: str,
    tag_filters: Dict[str, Any],
    fields: Optional[Iterable[str]] = None,
) -> str:
    lines = [
        f'from(bucket: "{flux_escape(bucket)}")',
        f'  |> range(start: time(v: "{flux_escape(start_iso)}"), stop: time(v: "{flux_escape(stop_iso)}"))',
        f'  |> filter(fn: (r) => r._measurement == "{flux_escape(measurement)}")',
    ]

    for tag_key, tag_val in tag_filters.items():
        lines.append(
            f'  |> filter(fn: (r) => r["{flux_escape(tag_key)}"] == "{flux_escape(tag_val)}")'
        )

    if fields:
        field_conditions = " or ".join(
            [f'r._field == "{flux_escape(field)}"' for field in fields]
        )
        lines.append(f"  |> filter(fn: (r) => {field_conditions})")

    lines.append('  |> sort(columns: ["_time"], desc: false)')
    return "\n".join(lines)


def to_serializable_row(record_values: Dict[str, Any]) -> Dict[str, Any]:
    row: Dict[str, Any] = {}
    for key, value in record_values.items():
        if key in {"result", "table"}:
            continue
        if hasattr(value, "isoformat"):
            row[key] = value.isoformat()
        else:
            row[key] = value
    return row


def write_raw_csv(csv_path: str, rows: List[Dict[str, Any]]) -> None:
    preferred = [
        "_time",
        "_measurement",
        "_field",
        "_value",
        "device",
        "device_sn",
        "channel",
        "topic_name",
    ]

    all_keys = set()
    for row in rows:
        all_keys.update(row.keys())

    ordered_keys = [key for key in preferred if key in all_keys]
    ordered_keys.extend(sorted(all_keys - set(ordered_keys)))

    os.makedirs(os.path.dirname(csv_path), exist_ok=True)
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=ordered_keys, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def collect_source_csv_files(device_root: str, exclude_file_abs_path: str) -> List[str]:
    source_files: List[str] = []
    for root, _, files in os.walk(device_root):
        for filename in files:
            if not filename.lower().endswith(".csv"):
                continue

            full_path = os.path.join(root, filename)
            if os.path.abspath(full_path) == exclude_file_abs_path:
                continue

            source_files.append(full_path)

    source_files.sort()
    return source_files


def merge_csv_files(source_files: List[str], output_file: str) -> Tuple[bool, int]:
    header_written = False
    data_line_count = 0

    with open(output_file, "w", encoding="utf-8-sig", newline="") as out_f:
        for source in source_files:
            with open(source, "r", encoding="utf-8-sig", errors="ignore") as in_f:
                is_first_line = True
                for raw_line in in_f:
                    line = raw_line.rstrip("\r\n")
                    if not line:
                        continue

                    if is_first_line:
                        is_first_line = False
                        if not header_written:
                            out_f.write(f"{line}\n")
                            header_written = True
                        continue

                    out_f.write(f"{line}\n")
                    data_line_count += 1

    return header_written, data_line_count


def aggregate_file_device_to_monthly_csv(
    device_root: str,
    last_month_str: str,
    timezone: ZoneInfo,
) -> Optional[str]:
    _ = timezone
    output_path = os.path.join(device_root, f"{last_month_str}.csv")
    output_abs_path = os.path.abspath(output_path)
    source_files = collect_source_csv_files(device_root, output_abs_path)

    if not source_files and os.path.isfile(output_path):
        print(
            f"  -> Monthly CSV already present, skip aggregation: "
            f"{os.path.basename(output_path)}"
        )
        return output_path

    if not source_files:
        return None

    success, data_lines = merge_csv_files(source_files, output_path)
    if not success:
        return None

    print(
        f"  -> Aggregated monthly: {len(source_files)} files -> "
        f"{os.path.basename(output_path)} ({data_lines} rows)"
    )

    for entry in os.listdir(device_root):
        entry_path = os.path.join(device_root, entry)
        abs_entry_path = os.path.abspath(entry_path)

        if abs_entry_path == output_abs_path:
            continue
        if os.path.isdir(entry_path):
            shutil.rmtree(entry_path)
        else:
            os.remove(entry_path)

    return output_path


def export_db_only_device(
    device_id: str,
    device_info: Dict[str, Any],
    last_month_str: str,
    start_iso: str,
    stop_iso: str,
    query_api: Any,
    influx_org: str,
    default_bucket: str,
) -> bool:
    influx_cfg = device_info.get("influx")
    if not isinstance(influx_cfg, dict):
        raise RuntimeError(f"{device_id} is db_only but missing `influx` config.")

    measurement = str(influx_cfg.get("measurement", "wise_raw"))
    tag_filters = influx_cfg.get("tag_filters")
    if not isinstance(tag_filters, dict) or not tag_filters:
        raise RuntimeError(
            f"{device_id} is db_only but missing valid `influx.tag_filters`."
        )

    fields = influx_cfg.get("fields")
    if fields is not None and not isinstance(fields, list):
        raise RuntimeError(f"{device_id} `influx.fields` must be an array if provided.")

    bucket = str(influx_cfg.get("bucket", default_bucket))
    folder_name = str(device_info.get("folder_name", device_id))

    flux_query = build_flux_query(
        bucket=bucket,
        measurement=measurement,
        start_iso=start_iso,
        stop_iso=stop_iso,
        tag_filters=tag_filters,
        fields=fields,
    )

    print(f"Exporting DB-only device {device_id} from InfluxDB...")
    records = list(query_api.query_stream(query=flux_query, org=influx_org))
    if not records:
        print(f"  -> No DB records found for {device_id} in {last_month_str}.")
        return False

    rows = [to_serializable_row(record.values) for record in records]
    rows.sort(key=lambda row: str(row.get("_time", "")))

    device_folder = os.path.join(LOCAL_TEMP_DIR, folder_name)
    output_path = os.path.join(device_folder, f"{last_month_str}.csv")
    write_raw_csv(output_path, rows)
    print(
        f"  -> DB export written for {device_id}: "
        f"{os.path.basename(output_path)} ({len(rows)} rows)."
    )
    return True


def download_file_device(
    device_id: str,
    device_info: Dict[str, Any],
    last_month_str: str,
    timezone: ZoneInfo,
) -> bool:
    remote_path = device_info.get("remote_path")
    if not remote_path:
        print(f"Skip {device_id}: file-type device missing remote_path.")
        return False

    folder_name = str(device_info.get("folder_name", device_id))
    remote_path_pattern = f"{remote_path}/{last_month_str}*"
    remote_source = f"{INFLUXDB_CT_HOST}:{remote_path_pattern}"
    local_target_dir = os.path.join(LOCAL_TEMP_DIR, folder_name)
    os.makedirs(local_target_dir, exist_ok=True)

    print(f"Downloading file device {device_id}...")
    try:
        subprocess.run(
            ["scp", "-r", remote_source, local_target_dir],
            shell=False,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        stderr = (e.stderr or "").strip()
        print(f"  -> Download failed for {device_id}. {stderr}")
        return False

    if not any(os.scandir(local_target_dir)):
        print(f"  -> No file data for {device_id} in {last_month_str}.")
        os.rmdir(local_target_dir)
        return False

    monthly_output_path = aggregate_file_device_to_monthly_csv(
        local_target_dir, last_month_str, timezone
    )
    if not monthly_output_path:
        print(f"  -> No aggregated monthly CSV produced for {device_id}.")
        shutil.rmtree(local_target_dir, ignore_errors=True)
        return False

    return True


def download_by_group(group_name: str) -> Optional[str]:
    print(f"--- Start processing group: {group_name} ---")

    try:
        devices_config = load_devices_config()
    except FileNotFoundError:
        print(f"Error: config file '{CONFIG_FILE_PATH}' not found.")
        return None

    device_ids = devices_config.get("groups", {}).get(group_name)
    if not device_ids:
        print(f"Error: group '{group_name}' not found in config.")
        return None

    timezone = get_timezone()
    last_month_str, start_iso, stop_iso = get_last_month_window(timezone)
    print(f"Target month: {last_month_str} ({start_iso} -> {stop_iso})")

    resolved_devices: List[Tuple[str, Dict[str, Any]]] = []
    db_only_devices: List[str] = []

    for device_id in device_ids:
        device_info = devices_config.get("devices", {}).get(device_id)
        if not device_info:
            print(f"Warning: device '{device_id}' not found in config, skip.")
            continue
        resolved_devices.append((device_id, device_info))
        if is_db_only_device(device_info):
            db_only_devices.append(device_id)

    influx_client = None
    query_api = None
    influx_org = ""
    influx_bucket = ""

    if db_only_devices:
        influx_settings = ensure_influx_env()
        try:
            from influxdb_client import InfluxDBClient
        except ImportError as e:
            raise RuntimeError(
                "influxdb-client is required for DB-only export. "
                "Install with: pip install influxdb-client"
            ) from e

        influx_org = influx_settings["org"]
        influx_bucket = influx_settings["bucket"]
        influx_client = InfluxDBClient(
            url=influx_settings["url"],
            token=influx_settings["token"],
            org=influx_org,
        )
        query_api = influx_client.query_api()

    ensure_clean_temp_dir()

    file_success_count = 0
    db_success_count = 0

    try:
        for device_id, device_info in resolved_devices:
            if is_db_only_device(device_info):
                try:
                    success = export_db_only_device(
                        device_id=device_id,
                        device_info=device_info,
                        last_month_str=last_month_str,
                        start_iso=start_iso,
                        stop_iso=stop_iso,
                        query_api=query_api,
                        influx_org=influx_org,
                        default_bucket=influx_bucket,
                    )
                    if success:
                        db_success_count += 1
                except Exception as e:
                    print(f"  -> DB export failed for {device_id}: {e}")
                continue

            success = download_file_device(
                device_id=device_id,
                device_info=device_info,
                last_month_str=last_month_str,
                timezone=timezone,
            )
            if success:
                file_success_count += 1
    finally:
        if influx_client is not None:
            influx_client.close()

    total_success_count = file_success_count + db_success_count
    if total_success_count == 0:
        print("Warning: no data downloaded/exported in this run.")
        shutil.rmtree(LOCAL_TEMP_DIR)
        return None

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_filename_base = f"backup_{group_name}_{last_month_str}_{timestamp}"
    zip_filepath = shutil.make_archive(zip_filename_base, "zip", LOCAL_TEMP_DIR)

    print(
        f"--- Backup created: {zip_filepath} "
        f"(file devices: {file_success_count}, db-only devices: {db_success_count}) ---"
    )

    shutil.rmtree(LOCAL_TEMP_DIR)
    return zip_filepath


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Download and package previous-month data by instrument group."
    )
    parser.add_argument("group_name", type=str, help='Instrument group name (e.g. "T8-WISE")')
    args = parser.parse_args()

    try:
        final_zip_file = download_by_group(args.group_name)
    except Exception as e:
        print(f"Fatal error: {e}")
        raise SystemExit(1)

    if final_zip_file and os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output_file:
            print(f"zip_filename={final_zip_file}", file=output_file)
