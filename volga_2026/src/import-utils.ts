export interface TelegramTextEntity {
  type?: string;
  text?: string;
}

export type TelegramText = string | Array<string | TelegramTextEntity>;

export const telegramText = (value: TelegramText | undefined): string => {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value.map((part) => typeof part === "string" ? part : part.text ?? "").join("").trim();
};

export const datePart = (value: string): string => value.slice(0, 10);

export const withinInclusiveRange = (date: string, startDate: string, endDate: string): boolean => {
  const normalized = datePart(date);
  return normalized >= startDate && normalized <= endDate;
};

export const redactDirectIdentifiers = (value: string): string => value
  .replace(/(?:\+?7|8)[\s(\-]*\d{3}[\s)\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/g, "[телефон удалён]")
  .replace(/@[a-zA-Z][a-zA-Z0-9_]{4,}/g, "[аккаунт удалён]")
  .replace(/(?:https?:\/\/)?t\.me\/[a-zA-Z0-9_]+/g, "[ссылка на аккаунт удалена]");

export const containsDirectIdentifier = (value: string): boolean =>
  /(?:\+?7|8)[\s(\-]*\d{3}[\s)\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}|@[a-zA-Z][a-zA-Z0-9_]{4,}|(?:https?:\/\/)?t\.me\/[a-zA-Z0-9_]+/.test(value);

export const possibleFullNames = (value: string): string[] => {
  const matches = value.match(/(?<![\p{L}\p{N}_])[А-ЯЁ][а-яё]{2,}\s+[А-ЯЁ][а-яё]{3,}(?![\p{L}\p{N}_])/gu) ?? [];
  return [...new Set(matches)];
};
