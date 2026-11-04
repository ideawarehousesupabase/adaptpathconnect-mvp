import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderOpen, ClipboardList, PenTool, PoundSterling, Hourglass, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaseTable } from "@/components/app/CaseTable";
import { EmptyState, ErrorState, LoadingState, PageHeader, Section, StatusPill } from "@/components/app/ui-bits";
import type { DfgCase, Stage } from "@/lib/domain";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — AdaptPath OS" },
      { name: "description", content: "Overview of DFG accessible bathroom cases by stage." },
      { property: "og:title", content: "Dashboard — AdaptPath OS" },
      { property: "og:description", content: "Overview of DFG accessible bathroom cases by stage." },
    ],
  }),
  component: Dashboard,
});

const STATS: { label: string; icon: typeof FolderOpen; stages: Stage[] | null }[] = [
  { label: "Total Cases", icon: FolderOpen, stages: null },
  { label: "Assessments Pending", icon: ClipboardList, stages: ["Assessment"] },
  { label: "Designs In Progress", icon: PenTool, stages: ["Design"] },
  { label: "Awaiting Funding Review", icon: PoundSterling, stages: ["Costing", "Funding Review"] },
  { label: "Awaiting Approval", icon: Hourglass, stages: ["Council Approval"] },
  { label: "Approved Cases", icon: BadgeCheck, stages: ["Approved"] },
];

const count = (cases: DfgCase[], stages: Stage[] | null) => (stages ? cases.filter((c) => stages.includes(c.stage)).length : cases.length);

function Dashboard() {
  const { user: session, cases, loading, error, retry } = useWorkspace();
  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title={`Good day, ${session.fullName.split(" ")[0]}`}
        subtitle="Accessible bathroom DFG cases in your caseload."
        actions={<Button asChild><Link to="/cases/new">Create Case</Link></Button>}
      />
      {error ? <ErrorState message={error} onRetry={retry} /> : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {STATS.map(({ label, icon: Icon, stages }) => (
              <div key={label} className="card-surface flex items-center gap-4 p-5">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-secondary text-primary"><Icon className="h-5 w-5" /></div>
                <div>
                  <p className="tabular text-2xl font-bold">{loading ? "–" : count(cases, stages)}</p>
                  <p className="text-sm text-muted-foreground">{label}</p>
                </div>
              </div>
            ))}
          </div>
          <Section title="Recent Cases" description="Select a case to open its record.">
            {loading ? <LoadingState label="Loading cases…" /> : cases.length === 0 ? (
              <EmptyState
                title="No cases yet"
                body="Create a case from a referral, or import several from a CSV file. Stages and statuses here update as each case moves through assessment, design, funding and approval."
                action={<Button asChild><Link to="/cases/new">Create your first case</Link></Button>}
              />
            ) : (
              <CaseTable
                cases={cases.slice(0, 6)}
                columns={[
                  { h: "Case ID", c: (x) => <span className="font-mono text-xs font-medium text-primary">{x.id}</span> },
                  { h: "Applicant", c: (x) => <span className="font-medium">{x.applicant}</span> },
                  { h: "Adaptation", c: (x) => x.adaptation },
                  { h: "Assigned OT", c: (x) => x.assignedOt },
                  { h: "Current Stage", c: (x) => x.stage },
                  { h: "Status", c: (x) => <StatusPill status={x.status} /> },
                ]}
              />
            )}
          </Section>
        </>
      )}
    </>
  );
}
