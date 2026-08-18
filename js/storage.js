"use strict";

/**
 * VEXO HVAC - js/storage.js
 * Firebase Cloud Storage service layer
 * Depends on js/firebase.js - does NOT initialize Firebase
 * Only handles files - no Auth, no Firestore, no Admin UI
 */

import { app } from "./firebase.js";
import {
  getStorage,
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

// Initialize Storage from existing app instance
let storage;
try {
  storage = getStorage(app);
} catch (err) {
  console.warn("[storage.js] getStorage failed:", err);
  throw err;
}

/* ==================================================
   CONSTANTS & CONFIG
================================================== */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB - reasonable default
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export const STORAGE_FOLDERS = {
  services: "services",
  projects: "projects",
  company: "company",
  customers: "customers",
  temp: "temp",
};

/* ==================================================
   FILE NAME SANITIZATION
================================================== */

/**
 * Sanitize filename - prevents path traversal, unsafe chars
 * Preserves extension
 */
export function sanitizeFileName(fileName = "") {
  if (typeof fileName !== "string" || !fileName) return "file";

  // Extract extension
  const lastDot = fileName.lastIndexOf(".");
  let name = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  let ext = lastDot > 0 ? fileName.slice(lastDot).toLowerCase() : "";

  // Prevent path traversal
  name = name.replace(/(\.\.|\/|\\)/g, "");

  // Replace spaces and unsafe chars with dash, keep alphanumeric, dash, underscore
  name = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

  if (!name) name = "file";
  if (name.length > 80) name = name.slice(0, 80);

  // Sanitize extension - only alphanumeric
  if (ext) {
    ext = ext.replace(/[^a-z0-9.]/g, "");
    if (ext.length > 10) ext = ext.slice(0, 10);
  }

  return ext ? `${name}${ext}` : name;
}

function getExtension(fileName = "") {
  const idx = fileName.lastIndexOf(".");
  if (idx <= 0) return "";
  return fileName.slice(idx).toLowerCase();
}

function generateUniqueName(originalName = "") {
  const ext = getExtension(originalName) || "";
  const base = sanitizeFileName(originalName.replace(ext, "")) || "file";
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${base}-${unique}${ext}`;
}

/* ==================================================
   IMAGE VALIDATION
================================================== */

/**
 * Validate image file
 * @param {File|Blob} file
 * @param {Object} options
 * @returns {{ valid: boolean, error?: string, file?: File }}
 */
export function validateImage(file, options = {}) {
  const maxSize = options.maxSize || MAX_IMAGE_SIZE;
  const allowedTypes = options.allowedTypes || ALLOWED_IMAGE_TYPES;

  if (!file) {
    return { valid: false, error: "No file provided." };
  }

  if (!(file instanceof File) && !(file instanceof Blob)) {
    return { valid: false, error: "Invalid file type. Expected File or Blob." };
  }

  if (file.size === 0) {
    return { valid: false, error: "File is empty." };
  }

  if (file.size > maxSize) {
    const mb = (maxSize / (1024 * 1024)).toFixed(1);
    return { valid: false, error: `File too large. Max ${mb}MB allowed.` };
  }

  // For Blob without type, skip type check if no type
  if (file.type && !allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported format. Allowed: ${allowedTypes.map(t => t.split("/")[1]).join(", ")}`,
    };
  }

  return { valid: true, file };
}

/* ==================================================
   PATH HELPERS
================================================== */

export function buildPath(folder, fileName) {
  const safeFolder = (folder || "").toString().replace(/(\.\.|\/\/)/g, "").replace(/^\/+|\/+$/g, "");
  const safeFile = sanitizeFileName(fileName || "file");
  if (!safeFolder) return safeFile;
  return `${safeFolder}/${safeFile}`;
}

export function servicesPath(fileName) {
  return buildPath(STORAGE_FOLDERS.services, fileName);
}

export function projectsPath(fileName) {
  return buildPath(STORAGE_FOLDERS.projects, fileName);
}

export function companyPath(fileName) {
  return buildPath(STORAGE_FOLDERS.company, fileName);
}

export function customersPath(fileName) {
  // Do not hard-code customer IDs - caller should include subfolder if needed via buildPath
  return buildPath(STORAGE_FOLDERS.customers, fileName);
}

/* ==================================================
   CORE: GET DOWNLOAD URL
================================================== */

/**
 * Get download URL from path
 * @param {string} path
 * @returns {Promise<string>}
 */
export async function getFileURL(path) {
  try {
    if (!path || typeof path !== "string") throw new Error("Invalid storage path.");
    const fileRef = ref(storage, path);
    const url = await getDownloadURL(fileRef);
    return url;
  } catch (err) {
    console.warn("[storage.js] getFileURL failed:", path, err?.message || err);
    throw new Error(err?.message || "Failed to get file URL.");
  }
}

/* ==================================================
   CORE: UPLOAD FILE
================================================== */

/**
 * Upload file to exact path
 * @param {File|Blob} file
 * @param {string} path - full storage path e.g. services/ac-repair.jpg
 * @returns {Promise<string>} download URL
 */
export async function uploadFile(file, path) {
  try {
    if (!file) throw new Error("No file provided.");
    if (!(file instanceof File) && !(file instanceof Blob)) throw new Error("File must be File or Blob.");
    if (file.size === 0) throw new Error("File is empty.");
    if (!path || typeof path !== "string") throw new Error("Invalid storage path.");

    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);
    return url;
  } catch (err) {
    console.warn("[storage.js] uploadFile failed:", err?.message || err);
    throw new Error(err?.message || "File upload failed.");
  }
}

/* ==================================================
   UPLOAD WITH UNIQUE NAME
================================================== */

/**
 * Upload with auto-generated unique name to avoid collisions
 * @param {File} file
 * @param {string} folder - e.g. services
 * @returns {Promise<{url:string, path:string, name:string}>}
 */
export async function uploadFileWithUniqueName(file, folder = STORAGE_FOLDERS.services) {
  try {
    if (!file) throw new Error("No file provided.");
    if (!(file instanceof File)) throw new Error("File must be a File.");

    const validation = validateImage(file);
    if (!validation.valid) throw new Error(validation.error);

    const uniqueName = generateUniqueName(file.name || "image.jpg");
    const fullPath = buildPath(folder, uniqueName);

    const url = await uploadFile(file, fullPath);

    return {
      url,
      path: fullPath,
      name: uniqueName,
    };
  } catch (err) {
    console.warn("[storage.js] uploadFileWithUniqueName failed:", err?.message || err);
    throw new Error(err?.message || "Upload with unique name failed.");
  }
}

/* ==================================================
   DELETE FILE
================================================== */

/**
 * Delete file by path - safe for missing files
 * @param {string} path
 * @returns {Promise<{success:boolean, message:string}>}
 */
export async function deleteFileByPath(path) {
  try {
    if (!path || typeof path !== "string") throw new Error("Invalid storage path.");
    const fileRef = ref(storage, path);
    await deleteObject(fileRef);
    return { success: true, message: "File deleted." };
  } catch (err) {
    const code = err?.code || "";
    // Handle missing file gracefully
    if (code === "storage/object-not-found") {
      return { success: true, message: "File already deleted or not found." };
    }
    console.warn("[storage.js] deleteFileByPath failed:", path, err?.message || err);
    return { success: false, message: err?.message || "Failed to delete file." };
  }
}

/* ==================================================
   UPLOAD WITH PROGRESS - resumable
================================================== */

/**
 * Upload with progress callback
 * @param {File|Blob} file
 * @param {string} path
 * @param {(percent:number)=>void} onProgress
 * @returns {Promise<string>} download URL
 */
export function uploadFileWithProgress(file, path, onProgress) {
  return new Promise((resolve, reject) => {
    try {
      if (!file) return reject(new Error("No file provided."));
      if (!(file instanceof File) && !(file instanceof Blob)) return reject(new Error("File must be File or Blob."));
      if (file.size === 0) return reject(new Error("File is empty."));
      if (!path || typeof path !== "string") return reject(new Error("Invalid storage path."));

      const fileRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          if (typeof onProgress === "function") {
            const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            try {
              onProgress(percent);
            } catch {}
          }
        },
        (error) => {
          console.warn("[storage.js] upload progress error:", error?.message || error);
          reject(new Error(error?.message || "Upload failed."));
        },
        async () => {
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          } catch (err) {
            reject(new Error(err?.message || "Failed to get URL after upload."));
          }
        }
      );
    } catch (err) {
      reject(new Error(err?.message || "Upload initialization failed."));
    }
  });
}

/* ==================================================
   EXPORT STORAGE INSTANCE (for advanced use)
================================================== */
export { storage };
