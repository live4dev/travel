import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { containsDirectIdentifier, possibleFullNames } from "../src/import-utils";
import type { DayRecord, MediaManifest, RouteCollection, Trip } from "../src/types";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors: string[] = [];
const warnings: string[] = [];

const readJson = async <T>(relativePath: string): Promise<T> =>
  JSON.parse(await fs.readFile(path.join(projectRoot, relativePath), "utf8")) as T;

const validCoordinate = ([longitude, latitude]: [number, number]): boolean =>
  Number.isFinite(longitude) && Number.isFinite(latitude)
  && longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;

const checkPrivateText = (label: string, text: string): void => {
  if (containsDirectIdentifier(text)) errors.push(`${label}: найден телефон, аккаунт или Telegram-ссылка`);
  const fullNames = possibleFullNames(text);
  if (fullNames.length) warnings.push(`${label}: проверьте возможные имя и фамилию — ${fullNames.join(", ")}`);
};

async function main(): Promise<void> {
  const trip = await readJson<Trip>("content/trip.json");
  const days = await readJson<DayRecord[]>("content/days.json");
  const manifest = await readJson<MediaManifest>("public/data/media-manifest.json");
  const route = await readJson<RouteCollection>("public/data/route.geojson");
  const dayIds = new Set<string>();
  const mediaById = new Map(manifest.media.map((item) => [item.id, item]));

  if (!trip.title || !trip.subtitle || !trip.startDate || !trip.endDate) errors.push("Не заполнены основные сведения о поездке");
  if (trip.startDate > trip.endDate) errors.push("Дата начала позже даты окончания");
  if (trip.status === "published" && days.length === 0) errors.push("Для публикации нужен хотя бы один день");
  if (trip.status !== "published" && days.length === 0) warnings.push("Telegram-экспорт ещё не импортирован: публикуется экран ожидания материалов");

  days.forEach((day, index) => {
    if (!day.id || dayIds.has(day.id)) errors.push(`Неуникальный id дня: ${day.id}`);
    dayIds.add(day.id);
    if (day.date < trip.startDate || day.date > trip.endDate) errors.push(`${day.id}: дата вне периода поездки`);
    if (index > 0 && day.date <= days[index - 1]!.date) errors.push(`${day.id}: дни должны идти в хронологическом порядке без повторов`);
    if (!day.title || !day.summary || day.paragraphs.length === 0) errors.push(`${day.id}: не заполнены заголовок, анонс или текст`);
    checkPrivateText(day.id, [day.title, day.summary, ...day.paragraphs].join(" "));
    day.locations.forEach((location) => {
      if (!location.name || !validCoordinate(location.coordinates)) errors.push(`${day.id}: некорректная локация ${location.id}`);
    });
    day.media.forEach((mediaId) => {
      const media = mediaById.get(mediaId);
      if (!media) errors.push(`${day.id}: фотография ${mediaId} отсутствует в манифесте`);
      if (media && media.dayId !== day.id) errors.push(`${day.id}: фотография ${mediaId} привязана к ${media.dayId}`);
    });
  });

  for (const item of manifest.media) {
    if (trip.status === "published" && !item.alt.trim()) errors.push(`${item.id}: отсутствует alt`);
    if (item.dayId && !dayIds.has(item.dayId)) warnings.push(`${item.id}: фотография относится к непубличному дню ${item.dayId}`);
    checkPrivateText(item.id, `${item.alt} ${item.caption}`);
    for (const variant of [...item.variants.avif, ...item.variants.webp]) {
      const absolutePath = path.join(projectRoot, "public", variant.src.replace(/^\.\//, ""));
      try {
        await fs.access(absolutePath);
      } catch {
        errors.push(`${item.id}: отсутствует ${variant.src}`);
      }
    }
  }

  if (route.type !== "FeatureCollection") errors.push("route.geojson должен быть FeatureCollection");
  route.features.forEach((feature) => {
    if (feature.geometry.type !== "LineString" || feature.geometry.coordinates.length < 2) errors.push(`${feature.properties.id}: маршрут должен содержать минимум две точки`);
    if (!dayIds.has(feature.properties.dayId)) errors.push(`${feature.properties.id}: неизвестный dayId ${feature.properties.dayId}`);
    if (!feature.geometry.coordinates.every(validCoordinate)) errors.push(`${feature.properties.id}: некорректные координаты`);
  });

  warnings.forEach((warning) => console.warn(`⚠ ${warning}`));
  if (errors.length) {
    console.error(errors.map((error) => `• ${error}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`Контент валиден: статус ${trip.status}, дней ${days.length}, фотографий ${manifest.media.length}, участков маршрута ${route.features.length}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
