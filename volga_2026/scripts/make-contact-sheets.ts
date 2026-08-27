import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";

const inputDirectory = path.resolve(process.argv[2] ?? "../tg_volga_chat/photos");
const outputDirectory = path.resolve(process.argv[3] ?? ".work/contact-sheets");
const dateFilter = process.argv[4]?.trim();
const columns = 4;
const rows = 4;
const cellWidth = 300;
const cellHeight = 230;
const pageSize = columns * rows;

const naturalCompare = (left: string, right: string): number =>
  left.localeCompare(right, "ru", { numeric: true, sensitivity: "base" });

const escapeXml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

async function main(): Promise<void> {
  const files = (await fs.readdir(inputDirectory))
    .filter((file) => /\.(?:jpe?g|png|webp|heic|heif)$/i.test(file))
    .filter((file) => !dateFilter || file.includes(`@${dateFilter}_`))
    .sort(naturalCompare);
  if (!files.length) throw new Error("Фотографии для контактного листа не найдены");

  await fs.mkdir(outputDirectory, { recursive: true });
  const pageCount = Math.ceil(files.length / pageSize);
  for (let page = 0; page < pageCount; page += 1) {
    const pageFiles = files.slice(page * pageSize, (page + 1) * pageSize);
    const composites: OverlayOptions[] = [];
    for (const [index, file] of pageFiles.entries()) {
      const left = (index % columns) * cellWidth;
      const top = Math.floor(index / columns) * cellHeight;
      const image = await sharp(path.join(inputDirectory, file), { failOn: "none" })
        .rotate()
        .resize(cellWidth - 12, cellHeight - 34, { fit: "contain", background: "#f8f4eb" })
        .jpeg({ quality: 82 })
        .toBuffer();
      const label = Buffer.from(`<svg width="${cellWidth}" height="28" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#17383b"/><text x="9" y="19" font-family="Arial, sans-serif" font-size="13" fill="#fff">${escapeXml(file)}</text></svg>`);
      composites.push({ input: image, left: left + 6, top: top + 4 });
      composites.push({ input: label, left, top: top + cellHeight - 28 });
    }
    const suffix = dateFilter ? `-${dateFilter}` : "";
    const outputPath = path.join(outputDirectory, `contact${suffix}-${String(page + 1).padStart(2, "0")}.jpg`);
    await sharp({
      create: {
        width: columns * cellWidth,
        height: rows * cellHeight,
        channels: 3,
        background: "#eee7d9",
      },
    }).composite(composites).jpeg({ quality: 86 }).toFile(outputPath);
    console.log(outputPath);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
