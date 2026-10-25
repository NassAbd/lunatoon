import { crc32 } from "node:zlib";
import sharp from "sharp";

export const UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024;
const MAX_EDGE = 4096;
const MAX_PIXELS = 16_000_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const INVALID_IMAGE = "Use a complete, readable PNG, JPEG or WebP image, at most 4096 pixels per edge and 16 million pixels.";

// Only fixed messages leave this boundary; decoder errors may contain metadata.
export class ReferenceValidationError extends Error {}

export type NormalizedReference = {
  bytes: Buffer;
  mime: "image/png";
  width: number;
  height: number;
};

function rejectAnimation(): never {
  throw new ReferenceValidationError("Choose a single still image. Animated references are not supported.");
}

function validatePngContainer(bytes: Buffer): void {
  let offset = 8;
  let hasPixels = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new ReferenceValidationError(INVALID_IMAGE);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (offset === 8 && (type !== "IHDR" || length !== 13)) throw new ReferenceValidationError(INVALID_IMAGE);
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw new ReferenceValidationError(INVALID_IMAGE);
    // libvips can expose APNG as a single PNG frame, so inspect its declaration.
    if (type === "acTL" || type === "fcTL" || type === "fdAT") rejectAnimation();
    if (type === "IDAT") hasPixels = true;
    if (type === "IEND") {
      if (length !== 0 || !hasPixels || end !== bytes.length) throw new ReferenceValidationError(INVALID_IMAGE);
      return;
    }
    offset = end;
  }
  throw new ReferenceValidationError(INVALID_IMAGE);
}

function validateWebpContainer(bytes: Buffer): void {
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) throw new ReferenceValidationError(INVALID_IMAGE);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length + (length % 2);
    if (end > bytes.length) throw new ReferenceValidationError(INVALID_IMAGE);
    if (type === "ANIM" || type === "ANMF" || (type === "VP8X" && length > 0 && (bytes[offset + 8] & 2) !== 0)) rejectAnimation();
    offset = end;
  }
  if (offset !== bytes.length) throw new ReferenceValidationError(INVALID_IMAGE);
}

function detectedFormat(bytes: Buffer): "png" | "jpeg" | "webp" {
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    validatePngContainer(bytes);
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    validateWebpContainer(bytes);
    return "webp";
  }
  throw new ReferenceValidationError(INVALID_IMAGE);
}

function validateDimensions(width: number | undefined, height: number | undefined): void {
  if (!width || !height || width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) {
    throw new ReferenceValidationError(INVALID_IMAGE);
  }
}

export async function normalizeReference(bytes: Buffer): Promise<NormalizedReference> {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new ReferenceValidationError(INVALID_IMAGE);
  if (bytes.length > UPLOAD_LIMIT_BYTES) throw new ReferenceValidationError("Each reference must be 5 MiB or smaller.");
  try {
    const format = detectedFormat(bytes);
    const source = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_PIXELS });
    const metadata = await source.metadata();
    if (metadata.format !== format) throw new ReferenceValidationError(INVALID_IMAGE);
    if ((metadata.pages ?? 1) !== 1 || metadata.delay !== undefined || metadata.loop !== undefined) rejectAnimation();
    validateDimensions(metadata.width, metadata.height);
    // Full decoding is required: metadata() alone does not validate pixel data.
    // Sharp strips EXIF/XMP/ICC by default. Apply orientation before stripping it.
    const normalized = await source.autoOrient().toColourspace("srgb").png().toBuffer({ resolveWithObject: true });
    validateDimensions(normalized.info.width, normalized.info.height);
    if (normalized.data.length > UPLOAD_LIMIT_BYTES) throw new ReferenceValidationError("The normalized reference must be 5 MiB or smaller. Choose a smaller image.");
    return { bytes: normalized.data, mime: "image/png", width: normalized.info.width, height: normalized.info.height };
  } catch (error) {
    if (error instanceof ReferenceValidationError) throw error;
    throw new ReferenceValidationError(INVALID_IMAGE);
  }
}
