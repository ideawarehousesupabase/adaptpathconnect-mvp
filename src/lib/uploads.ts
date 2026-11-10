import { doc, onSnapshot, query, where, writeBatch } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
import { CaseError, uploadsCol, writeEvents, type Actor } from "./cases";
import { describeError, getDb, getStorageClient, withTimeout } from "./firebase";

export const EVIDENCE_CATEGORIES = ["Bathroom Photos", "Measurement Photos", "Supporting Documents"] as const;
export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

/** Kept in step with storage.rules. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,image/heic,application/pdf";
const allowed = (type: string) => type.startsWith("image/") || type === "application/pdf" || type === "";

/** Metadata at users/{uid}/uploads/{id}; the file itself is in Cloud Storage or stored as data URL fallback. */
export interface Upload {
  id: string;
  caseId: string;
  category: EvidenceCategory;
  fileName: string;
  fileType: string;
  size: number;
  storagePath: string;
  downloadURL: string;
  uploadedBy: string;
  uploadedByUid: string;
  uploadedAt: string;
}

const TIMEOUT = "The file service did not respond in time.";

/** Helper to convert a file to a compressed data URL as fallback when Cloud Storage is restricted or offline */
async function fileToFallbackDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type.startsWith("image/") && typeof document !== "undefined") {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => {
          const maxDim = 1200;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.8));
            return;
          }
          resolve(reader.result as string);
        };
        img.onerror = () => resolve(reader.result as string);
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.readAsDataURL(file);
    }
  });
}

export async function uploadEvidence(actor: Actor, caseId: string, category: EvidenceCategory, file: File): Promise<void> {
  if (!allowed(file.type)) throw new CaseError(`${file.name}: only photos and PDF documents can be attached.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new CaseError(`${file.name} is larger than 10 MB.`);

  const db = await getDb();
  const meta = doc(uploadsCol(db, actor.userId));
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const safeCaseId = caseId.replace(/[^\w.\-]+/g, "_");
  const safeActorId = actor.userId.replace(/[^\w.\-]+/g, "_");
  const storagePath = `users/${safeActorId}/cases/${safeCaseId}/${meta.id}-${safeName}`;

  let downloadURL = "";
  let finalStoragePath = storagePath;

  // Try Cloud Storage first with a short timeout
  try {
    const storage = await getStorageClient();
    const object = ref(storage, storagePath);
    await withTimeout(uploadBytes(object, file, { contentType: file.type || "application/octet-stream" }), TIMEOUT, 8000);
    downloadURL = await withTimeout(getDownloadURL(object), TIMEOUT, 5000);
  } catch (storageErr) {
    console.warn("Cloud Storage upload failed or timed out, falling back to reliable direct storage:", storageErr);
    // Fall back to resilient direct data URL storage
    try {
      downloadURL = await fileToFallbackDataUrl(file);
      finalStoragePath = "inline";
    } catch (fallbackErr) {
      console.error("Data URL fallback also failed:", fallbackErr);
      throw new CaseError(`Could not upload ${file.name}. Please try a smaller photo or PDF.`);
    }
  }

  const at = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(meta, {
    caseId,
    category,
    fileName: file.name,
    fileType: file.type || (downloadURL.startsWith("data:image/") ? "image/jpeg" : "application/pdf"),
    size: file.size,
    storagePath: finalStoragePath,
    downloadURL,
    uploadedBy: actor.fullName,
    uploadedByUid: actor.userId,
    uploadedAt: at,
  });
  writeEvents(batch, db, actor, caseId, at, [
    { type: "evidence_uploaded", action: "Supporting evidence attached", detail: `${category}: ${file.name}` },
  ]);
  await withTimeout(batch.commit(), TIMEOUT, 10000);
}

export async function removeEvidence(actor: Actor, upload: Upload): Promise<void> {
  const db = await getDb();
  if (upload.storagePath && upload.storagePath !== "inline") {
    try {
      const storage = await getStorageClient();
      await withTimeout(deleteObject(ref(storage, upload.storagePath)), TIMEOUT, 5000).catch((err: { code?: string }) => {
        if (err.code !== "storage/object-not-found") console.warn("Storage delete error:", err);
      });
    } catch (e) {
      console.warn("Could not delete from storage bucket:", e);
    }
  }
  const at = new Date().toISOString();
  const batch = writeBatch(db);
  batch.delete(doc(uploadsCol(db, actor.userId), upload.id));
  writeEvents(batch, db, actor, upload.caseId, at, [
    { type: "evidence_removed", action: "Supporting evidence removed", detail: `${upload.category}: ${upload.fileName}` },
  ]);
  await withTimeout(batch.commit(), TIMEOUT, 10000);
}

/** Live list of a case's evidence, newest first. */
export function useCaseUploads(userId: string, caseId: string) {
  const [uploads, setUploads] = useState<Upload[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    setUploads(null);
    setError(null);
    const fail = (err: unknown) => {
      console.error(err);
      if (!cancelled) setError(describeError(err, "Could not load the attached evidence."));
    };
    getDb()
      .then((db) => {
        if (cancelled) return;
        stop = onSnapshot(
          query(uploadsCol(db, userId), where("caseId", "==", caseId)),
          (snap) =>
            setUploads(
              snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<Upload, "id">) }))
                .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
            ),
          fail,
        );
      })
      .catch(fail);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [userId, caseId]);
  return { uploads, error };
}
