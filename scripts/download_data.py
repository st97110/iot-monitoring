"""Download and package previous-month data by instrument group.

Compared with the original version:
- file devices: after merging raw daily CSVs, write a tidy per-device CSV
  (filename and kept columns come from ``devices.json``) into the group
  root instead of leaving a nested folder and an auto-named ``YYYYMM.csv``.
- db-only devices: export from InfluxDB and pivot ``_field``/``_value`` into
  friendly columns (e.g. ``BT3-A``/``BT3-B``).
- rain gauge (雨量筒): convert cumulative pulse counts to rainfall
  (mm) and compute 10-min / 1-hour / 3-hour / 24-hour / calendar-day
  rolling totals.
- no longer calls ``shutil.make_archive``; the workflow uploads the temp
  directory directly so ``actions/upload-artifact`` only zips once.
"""

import argparse
import csv
import json
import os
import shutil
import subprocess
from collections import OrderedDict, defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo

from dateutil import parser as date_parser
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
DEFAULT_TIME_COL = "時間"


# ---------- Helpers ----------

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


def ensure_clean_dir(path: str) -> None:
    if os.path.exists(path):
        shutil.rmtree(path)
    os.makedirs(path)


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
        f' |> range(start: time(v: "{flux_escape(start_iso)}"), stop: time(v: "{flux_escape(stop_iso)}"))',
        f' |> filter(fn: (r) => r._measurement == "{flux_escape(measurement)}")',
    ]
    for tag_key, tag_val in tag_filters.items():
        lines.append(
            f' |> filter(fn: (r) => r["{flux_escape(tag_key)}"] == "{flux_escape(tag_val)}")'
        )
    if fields:
        field_conditions = " or ".join(
            [f'r._field == "{flux_escape(field)}"' for field in fields]
        )
        lines.append(f" |> filter(fn: (r) => {field_conditions})")
    lines.append(' |> sort(columns: ["_time"], desc: false)')
    return "\n".join(lines)


# ---------- File-device ingestion ----------

def collect_source_csv_files(device_root: str, skip_abs_path: str) -> List[str]:
    """Recursively collect CSVs under device_root, excluding the output file."""
    files: List[str] = []
    for dirpath, _dirnames, filenames in os.walk(device_root):
        for name in filenames:
            if not name.lower().endswith(".csv"):
                continue
            full = os.path.join(dirpath, name)
            if os.path.abspath(full) == skip_abs_path:
                continue
            files.append(full)
    files.sort()
    return files


def read_csv_rows(
    path: str, rename: Optional[Dict[str, str]] = None
) -> Tuple[List[str], List[Dict[str, str]]]:
    """Read a CSV, optionally renaming columns via ``rename``.

    Stripping of surrounding whitespace is applied to both header and cells,
    which is necessary for WISE-4010 raw CSVs that use space-padded numbers
    like ``"      12.092"``.
    """
    rename = rename or {}
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        raw_header = [h.strip() for h in (reader.fieldnames or [])]
        header = [rename.get(h, h) for h in raw_header]
        rows: List[Dict[str, str]] = []
        for r in reader:
            out = {}
            for raw_col, val in r.items():
                if raw_col is None:
                    continue
                col = rename.get(raw_col.strip(), raw_col.strip())
                out[col] = val.strip() if isinstance(val, str) else val
            rows.append(out)
    return header, rows


def write_csv_rows(path: str, header: List[str], rows: List[Dict[str, Any]]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=header, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def merge_raw_file_device(
    source_files: List[str], rename: Optional[Dict[str, str]] = None
) -> Tuple[List[str], List[Dict[str, str]]]:
    """Read every raw CSV and return the union of headers + concatenated rows."""
    merged_rows: List[Dict[str, str]] = []
    header_union: List[str] = []
    seen = set()
    for path in source_files:
        try:
            header, rows = read_csv_rows(path, rename=rename)
        except Exception as e:
            print(f"   !! failed to read {path}: {e}")
            continue
        for col in header:
            if col not in seen:
                header_union.append(col)
                seen.add(col)
        merged_rows.extend(rows)
    return header_union, merged_rows


def apply_file_transform(
    device_info: Dict[str, Any],
    merged_header: List[str],
    merged_rows: List[Dict[str, str]],
    group_root: str,
    fallback_name: str,
) -> Optional[str]:
    """Turn merged raw rows into the final per-device CSV."""
    output_filename = device_info.get("output_filename") or f"{fallback_name}.csv"
    output_path = os.path.join(group_root, output_filename)

    transform = str(device_info.get("transform", "")).lower()

    if transform == "rain_gauge":
        return write_rain_gauge_csv(device_info, merged_header, merged_rows, output_path)

    # Default: keep_columns (drop noise, reorder) — leave rows as-is otherwise.
    keep = device_info.get("keep_columns")
    if keep:
        header_out = list(keep)
    else:
        header_out = merged_header

    # Sort by 時間 if present (raw files are already chronological per-day,
    # but merging multiple days can interleave; a final sort keeps downstream
    # consumers happy).
    time_col = DEFAULT_TIME_COL if DEFAULT_TIME_COL in merged_header else None
    if time_col:
        merged_rows.sort(key=lambda r: r.get(time_col, ""))

    write_csv_rows(output_path, header_out, merged_rows)
    return output_path


def write_rain_gauge_csv(
    device_info: Dict[str, Any],
    merged_header: List[str],
    merged_rows: List[Dict[str, str]],
    output_path: str,
) -> Optional[str]:
    """Convert cumulative pulse counter -> windowed rainfall totals (mm).

    Port of ``統計雨量.py``. Expected raw columns: ``PE, TIM, DI_0 Cnt``.
    The DI_0 Cnt column is a monotonically-increasing pulse counter; each
    pulse represents ``mm_per_pulse`` mm of rainfall (default 0.5 mm).
    """
    try:
        import pandas as pd
    except ImportError as e:
        raise RuntimeError(
            "pandas is required for the rain_gauge transform. "
            "Install with: pip install pandas"
        ) from e

    cfg = device_info.get("rain_gauge", {}) or {}
    time_col = cfg.get("time_col", "TIM")
    pulse_col = cfg.get("pulse_col", "DI_0 Cnt")
    mm_per_pulse = float(cfg.get("mm_per_pulse", 0.5))
    windows: Dict[str, str] = cfg.get("windows") or {
        "10分鐘": "10min",
        "1小時": "1H",
        "3小時": "3H",
        "24小時": "24H",
        "當天": "calendar_day",
    }

    if time_col not in merged_header or pulse_col not in merged_header:
        print(
            f"   !! rain_gauge transform aborted: missing {time_col} or "
            f"{pulse_col} in raw header {merged_header}."
        )
        return None
    if not merged_rows:
        print("   !! rain_gauge: no rows to process.")
        return None

    df = pd.DataFrame(merged_rows)
    df[time_col] = pd.to_datetime(df[time_col])
    df[pulse_col] = pd.to_numeric(df[pulse_col], errors="coerce")
    df = df.dropna(subset=[time_col, pulse_col]).sort_values(time_col).reset_index(drop=True)

    # Per-interval rainfall: delta_pulses * mm_per_pulse
    # (matches 統計雨量.py which does ``.diff().fillna(0) / 2``)
    per_interval = df[pulse_col].diff().fillna(0) * mm_per_pulse

    # Build the output DataFrame with just the columns the final CSV needs.
    # Format: "YYYY-MM-DD HH:MM:SS+HH:MM" (space separator, colonised TZ) to
    # match the reference 雨量.csv.
    def _fmt(ts):
        s = ts.isoformat()  # "2026-02-01T00:08:46+08:00"
        return s.replace("T", " ", 1)

    out = pd.DataFrame({DEFAULT_TIME_COL: df[time_col].map(_fmt)})

    # Use time-indexed rolling for fixed-length windows; custom for "calendar_day".
    time_indexed = per_interval.copy()
    time_indexed.index = df[time_col]
    for col_name, code in windows.items():
        code = str(code).strip()
        if code == "calendar_day":
            # Cumulative sum since 00:00 of each calendar day.
            day_key = df[time_col].dt.date
            out[col_name] = per_interval.groupby(day_key).cumsum().values
        else:
            # pandas rolling accepts offset strings like "10min", "1H", "3H", "24H".
            out[col_name] = time_indexed.rolling(code).sum().values

    # Round values for cleanliness; matches the existing output style.
    for col_name in windows:
        out[col_name] = out[col_name].round(3)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    out.to_csv(output_path, index=False, encoding="utf-8-sig")
    return output_path


def download_file_device(
    device_id: str,
    device_info: Dict[str, Any],
    last_month_str: str,
    group_root: str,
    timezone: ZoneInfo,
) -> bool:
    _ = timezone
    remote_path = device_info.get("remote_path")
    if not remote_path:
        print(f"Skip {device_id}: file-type device missing remote_path.")
        return False
    folder_name = str(device_info.get("folder_name", device_id))
    remote_path_pattern = f"{remote_path}/{last_month_str}*"
    remote_source = f"{INFLUXDB_CT_HOST}:{remote_path_pattern}"
    scratch_dir = os.path.join(LOCAL_TEMP_DIR, "_raw", folder_name)
    os.makedirs(scratch_dir, exist_ok=True)
    print(f"Downloading file device {device_id} ({folder_name})...")
    try:
        subprocess.run(
            ["scp", "-r", remote_source, scratch_dir],
            shell=False,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        stderr = (e.stderr or "").strip()
        print(f" -> Download failed for {device_id}. {stderr}")
        return False
    if not any(os.scandir(scratch_dir)):
        print(f" -> No file data for {device_id} in {last_month_str}.")
        shutil.rmtree(scratch_dir, ignore_errors=True)
        return False

    source_files = collect_source_csv_files(scratch_dir, skip_abs_path="")
    if not source_files:
        print(f" -> No raw CSV under scratch for {device_id}.")
        shutil.rmtree(scratch_dir, ignore_errors=True)
        return False

    raw_rename = device_info.get("raw_column_map") or None
    header, rows = merge_raw_file_device(source_files, rename=raw_rename)
    final_path = apply_file_transform(
        device_info, header, rows, group_root, fallback_name=folder_name
    )
    # Clean up scratch
    shutil.rmtree(scratch_dir, ignore_errors=True)
    if not final_path:
        return False
    print(
        f" -> Wrote {os.path.relpath(final_path, LOCAL_TEMP_DIR)} "
        f"(raw files: {len(source_files)}, rows: {len(rows)})."
    )
    return True


# ---------- DB-only ingestion ----------

def export_db_only_device(
    device_id: str,
    device_info: Dict[str, Any],
    last_month_str: str,
    start_iso: str,
    stop_iso: str,
    query_api: Any,
    influx_org: str,
    default_bucket: str,
    group_root: str,
) -> bool:
    _ = last_month_str
    influx_cfg = device_info.get("influx")
    if not isinstance(influx_cfg, dict):
        raise RuntimeError(f"{device_id} is db_only but missing `influx` config.")
    measurement = str(influx_cfg.get("measurement", "wise_raw"))
    tag_filters = influx_cfg.get("tag_filters")
    if not isinstance(tag_filters, dict) or not tag_filters:
        raise RuntimeError(
            f"{device_id} is db_only but missing valid `influx.tag_filters`."
        )
    explicit_fields = influx_cfg.get("fields")
    if explicit_fields is not None and not isinstance(explicit_fields, list):
        raise RuntimeError(f"{device_id} `influx.fields` must be an array if provided.")
    bucket = str(influx_cfg.get("bucket", default_bucket))
    folder_name = str(device_info.get("folder_name", device_id))

    transform = str(device_info.get("transform", "")).lower()
    pivot_cfg = device_info.get("pivot") or {}
    wanted_fields: List[str] = []
    if transform == "pivot_influx":
        wanted_fields = list(pivot_cfg.get("fields") or explicit_fields or [])

    flux_query = build_flux_query(
        bucket=bucket,
        measurement=measurement,
        start_iso=start_iso,
        stop_iso=stop_iso,
        tag_filters=tag_filters,
        fields=wanted_fields or explicit_fields,
    )
    print(f"Exporting DB-only device {device_id} ({folder_name}) from InfluxDB...")
    records = list(query_api.query_stream(query=flux_query, org=influx_org))
    if not records:
        print(f" -> No DB records found for {device_id}.")
        return False

    output_filename = device_info.get("output_filename") or f"{folder_name}.csv"
    output_path = os.path.join(group_root, output_filename)

    if transform == "pivot_influx":
        time_col = pivot_cfg.get("time_col", DEFAULT_TIME_COL)
        fields = wanted_fields or sorted({str(r.values.get("_field")) for r in records})
        # Pivot: (time -> {field -> value})
        pivot: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
        for r in records:
            vals = r.values
            t = vals.get("_time")
            t_iso = t.isoformat() if hasattr(t, "isoformat") else str(t)
            field = str(vals.get("_field"))
            if field not in fields:
                continue
            bucket_row = pivot.setdefault(t_iso, {})
            bucket_row[field] = vals.get("_value")
        header = [time_col] + fields
        out_rows = []
        for t_iso, fv in pivot.items():
            row = {time_col: t_iso}
            for field in fields:
                row[field] = fv.get(field, "")
            out_rows.append(row)
        out_rows.sort(key=lambda r: r.get(time_col, ""))
        write_csv_rows(output_path, header, out_rows)
        print(f" -> Wrote {os.path.relpath(output_path, LOCAL_TEMP_DIR)} ({len(out_rows)} rows).")
        return True

    # Fallback: flat raw dump (previous behaviour).
    rows_out = []
    for r in records:
        row = {}
        for k, v in r.values.items():
            if k in {"result", "table"}:
                continue
            row[k] = v.isoformat() if hasattr(v, "isoformat") else v
        rows_out.append(row)
    if not rows_out:
        return False
    preferred = ["_time", "_measurement", "_field", "_value", "device", "device_sn", "channel", "topic_name"]
    all_keys = set()
    for r in rows_out:
        all_keys.update(r.keys())
    ordered = [k for k in preferred if k in all_keys] + sorted(all_keys - set(preferred))
    write_csv_rows(output_path, ordered, rows_out)
    print(f" -> Wrote raw dump {os.path.relpath(output_path, LOCAL_TEMP_DIR)} ({len(rows_out)} rows).")
    return True


# ---------- Orchestration ----------

def download_by_group(group_name: str) -> Optional[str]:
    print(f"--- Start processing group: {group_name} ---")
    try:
        devices_config = load_devices_config()
    except FileNotFoundError:
        print(f"Error: config file '{CONFIG_FILE_PATH}' not found.")
        return None
    device_ids = devices_config.get("groups", {}).get(group_name) or []
    # Strip comment entries (lines whose "id" starts with //)
    device_ids = [d for d in device_ids if not str(d).startswith("//")]
    if not device_ids:
        print(f"Error: group '{group_name}' not found or empty.")
        return None

    timezone = get_timezone()
    last_month_str, start_iso, stop_iso = get_last_month_window(timezone)
    print(f"Target month: {last_month_str} ({start_iso} -> {stop_iso})")

    ensure_clean_dir(LOCAL_TEMP_DIR)
    group_root = os.path.join(LOCAL_TEMP_DIR, f"{group_name}_{last_month_str}")
    os.makedirs(group_root, exist_ok=True)

    resolved: List[Tuple[str, Dict[str, Any]]] = []
    db_only_ids: List[str] = []
    for device_id in device_ids:
        info = devices_config.get("devices", {}).get(device_id)
        if not info:
            print(f"Warning: device '{device_id}' not found in config, skip.")
            continue
        resolved.append((device_id, info))
        if is_db_only_device(info):
            db_only_ids.append(device_id)

    influx_client = None
    query_api = None
    influx_org = ""
    influx_bucket = ""
    if db_only_ids:
        settings = ensure_influx_env()
        try:
            from influxdb_client import InfluxDBClient
        except ImportError as e:
            raise RuntimeError(
                "influxdb-client is required for DB-only export. "
                "Install with: pip install influxdb-client"
            ) from e
        influx_org = settings["org"]
        influx_bucket = settings["bucket"]
        influx_client = InfluxDBClient(
            url=settings["url"], token=settings["token"], org=influx_org
        )
        query_api = influx_client.query_api()

    file_ok = 0
    db_ok = 0
    try:
        for device_id, info in resolved:
            try:
                if is_db_only_device(info):
                    if export_db_only_device(
                        device_id=device_id,
                        device_info=info,
                        last_month_str=last_month_str,
                        start_iso=start_iso,
                        stop_iso=stop_iso,
                        query_api=query_api,
                        influx_org=influx_org,
                        default_bucket=influx_bucket,
                        group_root=group_root,
                    ):
                        db_ok += 1
                    continue
                if download_file_device(
                    device_id=device_id,
                    device_info=info,
                    last_month_str=last_month_str,
                    group_root=group_root,
                    timezone=timezone,
                ):
                    file_ok += 1
            except Exception as e:
                print(f" -> Failed for {device_id}: {e}")
                continue
    finally:
        if influx_client is not None:
            influx_client.close()

    total = file_ok + db_ok
    if total == 0:
        print("Warning: no data downloaded/exported in this run.")
        shutil.rmtree(LOCAL_TEMP_DIR, ignore_errors=True)
        return None
    # Clean up scratch area if still present.
    raw_scratch = os.path.join(LOCAL_TEMP_DIR, "_raw")
    shutil.rmtree(raw_scratch, ignore_errors=True)
    print(
        f"--- Done. Output dir: {group_root} (files: {file_ok}, db: {db_ok}) ---"
    )
    return group_root


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Download and package previous-month data by instrument group."
    )
    parser.add_argument("group_name", type=str, help='Instrument group name (e.g. "T8-WISE")')
    args = parser.parse_args()
    try:
        final_dir = download_by_group(args.group_name)
    except Exception as e:
        print(f"Fatal error: {e}")
        raise SystemExit(1)
    if final_dir and os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output_file:
            # Emit the directory path; upload-artifact will zip its contents once.
            print(f"output_dir={final_dir}", file=output_file)
            print(f"artifact_name={os.path.basename(final_dir)}", file=output_file)
