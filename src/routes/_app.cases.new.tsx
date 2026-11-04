import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Download, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader, Pill, Section } from "@/components/app/ui-bits";
import { referralFields, type ReferralForm } from "@/components/app/referral-fields";
import { CaseError, createCases, nextCaseRef } from "@/lib/cases";
import { describeError } from "@/lib/firebase";
import { CSV_COLUMNS, CSV_REQUIRED, csvTemplate, parseReferralCsv, validateReferral, type ReferralInput } from "@/lib/validation";
import { useCurrentUser, useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_app/cases/new")({
  head: () => ({
    meta: [
      { title: "Create Case — AdaptPath OS" },
      { name: "description", content: "Open a new DFG accessible bathroom case." },
      { property: "og:title", content: "Create Case — AdaptPath OS" },
      { property: "og:description", content: "Open a new DFG accessible bathroom case." },
    ],
  }),
  component: NewCase,
});

const saveError = (err: unknown) => {
  console.error(err);
  return err instanceof CaseError ? err.message : describeError(err, "Could not save to the database. Try again.");
};

function NewCase() {
  const nav = useNavigate();
  const session = useCurrentUser();
  const { cases, loading } = useWorkspace();
  const ids = useMemo(() => cases.map((c) => c.id), [cases]);
  const otSuggestions = useMemo(
    () => [...new Set([...(session.role === "Occupational Therapist" ? [session.fullName] : []), ...cases.map((c) => c.assignedOt)])].filter(Boolean),
    [cases, session],
  );
  const [f, setF] = useState<ReferralForm>({
    applicant: "", dateOfBirth: "", address: "", phone: "", id: "",
    referralDate: new Date().toISOString().slice(0, 10),
    assignedOt: session.role === "Occupational Therapist" ? session.fullName : "",
    localAuthority: session.organisation,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const groups = referralFields({ f, set: (k, v) => setF({ ...f, [k]: v }), otSuggestions, idPlaceholder: `${nextCaseRef(ids)} (automatic)` });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = validateReferral(f);
    if (!res.ok) return setErrors(res.errors);
    setErrors([]);
    setBusy(true);
    try {
      const [id] = await createCases(session, [res.value], ids);
      toast.success(`Case ${id} created.`);
      nav({ to: "/cases/$id", params: { id: id! } });
    } catch (err) {
      setErrors([saveError(err)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <form onSubmit={submit} className="space-y-5">
        <PageHeader eyebrow="Cases" title="Create Case" subtitle="Enter the referral. Needs, design, costs and funding are generated as the case progresses." />
        <Section title="Applicant Details">{groups.applicant}</Section>
        <Section title="Case Details">{groups.caseDetails}</Section>
        <Section title="Adaptation Type">
          <Pill t="info" className="text-sm">Accessible Bathroom</Pill>
          <p className="mt-2 text-sm text-muted-foreground">This MVP supports the accessible bathroom pathway only.</p>
        </Section>
        {errors.length > 0 && (
          <ul role="alert" className="space-y-1 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
            {errors.map((x) => <li key={x}>{x}</li>)}
          </ul>
        )}
        <Button type="submit" size="lg" disabled={busy || loading}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Create Case</Button>
      </form>
      <CsvImport ids={ids} disabled={loading} />
    </div>
  );
}

function CsvImport({ ids, disabled }: { ids: string[]; disabled: boolean }) {
  const session = useCurrentUser();
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState("");
  const [rows, setRows] = useState<ReferralInput[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    setRows([]);
    setErrors([]);
    if (!picked) return;
    setFile(picked.name);
    if (!/\.csv$/i.test(picked.name)) return setErrors(["Choose a .csv file."]);
    if (picked.size > 1_000_000) return setErrors(["The file is larger than 1 MB."]);
    const res = parseReferralCsv(await picked.text());
    if (!res.ok) return setErrors(res.errors);
    const taken = new Set(ids.map((x) => x.toUpperCase()));
    const clashes = res.value.filter((r) => r.id && taken.has(r.id.toUpperCase())).map((r) => r.id);
    if (clashes.length) return setErrors([`These case IDs already exist: ${clashes.join(", ")}.`]);
    setRows(res.value);
  }

  async function importRows() {
    setBusy(true);
    try {
      const created = await createCases(session, rows, ids, `Imported from ${file}`);
      toast.success(`${created.length} case${created.length === 1 ? "" : "s"} imported.`);
      nav({ to: "/cases" });
    } catch (err) {
      setErrors([saveError(err)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Import Referrals from CSV"
      description="Create several cases at once. The file holds referral details only; everything else is generated per case."
      action={
        <Button asChild variant="outline" size="sm">
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvTemplate())}`} download="referrals-template.csv"><Download className="h-4 w-4" /> Template</a>
        </Button>
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Columns: {CSV_COLUMNS.map((c, i) => <span key={c}>{i > 0 && ", "}<code className={CSV_REQUIRED.includes(c as (typeof CSV_REQUIRED)[number]) ? "font-semibold text-foreground" : ""}>{c}</code></span>)}.
        Bold columns are required; dates use YYYY-MM-DD; a blank caseId gets the next DFG reference.
      </p>
      <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={pick} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={disabled || busy}><FileUp className="h-4 w-4" /> Choose CSV file</Button>
        {file && <span className="text-sm text-muted-foreground">{file}</span>}
      </div>
      {errors.length > 0 && (
        <ul role="alert" className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
          {errors.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
      {rows.length > 0 && (
        <div className="mt-4 rounded-lg border border-border p-3">
          <p className="text-sm"><span className="font-semibold">{rows.length}</span> valid referral{rows.length === 1 ? "" : "s"}: {rows.slice(0, 5).map((r) => r.applicant).join(", ")}{rows.length > 5 && ` and ${rows.length - 5} more`}.</p>
          <Button className="mt-3" onClick={importRows} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Import {rows.length} case{rows.length === 1 ? "" : "s"}</Button>
        </div>
      )}
    </Section>
  );
}
