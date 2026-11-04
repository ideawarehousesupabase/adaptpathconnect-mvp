import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { EmptyState, Pill, Section } from "@/components/app/ui-bits";
import { formatDateTime } from "@/lib/domain";
import { useCaseEvents } from "@/lib/workspace";

export const Route = createFileRoute("/_app/cases/$id/audit")({
  component: Audit,
});

function Audit() {
  const { id } = Route.useParams();
  const events = useCaseEvents(id);
  return (
    <Section title="Audit Trail" description="Permanent, append-only case history." action={<Pill><Lock className="h-3 w-3" /> Read-only</Pill>}>
      {events.length === 0 ? <EmptyState title="No events recorded" /> : (
        <ol className="relative ml-3 border-l-2 border-border">
          {events.map((e) => {
            const t = formatDateTime(e.at);
            return (
              <li key={e.id} className="mb-6 ml-6 last:mb-0">
                <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-mono text-xs text-muted-foreground">{t.date} · {t.time}</span>
                  <span className="font-semibold">{e.action}</span>
                </div>
                {e.detail && <p className="mt-0.5 text-sm">{e.detail}</p>}
                <p className="mt-0.5 text-sm text-muted-foreground">{e.user} — {e.role}</p>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
