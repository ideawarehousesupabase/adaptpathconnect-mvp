import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { DfgCase } from "@/lib/domain";

export function CaseTable({ cases, columns, empty = "No cases match your filters." }: { cases: DfgCase[]; columns: { h: string; c: (x: DfgCase) => ReactNode }[]; empty?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            {columns.map((c) => <th key={c.h} className="px-3 py-2.5 font-semibold">{c.h}</th>)}
          </tr>
        </thead>
        <tbody>
          {cases.map((x) => (
            <tr
              key={x.id}
              tabIndex={0}
              onClick={() => nav({ to: "/cases/$id", params: { id: x.id } })}
              onKeyDown={(e) => e.key === "Enter" && nav({ to: "/cases/$id", params: { id: x.id } })}
              className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted focus:bg-muted focus:outline-none"
            >
              {columns.map((c) => <td key={c.h} className="px-3 py-3">{c.c(x)}</td>)}
            </tr>
          ))}
          {cases.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-muted-foreground">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
