// src/lib/dates.js
// Dates "calendrier" (YYYY-MM-DD) calculées en heure locale, sans passer par UTC.

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (n) => String(n).padStart(2, "0");

export const toDateStr = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const parseDateStr = (value) => {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const str = String(value).trim();
  const m = DATE_ONLY_RE.exec(str);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

export const todayStr = () => toDateStr(new Date());

export const addDaysToDate = (base, days) => {
  const d = parseDateStr(base);
  if (!d) return null;
  return toDateStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() + Number(days || 0)));
};
