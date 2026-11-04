import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { getFirebaseApiKey } from "./firebase-config.functions";

/*
 * Local development against the Firebase emulators, e.g.
 *   VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
 *   VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8085
 *   VITE_FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
 */
const env = (k: string) => (import.meta.env[k] as string | undefined) || undefined;
const hostPort = (v: string) => {
  const [host, port] = v.split(":");
  return [host!, Number(port)] as const;
};

let appPromise: Promise<FirebaseApp> | null = null;
let dbPromise: Promise<Firestore> | null = null;
let authPromise: Promise<Auth> | null = null;
let storagePromise: Promise<FirebaseStorage> | null = null;

async function resolveApiKey(): Promise<string> {
  const fromEnv = env("VITE_FIREBASE_API_KEY");
  if (fromEnv) return fromEnv;
  const { apiKey } = await getFirebaseApiKey();
  if (!apiKey) throw new Error("Firebase API key is not configured.");
  return apiKey;
}

/** Retries on the next call if initialisation failed. */
function once<T>(get: () => Promise<T> | null, set: (p: Promise<T> | null) => void, init: () => Promise<T>): Promise<T> {
  let p = get();
  if (!p) {
    p = init().catch((e) => {
      set(null);
      throw e;
    });
    set(p);
  }
  return p;
}

export function getFirebaseApp(): Promise<FirebaseApp> {
  return once(() => appPromise, (p) => (appPromise = p), async () => {
    const apiKey = await resolveApiKey();
    return (
      getApps()[0] ??
      initializeApp({
        apiKey,
        authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"],
        projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"],
        storageBucket: import.meta.env["VITE_FIREBASE_STORAGE_BUCKET"],
        messagingSenderId: import.meta.env["VITE_FIREBASE_MESSAGING_SENDER_ID"],
        appId: import.meta.env["VITE_FIREBASE_APP_ID"],
        measurementId: import.meta.env["VITE_FIREBASE_MEASUREMENT_ID"],
      })
    );
  });
}

export function getDb(): Promise<Firestore> {
  return once(() => dbPromise, (p) => (dbPromise = p), async () => {
    const app = await getFirebaseApp();
    let db: Firestore;
    try {
      db = initializeFirestore(app, { ignoreUndefinedProperties: true });
    } catch {
      // Already initialised (e.g. after a hot reload).
      return getFirestore(app);
    }
    const emulator = env("VITE_FIRESTORE_EMULATOR_HOST");
    if (emulator) connectFirestoreEmulator(db, ...hostPort(emulator));
    return db;
  });
}

export function getAuthClient(): Promise<Auth> {
  return once(() => authPromise, (p) => (authPromise = p), async () => {
    const auth = getAuth(await getFirebaseApp());
    const emulator = env("VITE_FIREBASE_AUTH_EMULATOR_HOST");
    if (emulator && !auth.emulatorConfig) connectAuthEmulator(auth, `http://${emulator}`, { disableWarnings: true });
    return auth;
  });
}

export function getStorageClient(): Promise<FirebaseStorage> {
  return once(() => storagePromise, (p) => (storagePromise = p), async () => {
    const storage = getStorage(await getFirebaseApp());
    const emulator = env("VITE_FIREBASE_STORAGE_EMULATOR_HOST");
    if (emulator) connectStorageEmulator(storage, ...hostPort(emulator));
    return storage;
  });
}

export function withTimeout<T>(p: Promise<T>, message: string, ms = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<T>((_, rej) => {
      timer = setTimeout(() => rej(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** A message people can act on for Firebase failures that are not their own input errors. */
export function describeError(err: unknown, fallback: string): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  const message = (err as { message?: string } | null)?.message ?? "";
  if (/suspended/i.test(message)) {
    return "The Firebase project for AdaptPath OS has been suspended by Google, so records cannot be read or saved. Contact the project owner.";
  }
  if (code.endsWith("permission-denied") || code === "storage/unauthorized" || /missing or insufficient permissions/i.test(message)) {
    return "Permission denied by Firestore. In Firebase Console → Firestore Database → Rules, make sure read and write are allowed.";
  }
  if (code.endsWith("not-found") || /database .* not found/i.test(message) || /does not exist/i.test(message)) {
    return "Cloud Firestore database has not been created yet in project apathpath-ea527. Go to Firebase Console → Firestore Database → Create database.";
  }
  if (code.endsWith("unauthenticated") || code === "storage/unauthenticated") {
    return "Your session has expired. Sign in again.";
  }
  if (code.endsWith("unavailable") || /failed to get document because the client is offline/i.test(message) || code === "auth/network-request-failed" || code === "storage/retry-limit-exceeded" || /did not respond in time/.test(message)) {
    return "Could not reach the database. Check your internet connection or Firestore setup and try again.";
  }
  return fallback;
}
