import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "./Logo";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Logo light />
        <div className="max-w-md">
          <h2 className="text-3xl font-bold leading-tight text-sidebar-accent-foreground">
            One shared case record for every Disabled Facilities Grant bathroom adaptation.
          </h2>
          <ul className="mt-8 space-y-3 text-sm">
            {["OT assessment to council approval in one place", "Rules-based accessibility checks on every design", "Clear cost, funding and audit history"].map((t) => (
              <li key={t} className="flex items-center gap-2.5"><CheckCircle2 className="h-4 w-4 text-sidebar-primary" />{t}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-sidebar-foreground/60">Prototype for England's DFG accessible bathroom pathway.</p>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
