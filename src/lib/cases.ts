import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import {
  ADAPTATION,
  type Assessment,
  type AuditEvent,
  type CaseDerived,
  type CasePrimary,
  type DfgCase,
  type EventType,
} from "@/lib/domain";
import { ENGINE_VERSION, processCase } from "@/lib/engine";
import { RULESET } from "@/lib/rules";
import type { Session } from "@/lib/session";
import type { ReferralInput } from "@/lib/validation";
import { deleteObject, ref as storageRef } from "firebase/storage";
import { getDb, getStorageClient, withTimeout as timed } from "./firebase";

/** Who is making a change; recorded on every audit event. */
export type Actor = Pick<Session, "userId" | "fullName" | "role">;

export class CaseError extends Error {}

const SYSTEM = { user: "System (Rules Check)", role: RULESET.version };

export const casesCol = (db: Firestore, userId: string) => collection(db, "users", userId, "cases");
export const eventsCol = (db: Firestore, userId: string) => collection(db, "users", userId, "events");
export const uploadsCol = (db: Firestore, userId: string) => collection(db, "users", userId, "uploads");

const withTimeout = <T,>(p: Promise<T>) => timed(p, "The case database did not respond in time.");

/* ---------- reading ---------- */

const str = (v: unknown) => (typeof v === "string" ? v : "");

function readPrimary(id: string, data: DocumentData): CasePrimary {
  const d = data as Partial<Omit<CasePrimary, "id">>;
  return {
    id,
    applicant: str(d.applicant),
    dateOfBirth: str(d.dateOfBirth),
    address: str(d.address),
    phone: str(d.phone),
    referralDate: str(d.referralDate),
    assignedOt: str(d.assignedOt),
    localAuthority: str(d.localAuthority),
    adaptation: ADAPTATION,
    assessment: (d.assessment as Assessment | undefined) ?? null,
    design: d.design ?? null,
    costing: d.costing ?? null,
    funding: d.funding ?? null,
    decision: d.decision ?? null,
    createdAt: str(d.createdAt),
    updatedAt: str(d.updatedAt),
  };
}

/** Turns a Firestore document into a case, reusing stored engine output when it is current. */
export function hydrateCase(id: string, d: DocumentData): DfgCase {
  const primary = readPrimary(id, d);
  const stored = (d as { derived?: CaseDerived }).derived;
  const derived = stored?.engineVersion === ENGINE_VERSION ? stored : processCase(primary);
  return { ...primary, stage: derived.stage, status: derived.status, derived };
}

export function hydrateEvent(id: string, data: DocumentData): AuditEvent & { seq: number } {
  const d = data as Partial<AuditEvent & { seq: number }>;
  return {
    id,
    caseId: str(d.caseId),
    userId: str(d.userId),
    type: d.type as EventType,
    action: str(d.action),
    detail: str(d.detail),
    at: str(d.at),
    user: str(d.user),
    role: str(d.role),
    seq: typeof d.seq === "number" ? d.seq : 0,
  };
}

/* ---------- writing ---------- */

export interface EventDraft {
  type: EventType;
  action: string;
  detail?: string;
  system?: boolean;
}

/** The case document; it lives under users/{ownerUid}, and the rules check ownerUid matches. */
function stored(ownerUid: string, c: CasePrimary, derived: CaseDerived) {
  const { id: _id, ...rest } = c;
  return { ...rest, ownerUid, derived };
}

type Writer = { set: (ref: DocumentReference<DocumentData>, data: DocumentData) => unknown };

export function writeEvents(tx: Writer, db: Firestore, actor: Actor, caseId: string, at: string, drafts: EventDraft[]) {
  drafts.forEach((e, seq) => {
    tx.set(doc(eventsCol(db, actor.userId)), {
      caseId,
      userId: actor.userId,
      type: e.type,
      action: e.action,
      detail: e.detail ?? "",
      at,
      seq,
      user: e.system ? SYSTEM.user : actor.fullName,
      role: e.system ? SYSTEM.role : actor.role,
    });
  });
}

/** Everything the engine produces except workflow position, for detecting real changes. */
const substance = (d: CaseDerived) => JSON.stringify([d.needs, d.layout, d.rules, d.works, d.funding]);

/**
 * Reads a case, applies a change to its primary data, re-runs the engine and
 * writes the case and its audit events atomically.
 */
async function mutate(
  actor: Actor,
  id: string,
  change: (c: CasePrimary, derived: CaseDerived) => { next: CasePrimary; events: EventDraft[]; clearRevision?: boolean },
) {
  const db = await getDb();
  await withTimeout(runTransaction(db, async (tx) => {
    const ref = doc(casesCol(db, actor.userId), id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new CaseError("This case no longer exists.");
    const current = readPrimary(id, snap.data());
    const before = processCase(current);
    const { next, events, clearRevision } = change(current, before);
    const at = new Date().toISOString();
    next.updatedAt = at;

    // A decision stands only for the case as it was decided on.
    if (next.decision) {
      const changed = substance(processCase({ ...next, decision: null })) !== substance(before);
      if (changed || (clearRevision && next.decision.outcome === "Revision Requested")) {
        if (next.decision.outcome === "Approved") {
          events.push({ type: "case_updated", action: "Council approval reset", detail: "The case changed after approval and needs a new decision." });
        }
        next.decision = null;
      }
    }

    const after = processCase(next);
    tx.set(ref, stored(actor.userId, next, after));
    writeEvents(tx, db, actor, id, at, events);
  }));
}

/** Next DFG-YYYY-NNN reference not already used by this account. */
export function nextCaseRef(existingIds: Iterable<string>, year = new Date().getFullYear(), offset = 0) {
  const re = new RegExp(`^DFG-${year}-(\\d+)$`, "i");
  let max = 0;
  for (const id of existingIds) {
    const m = re.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `DFG-${year}-${String(max + 1 + offset).padStart(3, "0")}`;
}

function newCase(id: string, r: ReferralInput, at: string): CasePrimary {
  return {
    id,
    applicant: r.applicant,
    dateOfBirth: r.dateOfBirth,
    address: r.address,
    phone: r.phone,
    referralDate: r.referralDate,
    assignedOt: r.assignedOt,
    localAuthority: r.localAuthority,
    adaptation: ADAPTATION,
    assessment: null,
    design: null,
    costing: null,
    funding: null,
    decision: null,
    createdAt: at,
    updatedAt: at,
  };
}

/**
 * Creates cases from referrals in one transaction. Referrals without a case ID
 * get the next free DFG reference. Returns the IDs in input order.
 */
export async function createCases(actor: Actor, referrals: ReferralInput[], existingIds: string[], source = "Manual entry") {
  if (referrals.length === 0) return [];
  const db = await getDb();
  const taken = new Set(existingIds.map((x) => x.toUpperCase()));
  const ids: string[] = [];
  for (const r of referrals) {
    let id = r.id?.toUpperCase();
    if (id && taken.has(id)) throw new CaseError(`A case with ID ${id} already exists.`);
    if (!id) id = nextCaseRef([...existingIds, ...ids]);
    taken.add(id);
    ids.push(id);
  }
  await withTimeout(runTransaction(db, async (tx) => {
    const refs = ids.map((id) => doc(casesCol(db, actor.userId), id));
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const clash = snaps.find((s) => s.exists());
    if (clash) throw new CaseError(`A case with ID ${clash.id} already exists.`);
    const at = new Date().toISOString();
    referrals.forEach((r, i) => {
      const c = newCase(ids[i]!, r, at);
      tx.set(refs[i]!, stored(actor.userId, c, processCase(c)));
      writeEvents(tx, db, actor, c.id, at, [{ type: "case_created", action: "Case created", detail: source }]);
    });
  }));
  return ids;
}

export function updateReferral(actor: Actor, id: string, r: ReferralInput) {
  return mutate(actor, id, (c) => ({
    next: { ...c, ...r, id: c.id },
    events: [{ type: "case_updated", action: "Case details updated" }],
  }));
}

export function saveAssessment(actor: Actor, id: string, a: Omit<Assessment, "completedAt">) {
  return mutate(actor, id, (c) => {
    const first = c.assessment === null;
    return {
      next: { ...c, assessment: { ...a, completedAt: new Date().toISOString() } },
      events: [first
        ? { type: "assessment_completed", action: "OT assessment completed" }
        : { type: "assessment_updated", action: "OT assessment updated" }],
    };
  });
}

export function saveDesign(actor: Actor, id: string, wcX: number) {
  return mutate(actor, id, (c) => {
    if (!c.assessment) throw new CaseError("Complete the OT assessment before saving a design.");
    const version = (c.design?.version ?? 0) + 1;
    const next = { ...c, design: { wcX: Math.round(wcX), version, savedAt: new Date().toISOString() } };
    const d = processCase(next);
    const events: EventDraft[] = [{ type: "design_saved", action: version === 1 ? "Bathroom design created" : "Bathroom design updated", detail: `Version ${version}` }];
    const failing = d.rules.filter((r) => r.status === "review");
    if (failing.length) {
      events.push({ type: "accessibility_issue", action: "Accessibility issue identified", detail: failing.map((r) => r.name).join(", "), system: true });
    } else {
      events.push({ type: "design_approved", action: "Design passed all accessibility checks", detail: `${d.rules.length} checks passed`, system: true });
    }
    return { next, events, clearRevision: true };
  });
}

export function confirmCosting(actor: Actor, id: string) {
  return mutate(actor, id, (c, d) => {
    if (!d.designApproved || !d.funding) throw new CaseError("Save a design that passes every accessibility check first.");
    return {
      next: { ...c, costing: { confirmedAt: new Date().toISOString(), confirmedTotal: d.funding.total } },
      events: [{ type: "costing_confirmed", action: "Schedule of works confirmed", detail: `${d.works.length} line items` }],
      clearRevision: true,
    };
  });
}

export function completeFundingReview(actor: Actor, id: string, applicantContribution: number) {
  return mutate(actor, id, (c, d) => {
    if (!d.funding || c.costing?.confirmedTotal !== d.funding.total) throw new CaseError("Confirm the schedule of works first.");
    if (!Number.isFinite(applicantContribution) || applicantContribution < 0 || applicantContribution > d.funding.total) {
      throw new CaseError("Applicant contribution must be between £0 and the estimated cost.");
    }
    const next = { ...c, funding: { applicantContribution: Math.round(applicantContribution), reviewedAt: new Date().toISOString(), reviewedTotal: d.funding.total } };
    const f = processCase(next).funding!;
    return {
      next,
      events: [{ type: "funding_reviewed", action: "Funding assessment completed", detail: f.withinLimit ? "Within grant limit" : "Exceeds grant ceiling" }],
      clearRevision: true,
    };
  });
}

export function recordDecision(actor: Actor, id: string, outcome: "Approved" | "Revision Requested", note = "") {
  return mutate(actor, id, (c, d) => {
    if (d.stage !== "Council Approval" && !(outcome === "Revision Requested" && d.stage !== "Assessment")) {
      throw new CaseError("This case is not ready for a council decision yet.");
    }
    if (outcome === "Revision Requested" && !note.trim()) throw new CaseError("Please add a note explaining the revision.");
    return {
      next: { ...c, decision: { outcome, note: note.trim(), at: new Date().toISOString(), by: actor.fullName } },
      events: [outcome === "Approved"
        ? { type: "approval_granted", action: "Council approval granted" }
        : { type: "revision_requested", action: "Revision requested", detail: note.trim() }],
    };
  });
}

/** Removes the case, its uploaded evidence and its audit events. */
export async function deleteCase(actor: Actor, id: string) {
  const db = await getDb();
  const byCase = where("caseId", "==", id);
  const [events, uploads] = await Promise.all([
    withTimeout(getDocs(query(eventsCol(db, actor.userId), byCase))),
    withTimeout(getDocs(query(uploadsCol(db, actor.userId), byCase))),
  ]);
  if (!uploads.empty) {
    const storage = await getStorageClient();
    await Promise.all(uploads.docs.map((d) =>
      withTimeout(deleteObject(storageRef(storage, str(d.data()["storagePath"])))).catch((err: { code?: string }) => {
        if (err.code !== "storage/object-not-found") throw err;
      }),
    ));
  }
  const refs = [doc(casesCol(db, actor.userId), id), ...uploads.docs.map((d) => d.ref), ...events.docs.map((d) => d.ref)];
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach((r) => batch.delete(r));
    await withTimeout(batch.commit());
  }
}
