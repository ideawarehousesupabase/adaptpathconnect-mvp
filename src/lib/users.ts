import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { describeError, getDb, withTimeout } from "./firebase";
import { clearSession, setSession, type Session } from "./session";

export const ROLES = [
  "Occupational Therapist",
  "Council / DFG Officer",
  "HIA / Council Manager",
] as const;
export type Role = (typeof ROLES)[number];

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  password?: string;
  role: Role;
  organisation: string;
  createdAt: string;
  updatedAt: string;
}

const TIMEOUT = "The database did not respond in time.";

type Result = { ok: true } | { ok: false; error: string };

export async function registerUser(input: {
  fullName: string;
  email: string;
  password: string;
  role: Role;
  organisation: string;
}): Promise<Result> {
  const email = input.email.trim().toLowerCase();

  try {
    const db = await getDb();
    const docRef = doc(db, "users", email);

    // 1. Check if user document already exists with this ID
    const existingSnap = await withTimeout(getDoc(docRef), TIMEOUT);
    if (existingSnap.exists()) {
      return { ok: false, error: "An account with this email already exists." };
    }

    // 2. Secondary check in case existing documents used different IDs
    const usersCol = collection(db, "users");
    const qSnap = await withTimeout(getDocs(query(usersCol, where("email", "==", email))), TIMEOUT);
    if (!qSnap.empty) {
      return { ok: false, error: "An account with this email already exists." };
    }

    const now = new Date().toISOString();
    const userProfile: UserProfile = {
      id: email,
      fullName: input.fullName.trim(),
      email,
      password: input.password,
      role: input.role,
      organisation: input.organisation.trim(),
      createdAt: now,
      updatedAt: now,
    };

    await withTimeout(setDoc(docRef, userProfile), TIMEOUT);

    // Automatically establish the session so the new user is directly logged in
    const session: Session = {
      userId: userProfile.id,
      fullName: userProfile.fullName,
      email: userProfile.email,
      role: userProfile.role,
      organisation: userProfile.organisation,
    };
    setSession(session);

    return { ok: true };
  } catch (err) {
    console.error("registerUser error:", err);
    return {
      ok: false,
      error: describeError(err, "Could not create your account. Please try again."),
    };
  }
}

export async function loginUser(emailInput: string, passwordInput: string): Promise<Result> {
  const email = emailInput.trim().toLowerCase();

  try {
    const db = await getDb();

    // 1. Direct document lookup by email
    const docRef = doc(db, "users", email);
    let snap = await withTimeout(getDoc(docRef), TIMEOUT);
    let userData = snap.exists() ? (snap.data() as UserProfile) : null;

    // 2. Query lookup by email field if direct lookup didn't match
    if (!userData) {
      const qSnap = await withTimeout(getDocs(query(collection(db, "users"), where("email", "==", email))), TIMEOUT);
      if (!qSnap.empty) {
        const firstDoc = qSnap.docs[0]!;
        userData = { id: firstDoc.id, ...firstDoc.data() } as UserProfile;
      }
    }

    if (!userData) {
      return { ok: false, error: "Invalid email or password." };
    }

    if (userData.password !== passwordInput) {
      return { ok: false, error: "Invalid email or password." };
    }

    const session: Session = {
      userId: userData.id || email,
      fullName: userData.fullName || email.split("@")[0]!,
      email: userData.email || email,
      role: userData.role || "",
      organisation: userData.organisation || "",
    };

    setSession(session);
    return { ok: true };
  } catch (err) {
    console.error("loginUser error:", err);
    return {
      ok: false,
      error: describeError(err, "Could not reach the database. Please try again."),
    };
  }
}

export async function logoutUser() {
  clearSession();
}

export async function updateUserProfile(uid: string, patch: { fullName: string; organisation: string }) {
  const db = await getDb();
  const now = new Date().toISOString();
  await withTimeout(
    updateDoc(doc(db, "users", uid), {
      fullName: patch.fullName.trim(),
      organisation: patch.organisation.trim(),
      updatedAt: now,
    }),
    TIMEOUT,
  );
}
