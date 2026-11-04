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
const allowed = (type: string) => type.startsWith("image/") || type === "application/pdf";

/** Metadata at users/{uid}/uploads/{id}; the file itself is in Cloud Storage at storagePath. */
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

export async function uploadEvidence(actor: Actor, caseId: string, category: EvidenceCategory, file: File): Promise<void> {
  if (!allowed(file.type)) throw new CaseError(`${file.name}: only photos and PDF documents can be attached.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new CaseError(`${file.name} is larger than 10 MB.`);
  const [db, storage] = await Promise.all([getDb(), getStorageClient()]);
  const meta = doc(uploadsCol(db, actor.userId));
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const storagePath = `users/${actor.userId}/cases/${caseId}/${meta.id}-${safeName}`;
  const object = ref(storage, storagePath);
  await withTimeout(uploadBytes(object, file, { contentType: file.type }), TIMEOUT, 120000);
  try {
    const downloadURL = await withTimeout(getDownloadURL(object), TIMEOUT);
    const at = new Date().toISOString();
    const batch = writeBatch(db);
    batch.set(meta, {
      caseId,
      category,
      fileName: file.name,
      fileType: file.type,
      size: file.size,
      storagePath,
      downloadURL,
      uploadedBy: actor.fullName,
      uploadedByUid: actor.userId,
      uploadedAt: at,
    });
    writeEvents(batch, db, actor, caseId, at, [{ type: "evidence_uploaded", action: "Supporting evidence attached", detail: `${category}: ${file.name}` }]);
    await withTimeout(batch.commit(), TIMEOUT);
  } catch (err) {
    // Do not leave an orphaned file behind if its record could not be saved.
    await deleteObject(object).catch(console.error);
    throw err;
  }
}

export async function removeEvidence(actor: Actor, upload: Upload): Promise<void> {
  const [db, storage] = await Promise.all([getDb(), getStorageClient()]);
  await withTimeout(deleteObject(ref(storage, upload.storagePath)), TIMEOUT).catch((err: { code?: string }) => {
    if (err.code !== "storage/object-not-found") throw err;
  });
  const at = new Date().toISOString();
  const batch = writeBatch(db);
  batch.delete(doc(uploadsCol(db, actor.userId), upload.id));
  writeEvents(batch, db, actor, upload.caseId, at, [{ type: "evidence_removed", action: "Supporting evidence removed", detail: `${upload.category}: ${upload.fileName}` }]);
  await withTimeout(batch.commit(), TIMEOUT);
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
