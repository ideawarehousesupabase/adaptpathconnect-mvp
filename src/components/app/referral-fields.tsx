import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReferralInput } from "@/lib/validation";

export type ReferralForm = Required<Omit<ReferralInput, "id">> & { id: string };

/** Applicant and case detail field groups shared by Create Case and Edit Details. */
export function referralFields({ f, set, otSuggestions, idPlaceholder, showId = true }: {
  f: ReferralForm;
  set: (k: keyof ReferralForm, v: string) => void;
  otSuggestions: string[];
  idPlaceholder?: string;
  showId?: boolean;
}) {
  const field = (k: keyof ReferralForm, label: string, type = "text", extra?: { ph?: string | undefined; list?: string }) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} type={type} placeholder={extra?.ph} list={extra?.list} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );
  return {
    applicant: (
      <div className="grid gap-4 sm:grid-cols-2">
        {field("applicant", "Applicant Name")}
        {field("dateOfBirth", "Date of Birth", "date")}
        <div className="sm:col-span-2">{field("address", "Address")}</div>
        {field("phone", "Phone Number", "tel")}
      </div>
    ),
    caseDetails: (
      <div className="grid gap-4 sm:grid-cols-2">
        {showId && field("id", "Case ID", "text", { ph: idPlaceholder })}
        {field("referralDate", "Referral Date", "date")}
        {field("assignedOt", "Assigned OT", "text", { ph: "Name of the assessing OT", list: "ot-suggestions" })}
        <datalist id="ot-suggestions">{otSuggestions.map((o) => <option key={o} value={o} />)}</datalist>
        {field("localAuthority", "Local Authority")}
      </div>
    ),
  };
}
