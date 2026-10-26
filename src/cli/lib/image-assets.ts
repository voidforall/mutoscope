import { existsSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import { IMAGE_SRC, type Asset } from "../../schema";
import { CliError } from "./reel-files";

/**
 * Images for image entities, read from the reel's assets/ folder and embedded
 * as data URIs: the page's CSP allows no network, so a reel can never
 * hotlink, track or leak anything through an image. The type comes from the
 * file's bytes, never its name.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

type Sniffed = Pick<Asset, "mime" | "width" | "height">;

const u16be = (b: Buffer, o: number) => b.readUInt16BE(o);
const u16le = (b: Buffer, o: number) => b.readUInt16LE(o);
const u24le = (b: Buffer, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);

function png(b: Buffer): Sniffed | undefined {
  if (b.length < 24 || !b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return undefined;
  return { mime: "image/png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function gif(b: Buffer): Sniffed | undefined {
  const sig = b.subarray(0, 6).toString("latin1");
  if (b.length < 10 || (sig !== "GIF87a" && sig !== "GIF89a")) return undefined;
  return { mime: "image/gif", width: u16le(b, 6), height: u16le(b, 8) };
}

function jpeg(b: Buffer): Sniffed | undefined {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return undefined;
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) return undefined;
    const marker = b[o + 1]!;
    const len = u16be(b, o + 2);
    // Start-of-frame markers carry the size; C4 (huffman), C8 and CC (arithmetic coding) are not frames.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { mime: "image/jpeg", height: u16be(b, o + 5), width: u16be(b, o + 7) };
    }
    o += 2 + len;
  }
  return undefined;
}

function webp(b: Buffer): Sniffed | undefined {
  if (b.length < 30 || b.subarray(0, 4).toString("latin1") !== "RIFF" || b.subarray(8, 12).toString("latin1") !== "WEBP") return undefined;
  const chunk = b.subarray(12, 16).toString("latin1");
  if (chunk === "VP8 ") return { mime: "image/webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  if (chunk === "VP8L") {
    return { mime: "image/webp", width: 1 + (b[21]! | ((b[22]! & 0x3f) << 8)), height: 1 + (((b[22]! & 0xc0) >> 6) | (b[23]! << 2) | ((b[24]! & 0x0f) << 10)) };
  }
  if (chunk === "VP8X") return { mime: "image/webp", width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
  return undefined;
}

const svgLength = (v: string | undefined) => {
  const m = v === undefined ? null : /^\s*([\d.]+)\s*(px)?\s*$/.exec(v);
  return m ? Number(m[1]) : undefined;
};

function svg(b: Buffer, src: string): Sniffed | undefined {
  const text = b.toString("utf8");
  const root = /<svg\b([^>]*)>/i.exec(text);
  if (!root || !/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[^>]*>\s*)?<svg\b/i.test(text)) return undefined;
  // Never rendered as a document (only through <img>), but refuse active content outright.
  if (/<script\b|<foreignObject\b|\son[a-z]+\s*=/i.test(text)) throw new CliError(`${src} contains scripts or event handlers`, "Use a plain SVG, or export it as PNG.");
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(root[1]!)?.[1];
  const box = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
  const width = svgLength(attr("width")) ?? box?.[2];
  const height = svgLength(attr("height")) ?? box?.[3];
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) throw new CliError(`${src} has no usable size`, "Give the <svg> element a viewBox or width and height in px.");
  return { mime: "image/svg+xml", width, height };
}

/**
 * The image without embedded metadata. Photos and screenshots carry EXIF/XMP
 * (camera, software, often GPS location) that must not be published by
 * accident; pixels are untouched.
 */
export function stripMetadata(bytes: Buffer, mime: Asset["mime"]): Buffer {
  if (mime === "image/jpeg") return stripJpeg(bytes);
  if (mime === "image/png") return stripPng(bytes);
  if (mime === "image/webp") return stripWebp(bytes);
  return bytes;
}

/** Drop APP1 (EXIF, XMP), APP13 (IPTC) and comment segments; keep everything up to the scan unchanged otherwise. */
function stripJpeg(b: Buffer): Buffer {
  const parts: Buffer[] = [b.subarray(0, 2)];
  let o = 2;
  while (o + 4 <= b.length && b[o] === 0xff) {
    const marker = b[o + 1]!;
    if (marker === 0xda) break; // start of scan: the rest is image data
    const end = o + 2 + u16be(b, o + 2);
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) parts.push(b.subarray(o, end));
    o = end;
  }
  parts.push(b.subarray(o));
  return Buffer.concat(parts);
}

const PNG_METADATA = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function stripPng(b: Buffer): Buffer {
  const parts: Buffer[] = [b.subarray(0, 8)];
  let o = 8;
  while (o + 12 <= b.length) {
    const end = o + 12 + b.readUInt32BE(o);
    if (!PNG_METADATA.has(b.subarray(o + 4, o + 8).toString("latin1"))) parts.push(b.subarray(o, end));
    o = end;
  }
  return Buffer.concat(parts);
}

/** Drop EXIF and XMP chunks, clear their flags in the extended header, and fix the RIFF size. */
function stripWebp(b: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let o = 12;
  while (o + 8 <= b.length) {
    const size = b.readUInt32LE(o + 4);
    const end = o + 8 + size + (size % 2);
    const id = b.subarray(o, o + 4).toString("latin1");
    if (id === "VP8X") {
      const vp8x = Buffer.from(b.subarray(o, end));
      vp8x[8] = vp8x[8]! & ~0x0c;
      chunks.push(vp8x);
    } else if (id !== "EXIF" && id !== "XMP ") chunks.push(b.subarray(o, end));
    o = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.from(b.subarray(0, 12));
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
}

export function sniffImage(bytes: Buffer, src: string): Sniffed {
  const found = png(bytes) ?? jpeg(bytes) ?? gif(bytes) ?? webp(bytes) ?? svg(bytes, src);
  if (!found || found.width <= 0 || found.height <= 0) throw new CliError(`${src} is not a PNG, JPEG, WebP, GIF or SVG image`, "Check the file; its extension alone does not count.");
  return found;
}

/** `src` of every image entity in raw (unvalidated) scenes. */
export function imageSources(scenes: unknown): string[] {
  if (!Array.isArray(scenes)) return [];
  const srcs = scenes.flatMap((s) => {
    const entities = (s as { entities?: unknown })?.entities;
    return Array.isArray(entities) ? entities.filter((e) => e?.type === "image" && typeof e.src === "string").map((e) => e.src as string) : [];
  });
  return [...new Set(srcs)].filter((s) => IMAGE_SRC.test(s));
}

/**
 * Embed the images `scenes` reference. Missing files are left out (validation
 * reports them against the entity); oversized, disguised or escaping files
 * stop the load.
 */
export async function loadImageAssets(reelDir: string, scenes: unknown): Promise<Record<string, Asset>> {
  const srcs = imageSources(scenes);
  if (srcs.length === 0) return {};
  const root = await realpath(reelDir);
  const out: Record<string, Asset> = {};
  let total = 0;
  for (const src of srcs) {
    const path = join(reelDir, src);
    if (!existsSync(path)) continue;
    const real = await realpath(path);
    if (!real.startsWith(join(root, "assets") + sep)) throw new CliError(`${src} resolves outside the reel's assets folder`, "Copy the file into assets/ instead of linking to it.");
    const size = (await stat(real)).size;
    if (size > MAX_IMAGE_BYTES) throw new CliError(`${src} is ${(size / 1048576).toFixed(1)} MB; images are limited to ${MAX_IMAGE_BYTES / 1048576} MB`, "Resize or compress it (a 1600 px wide JPEG or WebP is plenty).");
    total += size;
    if (total > MAX_TOTAL_IMAGE_BYTES) throw new CliError(`images add up to more than ${MAX_TOTAL_IMAGE_BYTES / 1048576} MB`, "Compress them or use fewer.");
    const raw = await readFile(real);
    const sniffed = sniffImage(raw, src);
    const bytes = stripMetadata(raw, sniffed.mime);
    out[src] = { ...sniffed, dataUri: `data:${sniffed.mime};base64,${bytes.toString("base64")}` };
  }
  return out;
}
