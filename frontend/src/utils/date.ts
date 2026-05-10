// 日期 helper — 統一使用 Asia/Taipei 時區
//
// 為什麼不用 new Date().toISOString().slice(0, 10)：
//   .toISOString() 永遠回傳 UTC，台灣早上 8 點前 UTC 還是昨天，
//   會拿到「比預期早一天」的日期字串。例：05-11 00:20 Taipei → '2026-05-10'。
//
// 為什麼不用 d.getFullYear() / getMonth() / getDate()：
//   依賴瀏覽器本地時區。台灣使用者大多沒問題，但若有人 OS 時區設定錯
//   或在外地存取，會拿到非 Taipei 日期。明確指定才安全。

const TAIPEI_TZ = 'Asia/Taipei';

// en-CA locale 回傳 ISO 8601 (YYYY-MM-DD) 格式，剛好給 <input type="date"> 用
const TAIPEI_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TAIPEI_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 取台灣當地日期字串 'YYYY-MM-DD'。傳 Date 物件、不傳則用 now */
export function toTaipeiDateString(d: Date = new Date()): string {
  return TAIPEI_DATE_FMT.format(d);
}

/** 取今天的台灣日期字串 'YYYY-MM-DD' */
export function todayInTaipei(): string {
  return toTaipeiDateString(new Date());
}
