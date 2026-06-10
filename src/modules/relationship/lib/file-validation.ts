/**
 * Artifact upload validation (2e, Phase 6).
 *
 * The risk in file upload is never the form - it is trusting a file from
 * outside (Release It! boundary). So we do NOT trust the filename's extension or
 * the browser-reported MIME. We read the first bytes and detect the real type
 * from its magic number, then enforce the size cap. The Storage bucket repeats
 * the MIME + size limits server-side as a backstop.
 */

/** 20 MB - matches the bucket + the relationship_artifact size guard. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type DetectResult =
  | { ok: true; mime: string }
  | { ok: false; reason: string };

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  return sig.every((b, i) => bytes[i] === b);
}

/** ASCII for the 4 bytes at offset 4 (the ISO-BMFF box type, e.g. "ftyp"). */
function boxTypeAt4(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.slice(4, 8));
}

/**
 * Detect the real file type from magic bytes. Returns the canonical MIME we
 * store, or a reject reason. Supports the bucket's allow-list: PDF, PNG, JPEG,
 * HEIC. Async because it reads the file header.
 */
export async function detectFileType(file: File): Promise<DetectResult> {
  if (file.size === 0) return { ok: false, reason: "The file is empty." };
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, reason: "File is larger than 20 MB." };
  }

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  // %PDF
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return { ok: true, mime: "application/pdf" };
  // PNG \x89PNG\r\n\x1a\n
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { ok: true, mime: "image/png" };
  // JPEG FF D8 FF
  if (startsWith(head, [0xff, 0xd8, 0xff])) return { ok: true, mime: "image/jpeg" };
  // HEIC: ISO-BMFF "ftyp" box at offset 4, with a heic-family brand
  if (boxTypeAt4(head) === "ftyp") {
    const brand = String.fromCharCode(...head.slice(8, 12));
    if (["heic", "heix", "hevc", "mif1", "msf1"].includes(brand)) {
      return { ok: true, mime: "image/heic" };
    }
  }

  return { ok: false, reason: "Unsupported file type. Use PDF, PNG, JPEG or HEIC." };
}
