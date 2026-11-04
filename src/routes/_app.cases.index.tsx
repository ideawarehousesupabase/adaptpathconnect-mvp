import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CaseTable } from "@/components/app/CaseTable";
import { EmptyState, ErrorState, LoadingState, PageHeader, Section, StatusPill } from "@/components/app/ui-bits";
import { formatDate, STAGES, STATUSES } from "@/lib/domain";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_app/cases/")({
  head: () => ({
    meta: [
      { title: "Cases — AdaptPath OS" },
      { name: "description", content: "Search and filter DFG accessible bathroom cases." },
      { property: "og:title", content: "Cases — AdaptPath OS" },
      { property: "og:description", content: "Search and filter DFG accessible bathroom cases." },
    ],
  }),
  component: CasesPage,
});

function CasesPage() {
  const { cases, loading, error, retry } = useWorkspace();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [stage, setStage] = useState("all");
  const filtered = useMemo(
    () =>
      cases.filter(
        (c) =>
          (status === "all" || c.status === status) &&
          (stage === "all" || c.stage === stage) &&
          (c.applicant + c.id + c.assignedOt).toLowerCase().includes(q.toLowerCase()),
      ),
    [cases, q, status, stage],
  );

  return (
    <>
      <PageHeader eyebrow="Cases" title="DFG Cases" subtitle="All accessible bathroom adaptation cases." actions={<Button asChild><Link to="/cases/new"><Plus className="h-4 w-4" /> Create Case</Link></Button>} />
      {error ? <ErrorState message={error} onRetry={retry} /> : (
      <Section>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search applicant, case ID or OT" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-48" aria-label="Status filter"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger className="w-48" aria-label="Stage filter"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All stages</SelectItem>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {loading ? <LoadingState label="Loading cases…" /> : (
        <CaseTable
          cases={filtered}
          empty={cases.length === 0
            ? <EmptyState title="No cases yet" body="Create a case or import referrals from a CSV file to get started." action={<Button asChild size="sm"><Link to="/cases/new"><Plus className="h-4 w-4" /> Create Case</Link></Button>} className="py-0" />
            : "No cases match your filters."}
          columns={[
            { h: "Case ID", c: (x) => <span className="font-mono text-xs font-medium text-primary">{x.id}</span> },
            { h: "Applicant", c: (x) => <span className="font-medium">{x.applicant}</span> },
            { h: "Referral Date", c: (x) => formatDate(x.referralDate) },
            { h: "Assigned OT", c: (x) => x.assignedOt },
            { h: "Local Authority", c: (x) => x.localAuthority },
            { h: "Stage", c: (x) => x.stage },
            { h: "Status", c: (x) => <StatusPill status={x.status} /> },
            { h: "View", c: () => <span className="text-sm font-semibold text-primary">View →</span> },
          ]}
        />
        )}
      </Section>
      )}
    </>
  );
}
