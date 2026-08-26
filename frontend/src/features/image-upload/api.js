import { z } from "zod";

import { apiRequest } from "../../shared/api/index.js";
import { ApiError } from "../../shared/api/errors.js";

export const IMAGE_ALLOWED_CONTENT_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp"
]);
export const IMAGE_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const DEFAULT_GROUP_IMAGE_URL = "/images/default-group.png";

const imageUploadResponseSchema = z
  .object({
    id: z.string().uuid(),
    imageKey: z.string().min(1),
    uploadUrl: z.string().url(),
    expiresAt: z.string().min(1)
  })
  .strict();

function invalidImage(code) {
  return new ApiError({ code, status: 400 });
}

export function validateImageFile(file) {
  if (!file || typeof file !== "object") {
    throw invalidImage("INVALID_PARAMETER");
  }

  const contentType = typeof file.type === "string" ? file.type.toLowerCase() : "";
  if (!IMAGE_ALLOWED_CONTENT_TYPES.includes(contentType)) {
    throw invalidImage("IMAGE_CONTENT_TYPE_NOT_ALLOWED");
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw invalidImage("INVALID_PARAMETER");
  }
  if (file.size > IMAGE_MAX_FILE_SIZE) {
    throw invalidImage("IMAGE_FILE_TOO_LARGE");
  }
  return { contentType, fileName: file.name?.trim() || "group-image" };
}

export function createImageUpload(file) {
  const metadata = validateImageFile(file);
  return apiRequest("image-uploads", {
    method: "post",
    json: {
      fileName: metadata.fileName,
      contentType: metadata.contentType,
      fileSize: file.size
    },
    schema: imageUploadResponseSchema
  });
}

export async function uploadImage(file, { fetcher = globalThis.fetch } = {}) {
  const metadata = validateImageFile(file);
  const imageUpload = await createImageUpload(file);
  if (typeof fetcher !== "function") {
    throw new ApiError({ code: "IMAGE_UPLOAD_FAILED", status: 0 });
  }

  let response;
  try {
    response = await fetcher(imageUpload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": metadata.contentType },
      credentials: "omit",
      body: file
    });
  } catch {
    throw new ApiError({ code: "IMAGE_UPLOAD_FAILED", status: 0 });
  }
  if (!response?.ok) {
    throw new ApiError({ code: "IMAGE_UPLOAD_FAILED", status: response.status });
  }
  return imageUpload;
}

function imagePath(imageUrl) {
  if (!imageUrl) return "";
  try {
    return new URL(imageUrl, "http://localhost").pathname.replace(/^\/+/, "");
  } catch {
    return String(imageUrl).replace(/^\/+/, "");
  }
}

export function isDefaultGroupImageUrl(imageUrl) {
  const path = imagePath(imageUrl);
  return path === "images/default-group.png" || path === "api/images/default-group.png";
}

/**
 * The current group response exposes a public URL rather than the storage key.
 * Recover the key for the known CloudFront `/images` path so a full-replacement
 * group PUT can preserve an existing representative image. A future response
 * field can supersede this compatibility conversion.
 */
export function representativeImageKeyFromUrl(imageUrl) {
  const path = imagePath(imageUrl);
  if (!path || isDefaultGroupImageUrl(imageUrl)) return null;

  const imagesIndex = path.indexOf("images/");
  const candidate = imagesIndex >= 0 ? path.slice(imagesIndex + "images/".length) : path;
  if (!candidate.startsWith("groups/")) return null;
  try {
    return decodeURIComponent(candidate);
  } catch {
    return candidate;
  }
}
