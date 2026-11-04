import { OPTIONS, type Assessment, type Need, type Referral } from "@/lib/domain";

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00"));
const today = () => new Date().toISOString().slice(0, 10);

export const CASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/;

export type ReferralInput = Referral & { id?: string | undefined };

export function validateReferral(input: Partial<Record<keyof ReferralInput, unknown>>): Result<ReferralInput> {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
  const r: ReferralInput = {
    applicant: s(input.applicant),
    dateOfBirth: s(input.dateOfBirth),
    address: s(input.address),
    phone: s(input.phone),
    referralDate: s(input.referralDate),
    assignedOt: s(input.assignedOt),
    localAuthority: s(input.localAuthority),
    id: s(input.id) || undefined,
  };
  const errors: string[] = [];
  if (!r.applicant) errors.push("Applicant name is required.");
  else if (r.applicant.length > 120) errors.push("Applicant name must be 120 characters or fewer.");
  if (!r.address) errors.push("Address is required.");
  else if (r.address.length > 300) errors.push("Address must be 300 characters or fewer.");
  if (r.dateOfBirth && !isDate(r.dateOfBirth)) errors.push("Date of birth must be a valid date (YYYY-MM-DD).");
  else if (r.dateOfBirth && r.dateOfBirth > today()) errors.push("Date of birth cannot be in the future.");
  if (r.phone && !/^[0-9+()\-\s]{5,30}$/.test(r.phone)) errors.push("Phone number may contain digits, spaces, +, ( ) and - only.");
  if (!r.referralDate) errors.push("Referral date is required.");
  else if (!isDate(r.referralDate)) errors.push("Referral date must be a valid date (YYYY-MM-DD).");
  if (!r.assignedOt) errors.push("Assigned OT is required.");
  if (!r.localAuthority) errors.push("Local authority is required.");
  if (r.id && !CASE_ID_PATTERN.test(r.id)) errors.push("Case ID must be 2–40 letters, digits, - or _.");
  return errors.length ? { ok: false, errors } : { ok: true, value: r };
}

export interface AssessmentForm {
  mobility: string;
  transfer: string;
  carerSupport: string;
  existingBathroom: string[];
  needs: string[];
  roomLength: string;
  roomWidth: string;
  doorWidth: string;
  rangeOfMovement: string;
  existingAdaptations: string;
  bathingRoutine: string;
  prognosis: string;
  otNotes: string;
}

export const EMPTY_ASSESSMENT: AssessmentForm = {
  mobility: "", transfer: "", carerSupport: "", existingBathroom: [], needs: [],
  roomLength: "", roomWidth: "", doorWidth: "",
  rangeOfMovement: "", existingAdaptations: "", bathingRoutine: "", prognosis: "", otNotes: "",
};

export function assessmentToForm(a: Assessment): AssessmentForm {
  return { ...a, roomLength: String(a.roomLength), roomWidth: String(a.roomWidth), doorWidth: String(a.doorWidth) };
}

const MEASURES = {
  roomLength: { label: "Room length", min: 1200, max: 8000 },
  roomWidth: { label: "Room width", min: 1200, max: 8000 },
  doorWidth: { label: "Door width", min: 500, max: 1500 },
} as const;

export function validateAssessment(f: AssessmentForm): Result<Omit<Assessment, "completedAt">> {
  const errors: string[] = [];
  const pick = <T extends string>(v: string, opts: readonly T[], label: string) => {
    if (!opts.includes(v as T)) errors.push(`${label} is required.`);
    return v as T;
  };
  const mobility = pick(f.mobility, OPTIONS.mobility, "Applicant mobility");
  const transfer = pick(f.transfer, OPTIONS.transfer, "Transfer ability");
  const carerSupport = pick(f.carerSupport, OPTIONS.carerSupport, "Carer support");
  const nums = {} as Record<keyof typeof MEASURES, number>;
  for (const [k, m] of Object.entries(MEASURES) as [keyof typeof MEASURES, (typeof MEASURES)[keyof typeof MEASURES]][]) {
    const raw = f[k].trim();
    const n = Number(raw);
    if (!raw) errors.push(`${m.label} is required.`);
    else if (!Number.isInteger(n) || n < m.min || n > m.max) errors.push(`${m.label} must be a whole number between ${m.min} and ${m.max} mm.`);
    nums[k] = n;
  }
  const text = (v: string, label: string) => {
    if (v.length > 2000) errors.push(`${label} must be 2000 characters or fewer.`);
    return v.trim();
  };
  const value = {
    mobility, transfer, carerSupport,
    existingBathroom: f.existingBathroom.filter((x) => (OPTIONS.existingBathroom as readonly string[]).includes(x)),
    needs: f.needs.filter((x): x is Need => (OPTIONS.needs as readonly string[]).includes(x)),
    ...nums,
    rangeOfMovement: text(f.rangeOfMovement, "Range of movement"),
    existingAdaptations: text(f.existingAdaptations, "Existing adaptations"),
    bathingRoutine: text(f.bathingRoutine, "Bathing routine"),
    prognosis: text(f.prognosis, "Prognosis notes"),
    otNotes: text(f.otNotes, "OT notes"),
  };
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/* ---------- CSV import of referrals ---------- */

export const CSV_COLUMNS = ["applicant", "dateOfBirth", "address", "phone", "referralDate", "assignedOt", "localAuthority", "caseId"] as const;
export const CSV_REQUIRED = ["applicant", "address", "referralDate", "assignedOt", "localAuthority"] as const;
export const CSV_MAX_ROWS = 200;

/** RFC 4180-style parser: quoted fields, escaped quotes, CRLF or LF line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Validates a referrals CSV. Returns every row error so the file can be fixed in one pass. */
export function parseReferralCsv(text: string): Result<ReferralInput[]> {
  const rows = parseCsv(text);
  if (rows.length === 0) return { ok: false, errors: ["The file is empty."] };
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const index = Object.fromEntries(CSV_COLUMNS.map((c) => [c, header.indexOf(c.toLowerCase())])) as Record<(typeof CSV_COLUMNS)[number], number>;
  const missing = CSV_REQUIRED.filter((c) => index[c] < 0);
  if (missing.length) return { ok: false, errors: [`Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`] };
  const body = rows.slice(1);
  if (body.length === 0) return { ok: false, errors: ["The file has a header row but no referrals."] };
  if (body.length > CSV_MAX_ROWS) return { ok: false, errors: [`Import up to ${CSV_MAX_ROWS} referrals at a time (file has ${body.length}).`] };

  const errors: string[] = [];
  const out: ReferralInput[] = [];
  const seen = new Set<string>();
  body.forEach((cells, i) => {
    const cell = (c: (typeof CSV_COLUMNS)[number]) => (index[c] >= 0 ? cells[index[c]] ?? "" : "");
    const res = validateReferral({
      applicant: cell("applicant"), dateOfBirth: cell("dateOfBirth"), address: cell("address"), phone: cell("phone"),
      referralDate: cell("referralDate"), assignedOt: cell("assignedOt"), localAuthority: cell("localAuthority"), id: cell("caseId"),
    });
    if (!res.ok) { errors.push(...res.errors.map((e) => `Row ${i + 2}: ${e}`)); return; }
    if (res.value.id) {
      const key = res.value.id.toUpperCase();
      if (seen.has(key)) { errors.push(`Row ${i + 2}: Case ID ${res.value.id} appears more than once.`); return; }
      seen.add(key);
    }
    out.push(res.value);
  });
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

export function csvTemplate() {
  return `${CSV_COLUMNS.join(",")}\n`;
}
