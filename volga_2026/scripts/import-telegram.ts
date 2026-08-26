import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import exifr from "exifr";
import sharp from "sharp";
import { datePart, possibleFullNames, redactDirectIdentifiers, telegramText, withinInclusiveRange } from "../src/import-utils";
import type { DayRecord, MediaAsset, MediaManifest, Trip } from "../src/types";

interface TelegramLocation {
  latitude?: number;
  longitude?: number;
}

interface TelegramMessage {
  id: number;
  type?: string;
  date: string;
  text?: string | Array<string | { type?: string; text?: string }>;
  photo?: string;
  file?: string;
  media_type?: string;
  mime_type?: string;
  location_information?: TelegramLocation;
}

interface TelegramExport {
  name?: string;
  type?: string;
  id?: number;
  messages?: TelegramMessage[];
}

interface ExifData {
  latitude?: number;
  longitude?: number;
  DateTimeOriginal?: Date | string;
  CreateDate?: Date | string;
}

interface MediaOverride {
  dayId?: string;
  hidden?: boolean;
  order?: number;
  alt?: string;
  caption?: string;
  coordinates?: [number, number];
}

interface DraftMedia {
  id: string;
  messageId: number;
  sourcePath: string;
  mimeType: string | null;
  caption: string;
  telegramCoordinates: [number, number] | null;
  exifCoordinates: [number, number] | null;
  exifCapturedAt: string | null;
  width: number;
  height: number;
  possibleFullNames: string[];
}

interface DraftDay {
  id: string;
  date: string;
  messageIds: number[];
  reports: Array<{ messageId: number; text: string; possibleFullNames: string[] }>;
  media: DraftMedia[];
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultExportPath = path.resolve(projectRoot, "..", "imports", "volga1_2026", "result.json");
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);
const targetWidths = [480, 960, 1600];

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await fs.readFile(filePath, "utf8")) as T;

const isoString = (value: Date | string | undefined): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const validCoordinate = (longitude: unknown, latitude: unknown): [number, number] | null => {
  if (typeof longitude !== "number" || typeof latitude !== "number") return null;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return [longitude, latitude];
};

const resolveExportPath = async (argument: string | undefined): Promise<string> => {
  const candidate = path.resolve(argument ?? defaultExportPath);
  const stats = await fs.stat(candidate).catch(() => null);
  if (!stats) throw new Error(`Telegram-экспорт не найден: ${candidate}`);
  return stats.isDirectory() ? path.join(candidate, "result.json") : candidate;
};

const safeMediaPath = (exportRoot: string, relativePath: string): string => {
  const resolved = path.resolve(exportRoot, relativePath);
  if (resolved !== exportRoot && !resolved.startsWith(`${exportRoot}${path.sep}`)) {
    throw new Error(`Недопустимый путь медиа в экспорте: ${relativePath}`);
  }
  return resolved;
};

const sourcePhotoPath = (message: TelegramMessage): string | null => {
  const candidate = message.photo ?? message.file;
  if (!candidate || candidate.startsWith("(File not included")) return null;
  if (!imageExtensions.has(path.extname(candidate).toLowerCase())) return null;
  if (message.media_type?.includes("video")) return null;
  return candidate;
};

const mediaId = (message: TelegramMessage): string => `photo-${message.id}`;

async function inspectMedia(
  exportRoot: string,
  message: TelegramMessage,
  relativePath: string,
): Promise<{ draft: DraftMedia; absolutePath: string }> {
  const absolutePath = safeMediaPath(exportRoot, relativePath);
  await fs.access(absolutePath);
  let exif: ExifData = {};
  try {
    exif = await exifr.parse(absolutePath, { gps: true, exif: true, tiff: true }) as ExifData ?? {};
  } catch (error) {
    console.warn(`EXIF не прочитан для ${relativePath}:`, error instanceof Error ? error.message : error);
  }
  const metadata = await sharp(absolutePath, { failOn: "none" }).metadata();
  const caption = telegramText(message.text);
  return {
    absolutePath,
    draft: {
      id: mediaId(message),
      messageId: message.id,
      sourcePath: relativePath,
      mimeType: message.mime_type ?? null,
      caption: redactDirectIdentifiers(caption),
      telegramCoordinates: validCoordinate(
        message.location_information?.longitude,
        message.location_information?.latitude,
      ),
      exifCoordinates: validCoordinate(exif.longitude, exif.latitude),
      exifCapturedAt: isoString(exif.DateTimeOriginal ?? exif.CreateDate),
      width: metadata.width ?? 1600,
      height: metadata.height ?? 1200,
      possibleFullNames: possibleFullNames(caption),
    },
  };
}

async function makeVariants(
  sourcePath: string,
  id: string,
  sourceWidth: number,
  outputDirectory: string,
): Promise<MediaAsset["variants"]> {
  const widths = [...new Set(targetWidths.map((width) => Math.min(width, sourceWidth)))].sort((a, b) => a - b);
  const variants: MediaAsset["variants"] = { avif: [], webp: [] };
  const image = sharp(sourcePath, { failOn: "none" }).rotate();

  for (const width of widths) {
    const avifName = `${id}-${width}.avif`;
    const webpName = `${id}-${width}.webp`;
    await image.clone().resize({ width, withoutEnlargement: true }).avif({ quality: 58, effort: 5 }).toFile(path.join(outputDirectory, avifName));
    await image.clone().resize({ width, withoutEnlargement: true }).webp({ quality: 81, effort: 5 }).toFile(path.join(outputDirectory, webpName));
    variants.avif.push({ width, src: `./photos/${avifName}` });
    variants.webp.push({ width, src: `./photos/${webpName}` });
  }
  return variants;
}

async function main(): Promise<void> {
  const exportPath = await resolveExportPath(process.argv[2]);
  const exportRoot = path.dirname(exportPath);
  const payload = await readJson<TelegramExport>(exportPath);
  const trip = await readJson<Trip>(path.join(projectRoot, "content", "trip.json"));
  const publishedDays = await readJson<DayRecord[]>(path.join(projectRoot, "content", "days.json"));
  const overrides = await readJson<Record<string, MediaOverride>>(path.join(projectRoot, "content", "media-overrides.json"));
  const messages = (payload.messages ?? []).filter((message) =>
    message.type !== "service" && withinInclusiveRange(message.date, trip.startDate, trip.endDate));
  const draftDays = new Map<string, DraftDay>();
  const inspectedMedia = new Map<string, { draft: DraftMedia; absolutePath: string }>();
  let excludedVideos = 0;
  let missingMedia = 0;

  for (const message of messages) {
    const date = datePart(message.date);
    const day = draftDays.get(date) ?? { id: date, date, messageIds: [], reports: [], media: [] };
    day.messageIds.push(message.id);
    const text = telegramText(message.text);
    if (text) {
      day.reports.push({
        messageId: message.id,
        text: redactDirectIdentifiers(text),
        possibleFullNames: possibleFullNames(text),
      });
    }
    if (message.media_type?.includes("video")) excludedVideos += 1;
    const relativePath = sourcePhotoPath(message);
    if (relativePath) {
      try {
        const inspected = await inspectMedia(exportRoot, message, relativePath);
        day.media.push(inspected.draft);
        inspectedMedia.set(inspected.draft.id, inspected);
      } catch (error) {
        missingMedia += 1;
        console.warn(`Медиа пропущено для сообщения ${message.id}:`, error instanceof Error ? error.message : error);
      }
    }
    draftDays.set(date, day);
  }

  const workDirectory = path.join(projectRoot, ".work");
  const outputDirectory = path.join(projectRoot, "public", "photos");
  await fs.mkdir(workDirectory, { recursive: true });
  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(outputDirectory, { recursive: true });

  const media: MediaAsset[] = [];
  for (const [id, inspected] of inspectedMedia) {
    const override = overrides[id] ?? {};
    if (override.hidden) continue;
    const defaultDayId = datePart(messages.find((message) => mediaId(message) === id)?.date ?? "");
    const dayId = override.dayId ?? defaultDayId;
    const variants = await makeVariants(inspected.absolutePath, id, inspected.draft.width, outputDirectory);
    const coordinates = override.coordinates ?? inspected.draft.telegramCoordinates ?? inspected.draft.exifCoordinates;
    media.push({
      id,
      dayId,
      capturedAt: inspected.draft.exifCapturedAt,
      coordinates,
      alt: override.alt?.trim() ?? "",
      caption: override.caption?.trim() ?? "",
      width: inspected.draft.width,
      height: inspected.draft.height,
      src: variants.webp.at(-1)!.src,
      variants,
    });
  }
  media.sort((left, right) => {
    if (left.dayId !== right.dayId) return left.dayId.localeCompare(right.dayId);
    const leftOrder = overrides[left.id]?.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = overrides[right.id]?.order ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.id.localeCompare(right.id);
  });

  const draft = [...draftDays.values()].sort((left, right) => left.date.localeCompare(right.date));
  const gpsFromTelegram = draft.flatMap((day) => day.media).filter((item) => item.telegramCoordinates).length;
  const gpsFromExif = draft.flatMap((day) => day.media).filter((item) => item.exifCoordinates).length;
  const capturedAtCount = draft.flatMap((day) => day.media).filter((item) => item.exifCapturedAt).length;
  const possibleNames = [...new Set(draft.flatMap((day) => [
    ...day.reports.flatMap((report) => report.possibleFullNames),
    ...day.media.flatMap((item) => item.possibleFullNames),
  ]))];
  const audit = {
    generatedAt: new Date().toISOString(),
    chat: payload.name ?? null,
    period: { startDate: trip.startDate, endDate: trip.endDate },
    counts: {
      messages: messages.length,
      daysWithMaterial: draft.filter((day) => day.reports.length || day.media.length).length,
      photos: inspectedMedia.size,
      videosExcluded: excludedVideos,
      missingMedia,
      photosWithTelegramLocation: gpsFromTelegram,
      photosWithExifGps: gpsFromExif,
      photosWithExifDate: capturedAtCount,
      publishedDayRecords: publishedDays.length,
    },
    manualReview: {
      possibleFullNames: possibleNames,
      note: "Проверьте подписи, видимый текст на фотографиях и точность приблизительных локаций перед переводом trip.status в published.",
    },
  };
  const manifest: MediaManifest = { generatedAt: audit.generatedAt, media };

  await Promise.all([
    fs.writeFile(path.join(workDirectory, "editorial-draft.json"), `${JSON.stringify({ chat: payload.name ?? null, days: draft }, null, 2)}\n`),
    fs.writeFile(path.join(workDirectory, "location-audit.json"), `${JSON.stringify(audit, null, 2)}\n`),
    fs.writeFile(path.join(projectRoot, "public", "data", "media-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
  ]);

  console.log(`Чат: ${payload.name ?? "без названия"}`);
  console.log(`Период: ${trip.startDate} — ${trip.endDate}; сообщений: ${messages.length}; дней: ${audit.counts.daysWithMaterial}`);
  console.log(`Фото: ${inspectedMedia.size}; EXIF GPS: ${gpsFromExif}; геолокация Telegram: ${gpsFromTelegram}; EXIF-дата: ${capturedAtCount}`);
  console.log(`Видео исключено: ${excludedVideos}; недоступных медиа: ${missingMedia}`);
  console.log(`Редакторский черновик и аудит: ${path.relative(projectRoot, workDirectory)}/`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
