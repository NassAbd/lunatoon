import { crc32 } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeReference, UPLOAD_LIMIT_BYTES } from "../src/lib/creator/uploads";

function originalImage(width = 48, height = 32) {
  return sharp({ create: { width, height, channels: 3, background: "#88b4a2" } });
}

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

describe("reference upload normalization", () => {
  it.each(["png", "jpeg", "webp"] as const)("fully decodes original %s bytes and returns a canonical PNG", async format => {
    const input = await originalImage().toFormat(format).toBuffer();
    const result = await normalizeReference(input);
    expect(result).toMatchObject({ mime: "image/png", width: 48, height: 32 });
    expect(result.bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(result.bytes.length).toBeLessThanOrEqual(UPLOAD_LIMIT_BYTES);
    const output = await sharp(result.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(output.info).toMatchObject({ width: 48, height: 32, channels: 3 });
  });

  it("uses bytes rather than a supplied name, MIME type, extension or filesystem path", async () => {
    const misleadingUpload = { name: "secret.svg", type: "text/html", bytes: await originalImage().jpeg().toBuffer() };
    await expect(normalizeReference(misleadingUpload.bytes)).resolves.toMatchObject({ mime: "image/png" });
    await expect(normalizeReference("/private/reference.png" as unknown as Buffer)).rejects.toThrow("PNG, JPEG or WebP");
    await expect(normalizeReference({ path: "/private/reference.png" } as unknown as Buffer)).rejects.toThrow("PNG, JPEG or WebP");
  });

  it.each([
    Buffer.alloc(0),
    Buffer.from("not an image"),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'),
    Buffer.from("GIF89a"),
  ])("rejects empty, unknown, vector and unsupported inputs", async bytes => {
    await expect(normalizeReference(bytes)).rejects.toThrow("PNG, JPEG or WebP");
  });

  it("rejects inputs larger than the byte cap before decoding", async () => {
    await expect(normalizeReference(Buffer.alloc(UPLOAD_LIMIT_BYTES + 1))).rejects.toThrow("5 MiB");
  });

  it.each(["png", "jpeg", "webp"] as const)("rejects truncated %s data", async format => {
    const input = await originalImage().toFormat(format).toBuffer();
    await expect(normalizeReference(input.subarray(0, -6))).rejects.toThrow("complete, readable");
  });

  it("rejects corrupt pixel data even when image metadata can be read", async () => {
    const input = await originalImage().png().toBuffer();
    const idat = input.indexOf(Buffer.from("IDAT"));
    expect(idat).toBeGreaterThan(0);
    input[idat + 5] ^= 0xff;
    // Keep the container checksum valid so only a full pixel decode finds this.
    const dataLength = input.readUInt32BE(idat - 4);
    input.writeUInt32BE(crc32(input.subarray(idat, idat + 4 + dataLength)), idat + 4 + dataLength);
    expect((await sharp(input).metadata()).width).toBe(48);
    await expect(normalizeReference(input)).rejects.toThrow("complete, readable");
  });

  it("rejects a compressed image wider than 4096 pixels", async () => {
    const input = await originalImage(4097, 1).png().toBuffer();
    await expect(normalizeReference(input)).rejects.toThrow("4096");
  });

  it("rejects a compressed image exceeding 16 million pixels", async () => {
    const input = await originalImage(4001, 4000).png().toBuffer();
    expect(input.length).toBeLessThan(UPLOAD_LIMIT_BYTES);
    await expect(normalizeReference(input)).rejects.toThrow("16 million pixels");
  });

  it("rejects animated WebP instead of silently keeping only its first frame", async () => {
    const pixels = Buffer.alloc(32 * 64 * 3, 20);
    pixels.fill(220, 32 * 32 * 3);
    const input = await sharp(pixels, { raw: { width: 32, height: 64, channels: 3, pageHeight: 32 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
    expect((await sharp(input).metadata()).pages).toBe(2);
    await expect(normalizeReference(input)).rejects.toThrow("still image");
  });

  it("rejects PNG animation declarations even when the decoder exposes only the first frame", async () => {
    const png = await originalImage().png().toBuffer();
    const animation = Buffer.alloc(8);
    animation.writeUInt32BE(2);
    const input = Buffer.concat([png.subarray(0, 33), pngChunk("acTL", animation), png.subarray(33)]);
    await expect(normalizeReference(input)).rejects.toThrow("still image");
  });

  it("orients pixels then removes EXIF, XMP and embedded color metadata", async () => {
    const input = await originalImage().withMetadata({ orientation: 6 }).withExifMerge({ IFD0: { Artist: "PRIVATE-TEST-AUTHOR" }, IFD2: { UserComment: "PRIVATE-TEST-COMMENT" } }).withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/">PRIVATE-TEST-XMP</x:xmpmeta>').jpeg().toBuffer();
    const before = await sharp(input).metadata();
    expect(before.exif).toBeDefined();
    expect(before.xmp).toBeDefined();
    const result = await normalizeReference(input);
    expect(result).toMatchObject({ width: 32, height: 48 });
    const after = await sharp(result.bytes).metadata();
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.icc).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    expect(result.bytes.includes(Buffer.from("PRIVATE-TEST"))).toBe(false);
  });

  it("bounds the normalized PNG even when a compressed source fits the input cap", async () => {
    const pixels = Buffer.alloc(1500 * 1500 * 3);
    let seed = 42;
    for (let index = 0; index < pixels.length; index++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      pixels[index] = seed & 0xff;
    }
    const input = await sharp(pixels, { raw: { width: 1500, height: 1500, channels: 3 } }).jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();
    expect(input.length).toBeLessThan(UPLOAD_LIMIT_BYTES);
    await expect(normalizeReference(input)).rejects.toThrow("5 MiB");
  });
});
