import { useSyncExternalStore } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getDb } from "./firebase";

export interface Session {
  /** User identifier; also the users/{uid} document ID. */
  userId: string;
  fullName: string;
  email: string;
  role: string;
  organisation: string;
}

const STORAGE_KEY = "adaptpath.session";

type State = Session | null | undefined;

let state: State = undefined;
let initialized = false;
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

let stopSnapshot: (() => void) | null = null;

function attachProfileListener(userId: string) {
  stopSnapshot?.();
  stopSnapshot = null;
  getDb()
    .then((db) => {
      stopSnapshot = onSnapshot(
        doc(db, "users", userId),
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          if (!data) return;
          const updated: Session = {
            userId,
            email: (typeof data.email === "string" ? data.email : state?.email) ?? "",
            fullName: (typeof data.fullName === "string" ? data.fullName : state?.fullName) ?? "",
            role: (typeof data.role === "string" ? data.role : state?.role) ?? "",
            organisation: (typeof data.organisation === "string" ? data.organisation : state?.organisation) ?? "",
          };
          state = updated;
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            } catch {
              /* ignore */
            }
          }
          emit(updated);
        },
        (err) => console.error("Profile snapshot error:", err),
      );
    })
    .catch(console.error);
}

export function setSession(session: Session, persist = true) {
  state = session;
  if (persist && typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      /* ignore */
    }
  }
  attachProfileListener(session.userId);
  emit(session);
}

export function clearSession() {
  stopSnapshot?.();
  stopSnapshot = null;
  state = null;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  emit(null);
}

function start() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Session;
      if (parsed && parsed.userId) {
        state = parsed;
        attachProfileListener(parsed.userId);
        emit(parsed);
        return;
      }
    }
  } catch {
    /* ignore */
  }

  emit(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
}

/** Returns undefined until session resolution on the client, then Session or null. */
export function useSession(): Session | null | undefined {
  return useSyncExternalStore(subscribe, () => state, () => undefined);
}
