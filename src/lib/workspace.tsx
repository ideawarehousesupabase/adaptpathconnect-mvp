import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import type { AuditEvent, DfgCase } from "@/lib/domain";
import { casesCol, eventsCol, hydrateCase, hydrateEvent } from "@/lib/cases";
import { describeError, getDb } from "@/lib/firebase";
import type { Session } from "@/lib/session";

interface Workspace {
  /** The signed-in user; data below belongs to this account. */
  user: Session;
  loading: boolean;
  error: string | null;
  cases: DfgCase[];
  /** Newest first. */
  events: AuditEvent[];
  retry: () => void;
}

const Ctx = createContext<Workspace | null>(null);

/**
 * Live view of the signed-in account's cases and audit events. Mounted once in
 * the app layout so every page reads the same Firestore-backed data.
 */
export function WorkspaceProvider({ user, children }: { user: Session; children: ReactNode }) {
  const userId = user.userId;
  const [cases, setCases] = useState<DfgCase[] | null>(null);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    setCases(null);
    setEvents(null);
    setError(null);
    const fail = (e: unknown) => {
      console.error(e);
      if (!cancelled) setError(describeError(e, "Could not load your cases from the database. Check your connection and try again."));
    };
    getDb()
      .then((db) => {
        if (cancelled) return;
        unsubs.push(
          onSnapshot(
            query(casesCol(db, userId), orderBy("createdAt", "desc")),
            (snap) => setCases(snap.docs.map((d) => hydrateCase(d.id, d.data()))),
            fail,
          ),
          onSnapshot(
            query(eventsCol(db, userId), orderBy("at", "desc")),
            (snap) =>
              setEvents(
                snap.docs
                  .map((d) => hydrateEvent(d.id, d.data()))
                  .sort((a, b) => b.at.localeCompare(a.at) || b.seq - a.seq)
                  .map(({ seq: _seq, ...e }) => e),
              ),
            fail,
          ),
        );
      })
      .catch(fail);
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [userId, attempt]);

  const value = useMemo<Workspace>(
    () => ({
      user,
      loading: !error && (cases === null || events === null),
      error,
      cases: cases ?? [],
      events: events ?? [],
      retry: () => setAttempt((n) => n + 1),
    }),
    [user, cases, events, error],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): Workspace {
  const ws = useContext(Ctx);
  if (!ws) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ws;
}

export function useCurrentUser(): Session {
  return useWorkspace().user;
}

export function useCase(id: string): DfgCase | undefined {
  return useWorkspace().cases.find((c) => c.id === id);
}

/** Audit events for one case, oldest first. */
export function useCaseEvents(id: string): AuditEvent[] {
  const { events } = useWorkspace();
  return useMemo(() => events.filter((e) => e.caseId === id).reverse(), [events, id]);
}
