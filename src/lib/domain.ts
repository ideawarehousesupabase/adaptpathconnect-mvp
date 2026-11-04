/**
 * Shared domain model for DFG accessible bathroom cases.
 *
 * Firestore layout (all case data is scoped to the signed-in user's account):
 *   users/{userId}                       account record (see users.ts)
 *   users/{userId}/cases/{caseRef}       primary case data + `derived` engine output
 *   users/{userId}/events/{eventId}      append-only audit events, linked by `caseId`
 *   users/{userId}/uploads/{uploadId}    metadata for evidence files held in Cloud Storage
 *                                        at users/{userId}/cases/{caseRef}/{uploadId}-{fileName}
 *
 * {userId} is the Firebase Authentication UID; Firestore and Storage security
 * rules only let that signed-in user read or write anything under it.
 *
 * Primary data is what people type in (referral, OT assessment, design edits,
 * applicant contribution, council decision). Everything else — needs profile,
 * layout, accessibility checks, schedule of works, funding position, stage and
 * status — is produced by `processCase()` in `src/lib/engine`.
 */

export const STAGES = ["Assessment", "Design", "Costing", "Funding Review", "Council Approval", "Approved"] as const;
export type Stage = (typeof STAGES)[number];

export const STATUSES = ["In Progress", "Pending", "Approved", "Revision Requested"] as const;
export type CaseStatus = (typeof STATUSES)[number];

export const ADAPTATION = "Accessible Bathroom" as const;

export const OPTIONS = {
  mobility: ["Independent", "Walking Aid", "Wheelchair"],
  transfer: ["Independent", "Assisted", "Carer Required"],
  carerSupport: ["Yes", "No"],
  existingBathroom: ["Bath", "Shower", "Toilet", "Basin"],
  needs: [
    "Level-access shower required",
    "Shower seat required",
    "Grab rails required",
    "Accessible WC required",
    "Accessible basin required",
  ],
} as const;

export type Mobility = (typeof OPTIONS.mobility)[number];
export type Transfer = (typeof OPTIONS.transfer)[number];
export type Need = (typeof OPTIONS.needs)[number];

/* ---------- primary data ---------- */

export interface Referral {
  applicant: string;
  dateOfBirth: string;
  address: string;
  phone: string;
  referralDate: string;
  assignedOt: string;
  localAuthority: string;
}

export interface Assessment {
  mobility: Mobility;
  transfer: Transfer;
  carerSupport: "Yes" | "No";
  existingBathroom: string[];
  needs: Need[];
  /** millimetres */
  roomLength: number;
  roomWidth: number;
  doorWidth: number;
  rangeOfMovement: string;
  existingAdaptations: string;
  bathingRoutine: string;
  prognosis: string;
  otNotes: string;
  completedAt: string;
}

/** The only layout values a person edits; the rest of the plan is generated. */
export interface DesignInput {
  wcX: number;
  version: number;
  savedAt: string;
}

export interface CostingInput {
  confirmedAt: string;
  /** Total at confirmation; a later change to the derived total re-opens costing. */
  confirmedTotal: number;
}

export interface FundingInput {
  applicantContribution: number;
  reviewedAt: string;
  reviewedTotal: number;
}

export interface Decision {
  outcome: "Approved" | "Revision Requested";
  note: string;
  at: string;
  by: string;
}

export interface CasePrimary extends Referral {
  id: string;
  adaptation: typeof ADAPTATION;
  assessment: Assessment | null;
  design: DesignInput | null;
  costing: CostingInput | null;
  funding: FundingInput | null;
  decision: Decision | null;
  createdAt: string;
  updatedAt: string;
}

/* ---------- derived data ---------- */

export type FeatureId = "shower" | "seat" | "rails" | "wc" | "basin" | "circulation" | "door" | "bathRemoval";

export interface NeedsFeature {
  id: FeatureId;
  name: string;
  source: string;
}

export interface NeedsProfile {
  mobility: string;
  transfer: string;
  carer: string;
  priority: string;
  features: NeedsFeature[];
}

export type ComponentKey = "shower" | "wc" | "basin" | "rail" | "seat" | "door";

export interface PlacedComponent {
  key: ComponentKey;
  label: string;
  x: number; // mm from left wall
  y: number; // mm from top wall
  w: number;
  d: number;
  detail: string;
}

export interface BathroomLayout {
  name: string;
  roomW: number;
  roomD: number;
  turningDiameter: number;
  turningCentre: { x: number; y: number };
  basinProjection: number;
  showerThreshold: number;
  levelAccess: boolean;
  /** Bounds the WC can be moved within (mm from left wall). */
  wcRange: { min: number; max: number };
  /** Which accessibility checks apply, from the applicant's assessed needs. */
  requirements: {
    turningSpace: boolean;
    wcTransfer: boolean;
    levelShower: boolean;
    seatedReach: boolean;
    minDoorWidth: number;
  };
  components: PlacedComponent[];
}

export type RuleStatus = "passed" | "review";

export interface RuleResult {
  id: string;
  name: string;
  category: string;
  status: RuleStatus;
  measured: string;
  required: string;
  message: string;
}

export interface WorkItem {
  item: string;
  qty: number | null;
  cost: number;
  fromDesign: boolean;
}

export interface FundingPosition {
  total: number;
  applicant: number;
  dfg: number;
  ceiling: number;
  withinLimit: boolean;
}

export interface Suggestion {
  wcX: number;
  message: string;
}

export interface CaseDerived {
  engineVersion: string;
  stage: Stage;
  status: CaseStatus;
  needs: NeedsProfile | null;
  layout: BathroomLayout | null;
  rules: RuleResult[];
  rulesPassed: number;
  rulesReview: number;
  suggestion: Suggestion | null;
  designApproved: boolean;
  works: WorkItem[];
  funding: FundingPosition | null;
}

export interface DfgCase extends CasePrimary {
  stage: Stage;
  status: CaseStatus;
  derived: CaseDerived;
}

/* ---------- audit ---------- */

export const EVENT_TYPES = [
  "case_created",
  "case_updated",
  "assessment_completed",
  "assessment_updated",
  "design_saved",
  "accessibility_issue",
  "design_approved",
  "costing_confirmed",
  "funding_reviewed",
  "approval_granted",
  "revision_requested",
  "evidence_uploaded",
  "evidence_removed",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface AuditEvent {
  id: string;
  caseId: string;
  /** Firebase Authentication UID of the person who made the change. */
  userId: string;
  type: EventType;
  action: string;
  detail: string;
  at: string;
  user: string;
  role: string;
}

/* ---------- formatting ---------- */

export function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "—", time: "" };
  return {
    date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  };
}

export const gbp = (n: number) =>
  n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
