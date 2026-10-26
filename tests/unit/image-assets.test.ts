import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { imageSources, loadImageAssets, MAX_IMAGE_BYTES, sniffImage, stripMetadata } from "../../src/cli/lib/image-assets";

export function pngBytes(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

const jpegBytes = (width: number, height: number) =>
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("sniffImage", () => {
  it("reads type and size from the bytes", () => {
    expect(sniffImage(pngBytes(640, 360), "a.png")).toEqual({ mime: "image/png", width: 640, height: 360 });
    expect(sniffImage(jpegBytes(1600, 900), "a.jpg")).toEqual({ mime: "image/jpeg", width: 1600, height: 900 });
    const gif = Buffer.from("GIF89a\x20\x00\x10\x00rest", "latin1");
    expect(sniffImage(gif, "a.gif")).toEqual({ mime: "image/gif", width: 32, height: 16 });
    const svg = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect/></svg>');
    expect(sniffImage(svg, "a.svg")).toEqual({ mime: "image/svg+xml", width: 120, height: 80 });
  });

  it("rejects files that only claim to be images, and SVGs with active content", () => {
    expect(() => sniffImage(Buffer.from("#!/bin/sh\necho hi"), "assets/x.png")).toThrow(/not a PNG, JPEG, WebP, GIF or SVG/);
    expect(() => sniffImage(Buffer.from('<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>'), "x.svg")).toThrow(/scripts or event handlers/);
    expect(() => sniffImage(Buffer.from('<svg viewBox="0 0 1 1" onload="x()"></svg>'), "x.svg")).toThrow(/scripts or event handlers/);
    expect(() => sniffImage(Buffer.from("<svg><rect/></svg>"), "x.svg")).toThrow(/no usable size/);
  });
});

describe("stripMetadata", () => {
  const chunk = (id: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(id, 4, "latin1");
    return Buffer.concat([head, data, Buffer.alloc(4)]);
  };

  it("drops EXIF, XMP and comments from JPEGs but keeps the image segments", () => {
    const exif = Buffer.from([0xff, 0xe1, 0x00, 0x0a, ...Buffer.from("Exif\0GPS!", "latin1").subarray(0, 8)]);
    const comment = Buffer.from([0xff, 0xfe, 0x00, 0x05, 0x68, 0x69, 0x21]);
    const sof = Buffer.from([0xff, 0xc0, 0x00, 0x05, 0x08, 0x00, 0x01]);
    const scan = Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), exif, comment, sof, scan]);
    expect(stripMetadata(jpeg, "image/jpeg")).toEqual(Buffer.concat([Buffer.from([0xff, 0xd8]), sof, scan]));
  });

  it("drops text and EXIF chunks from PNGs", () => {
    const ihdr = chunk("IHDR", Buffer.alloc(13));
    const png = Buffer.concat([pngBytes(1, 1).subarray(0, 8), ihdr, chunk("tEXt", Buffer.from("GPS\0here")), chunk("eXIf", Buffer.alloc(6)), chunk("IEND", Buffer.alloc(0))]);
    const out = stripMetadata(png, "image/png");
    expect(out.toString("latin1")).not.toMatch(/tEXt|eXIf|GPS/);
    expect(out.toString("latin1")).toMatch(/IHDR[\s\S]*IEND/);
  });

  it("drops EXIF and XMP from WebP and keeps the RIFF size consistent", () => {
    const riffChunk = (id: string, data: Buffer) => {
      const head = Buffer.alloc(8);
      head.write(id, 0, "latin1");
      head.writeUInt32LE(data.length, 4);
      return Buffer.concat([head, data, Buffer.alloc(data.length % 2)]);
    };
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x0c;
    const body = Buffer.concat([riffChunk("VP8X", vp8x), riffChunk("VP8L", Buffer.alloc(6)), riffChunk("EXIF", Buffer.from("GPS")), riffChunk("XMP ", Buffer.from("<x/>"))]);
    const head = Buffer.from("RIFF\0\0\0\0WEBP", "latin1");
    head.writeUInt32LE(body.length + 4, 4);
    const out = stripMetadata(Buffer.concat([head, body]), "image/webp");
    expect(out.toString("latin1")).not.toMatch(/EXIF|XMP|GPS/);
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    expect(out[20]! & 0x0c).toBe(0);
  });
});

describe("loadImageAssets", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mutoscope-assets-"));
    await mkdir(join(dir, "assets"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const scenesWith = (...srcs: string[]) => [{ entities: srcs.map((src, i) => ({ id: `i${i}`, type: "image", src })) }];

  it("embeds referenced images as data URIs and skips missing ones", async () => {
    await writeFile(join(dir, "assets", "a.png"), pngBytes(4, 3));
    await writeFile(join(dir, "assets", "unused.png"), pngBytes(1, 1));
    const assets = await loadImageAssets(dir, scenesWith("assets/a.png", "assets/missing.png"));
    expect(Object.keys(assets)).toEqual(["assets/a.png"]);
    expect(assets["assets/a.png"]).toMatchObject({ mime: "image/png", width: 4, height: 3 });
    expect(assets["assets/a.png"]!.dataUri).toMatch(/^data:image\/png;base64,/);
  });

  it("refuses links out of the assets folder and oversized files", async () => {
    await writeFile(join(dir, "secret.png"), pngBytes(1, 1));
    await symlink(join(dir, "secret.png"), join(dir, "assets", "link.png"));
    await expect(loadImageAssets(dir, scenesWith("assets/link.png"))).rejects.toThrow(/outside the reel's assets folder/);
    await writeFile(join(dir, "assets", "big.png"), Buffer.concat([pngBytes(1, 1), Buffer.alloc(MAX_IMAGE_BYTES)]));
    await expect(loadImageAssets(dir, scenesWith("assets/big.png"))).rejects.toThrow(/images are limited to 5 MB/);
  });

  it("only considers well-formed sources from image entities", () => {
    expect(imageSources([{ entities: [{ type: "image", src: "assets/a.png" }, { type: "image", src: "../x.png" }, { type: "label", src: "assets/b.png" }] }, null])).toEqual(["assets/a.png"]);
  });
});
