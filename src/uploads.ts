/**
 * Upload validation for the two admin-replaceable files. Content type is decided by magic
 * bytes, never by the client's filename or declared MIME; R2 keys are fixed (no path input).
 */

export type AssetKind = "cv" | "photo";

export const ASSET_KEYS: Record<AssetKind, string> = { cv: "cv.pdf", photo: "photo" };

export const MAX_BYTES: Record<AssetKind, number> = {
  cv: 5 * 1024 * 1024, // 5 MB
  photo: 8 * 1024 * 1024, // 8 MB
};

export type Sniffed = { contentType: string; extension: string };

export function sniff(bytes: Uint8Array): Sniffed | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return { contentType: "application/pdf", extension: "pdf" }; // %PDF-
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { contentType: "image/png", extension: "png" };
  if (startsWith([0xff, 0xd8, 0xff])) return { contentType: "image/jpeg", extension: "jpg" };
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return { contentType: "image/webp", extension: "webp" }; // RIFF....WEBP
  }
  return null;
}

const ALLOWED: Record<AssetKind, readonly string[]> = {
  cv: ["application/pdf"],
  photo: ["image/png", "image/jpeg", "image/webp"],
};

export type Validation = { ok: true; contentType: string } | { ok: false; reason: string };

export function validateUpload(kind: AssetKind, bytes: Uint8Array): Validation {
  if (bytes.byteLength === 0) return { ok: false, reason: "empty file" };
  if (bytes.byteLength > MAX_BYTES[kind]) {
    return { ok: false, reason: `file larger than ${Math.round(MAX_BYTES[kind] / 1024 / 1024)} MB` };
  }
  const sniffed = sniff(bytes);
  if (!sniffed || !ALLOWED[kind].includes(sniffed.contentType)) {
    return { ok: false, reason: `expected ${kind === "cv" ? "a PDF" : "a PNG, JPEG or WebP image"}` };
  }
  return { ok: true, contentType: sniffed.contentType };
}
