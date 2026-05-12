import sharp from "sharp";

const MIN_RATIO = 0.8;   // 4:5  portrait limit (Instagram max tall)
const MAX_RATIO = 1.91;  // landscape limit

export interface FitResult {
  width: number;
  height: number;
  wasFitted: boolean;
}

/**
 * Ensures an image fits within Instagram's allowed aspect ratio range (0.8–1.91).
 * If the image is outside this range, pads with a blurred extension of the image itself.
 * Output is always JPEG. If no padding is needed, the original is passed through as-is.
 */
export async function fitForInstagramFeed(inputPath: string, outputPath: string): Promise<FitResult> {
  const meta = await sharp(inputPath).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) throw new Error(`Cannot read dimensions from ${inputPath}`);

  const ratio = w / h;

  if (ratio >= MIN_RATIO && ratio <= MAX_RATIO) {
    await sharp(inputPath).jpeg({ quality: 92 }).toFile(outputPath);
    return { width: w, height: h, wasFitted: false };
  }

  let targetW: number;
  let targetH: number;

  if (ratio < MIN_RATIO) {
    // Too tall — expand canvas to 4:5
    targetH = h;
    targetW = Math.round(h * MIN_RATIO);
  } else {
    // Too wide — expand canvas to 1.91:1
    targetW = w;
    targetH = Math.round(w / MAX_RATIO);
  }

  // Build blurred background: resize original to fill canvas, then heavy blur
  const blurredBg = await sharp(inputPath)
    .resize(targetW, targetH, { fit: "cover", position: "center" })
    .blur(30)
    .jpeg({ quality: 80 })
    .toBuffer();

  // Composite original centered on blurred background
  await sharp(blurredBg)
    .composite([{ input: inputPath, gravity: "center" }])
    .jpeg({ quality: 92 })
    .toFile(outputPath);

  return { width: targetW, height: targetH, wasFitted: true };
}

/**
 * Ensures a video thumbnail fits within Instagram Reels ratio (9:16).
 * For actual video files, pass through unchanged (Instagram handles video aspect).
 */
export async function fitForInstagramReel(inputPath: string, outputPath: string): Promise<FitResult> {
  const REEL_RATIO = 9 / 16;
  const meta = await sharp(inputPath).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) throw new Error(`Cannot read dimensions from ${inputPath}`);

  const ratio = w / h;
  const tolerance = 0.05;

  if (Math.abs(ratio - REEL_RATIO) <= tolerance) {
    await sharp(inputPath).jpeg({ quality: 92 }).toFile(outputPath);
    return { width: w, height: h, wasFitted: false };
  }

  const targetW = Math.min(w, Math.round(h * REEL_RATIO));
  const targetH = Math.round(targetW / REEL_RATIO);

  const blurredBg = await sharp(inputPath)
    .resize(targetW, targetH, { fit: "cover", position: "center" })
    .blur(30)
    .jpeg({ quality: 80 })
    .toBuffer();

  await sharp(blurredBg)
    .composite([{ input: inputPath, gravity: "center" }])
    .jpeg({ quality: 92 })
    .toFile(outputPath);

  return { width: targetW, height: targetH, wasFitted: true };
}
