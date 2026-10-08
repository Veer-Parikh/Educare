import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";

const UPLOAD_ROOT = path.resolve(env.UPLOAD_DIR);
const MAX_REMOTE_BYTES = 25 * 1024 * 1024;

if (env.cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export const storageDriver = env.cloudinaryEnabled ? "cloudinary" : "local";
export const uploadRoot = UPLOAD_ROOT;

const safeName = (name) =>
  path
    .basename(name || "file")
    .replace(/[^\w.\-]+/g, "_")
    .slice(-120) || "file";

function uploadToCloudinary(buffer, { folder, filename, mimeType }) {
  // Images go through the image pipeline; everything else is stored raw so PDFs
  // and documents are delivered as-is.
  const resourceType = mimeType?.startsWith("image/") ? "image" : "raw";
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `educare/${folder}`,
        resource_type: resourceType,
        use_filename: true,
        unique_filename: true,
        filename_override: safeName(filename),
      },
      (err, result) => (err ? reject(err) : resolve({ result, resourceType })),
    );
    stream.end(buffer);
  });
}

/**
 * Persist an uploaded file and return a FileRef.
 * @param {{ buffer: Buffer, originalname: string, mimetype: string, size: number }} file multer file
 * @param {string} folder logical folder, e.g. "materials"
 */
export async function saveFile(file, folder) {
  const ref = { name: file.originalname || "file", mimeType: file.mimetype, size: file.size };

  if (env.cloudinaryEnabled) {
    const { result, resourceType } = await uploadToCloudinary(file.buffer, {
      folder,
      filename: file.originalname,
      mimeType: file.mimetype,
    });
    return { ...ref, url: result.secure_url, key: `cloudinary:${resourceType}:${result.public_id}` };
  }

  const ext = path.extname(safeName(file.originalname)).toLowerCase();
  const rel = path.posix.join(folder, `${randomUUID()}${ext}`);
  const abs = path.join(UPLOAD_ROOT, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, file.buffer);
  return { ...ref, url: `${env.PUBLIC_URL}/uploads/${rel}`, key: `local:${rel}` };
}

export const saveFiles = (files = [], folder) => Promise.all(files.map((f) => saveFile(f, folder)));

/** Read a stored file back into memory (used to hand files to Gemini). */
export async function readFile(ref) {
  if (ref?.key?.startsWith("local:")) {
    const abs = path.join(UPLOAD_ROOT, ref.key.slice("local:".length));
    if (!abs.startsWith(UPLOAD_ROOT)) throw new Error("Invalid storage key");
    return fs.readFile(abs);
  }
  if (!ref?.url || !/^https?:\/\//.test(ref.url)) throw new Error("File is not retrievable");
  const res = await fetch(ref.url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Could not download file (${res.status})`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_REMOTE_BYTES) throw new Error("File is too large to process");
  return Buffer.from(await res.arrayBuffer());
}

/** Best-effort delete; storage errors never block the DB operation. */
export async function deleteFile(ref) {
  try {
    if (ref?.key?.startsWith("local:")) {
      const abs = path.join(UPLOAD_ROOT, ref.key.slice("local:".length));
      if (abs.startsWith(UPLOAD_ROOT)) await fs.rm(abs, { force: true });
    } else if (ref?.key?.startsWith("cloudinary:") && env.cloudinaryEnabled) {
      const [, resourceType, ...rest] = ref.key.split(":");
      await cloudinary.uploader.destroy(rest.join(":"), { resource_type: resourceType });
    }
  } catch (err) {
    console.warn("[storage] delete failed:", err.message);
  }
}

export const deleteFiles = (refs = []) => Promise.all(refs.map(deleteFile));
