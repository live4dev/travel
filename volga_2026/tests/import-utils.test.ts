import assert from "node:assert/strict";
import test from "node:test";
import { containsDirectIdentifier, datePart, possibleFullNames, redactDirectIdentifiers, telegramText, withinInclusiveRange } from "../src/import-utils";

test("составной Telegram-текст собирается без потери сущностей", () => {
  assert.equal(telegramText(["Доброе ", { type: "bold", text: "утро" }, "!"]), "Доброе утро!");
  assert.equal(telegramText(undefined), "");
});

test("период импорта включает обе граничные даты", () => {
  assert.equal(datePart("2026-07-29T08:15:00"), "2026-07-29");
  assert.equal(withinInclusiveRange("2026-07-29T08:15:00", "2026-07-29", "2026-08-17"), true);
  assert.equal(withinInclusiveRange("2026-08-17T23:59:00", "2026-07-29", "2026-08-17"), true);
  assert.equal(withinInclusiveRange("2026-08-18T00:00:00", "2026-07-29", "2026-08-17"), false);
});

test("телефоны и Telegram-аккаунты удаляются из черновика", () => {
  const source = "Позвоните +7 (999) 123-45-67 или напишите @volga_admin, t.me/volga_chat";
  const redacted = redactDirectIdentifiers(source);
  assert.equal(containsDirectIdentifier(redacted), false);
  assert.match(redacted, /телефон удалён/);
  assert.match(redacted, /аккаунт удалён/);
});

test("возможные сочетания имени и фамилии отправляются на ручную проверку", () => {
  assert.deepEqual(possibleFullNames("С нами Иван Петров и дети."), ["Иван Петров"]);
});
