// Vygeneruje PNG ikony z public/icon.svg
import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../public/icon.svg", import.meta.url));

for (const size of [192, 512]) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(new URL(`../public/icon-${size}.png`, import.meta.url).pathname);
  console.log(`icon-${size}.png hotovo`);
}

// apple touch icon (180x180, bez průhlednosti)
await sharp(svg, { density: 384 })
  .resize(180, 180)
  .flatten({ background: "#0b1220" })
  .png()
  .toFile(new URL("../public/apple-touch-icon.png", import.meta.url).pathname);
console.log("apple-touch-icon.png hotovo");
