import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { ErrorState, LoadingState, StatusPill } from "@/components/app/ui-bits";
import { useCase, useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_app/cases/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.id} — AdaptPath OS` },
      { name: "description", content: `Case record ${params.id} for an accessible bathroom DFG adaptation.` },
      { property: "og:title", content: `${params.id} — AdaptPath OS` },
      { property: "og:description", content: `Case record ${params.id} for an accessible bathroom DFG adaptation.` },
    ],
  }),
  component: CaseLayout,
});

const tabs = [
  { to: "/cases/$id", label: "Overview", exact: true },
  { to: "/cases/$id/assessment", label: "OT Assessment" },
  { to: "/cases/$id/needs", label: "Needs Profile" },
  { to: "/cases/$id/design", label: "Bathroom Design" },
  { to: "/cases/$id/preview", label: "3D Preview" },
  { to: "/cases/$id/funding", label: "Cost & Funding" },
  { to: "/cases/$id/approval", label: "Approval" },
  { to: "/cases/$id/audit", label: "Audit Trail" },
] as const;

function CaseLayout() {
  const { id } = Route.useParams();
  const { loading, error, retry } = useWorkspace();
  const c = useCase(id);
  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (loading) return <LoadingState label="Loading case…" />;
  if (!c) {
    return (
      <div className="card-surface p-10 text-center">
        <p className="font-semibold">Case {id} was not found.</p>
        <Link to="/cases" className="mt-3 inline-block text-sm font-semibold text-primary">Back to cases</Link>
      </div>
    );
  }
  return (
    <>
      <Link to="/cases" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" /> All cases</Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{c.applicant}</h1>
        <span className="font-mono text-sm text-muted-foreground">{c.id}</span>
        <StatusPill status={c.status} />
        <span className="text-sm text-muted-foreground">· {c.adaptation} · {c.stage}</span>
      </div>
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            params={{ id }}
            activeOptions={{ exact: "exact" in t }}
            className="-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "border-primary! text-primary!" }}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </>
  );
}
