import { cn } from "@/lib/utils";

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className={cn("grid h-9 w-9 place-items-center rounded-lg", light ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-primary text-primary-foreground")}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 20V10l8-6 8 6v10" />
          <path d="M9 20v-5h6v5" />
        </svg>
      </div>
      <div className="leading-tight">
        <p className={cn("text-base font-bold", light ? "text-sidebar-accent-foreground" : "text-foreground")}>AdaptPath <span className={light ? "text-sidebar-primary" : "text-primary"}>OS</span></p>
        <p className={cn("text-[10px] font-medium uppercase tracking-wider", light ? "text-sidebar-foreground/70" : "text-muted-foreground")}>DFG Case Platform</p>
      </div>
    </div>
  );
}
