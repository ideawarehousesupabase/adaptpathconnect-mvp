import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LayoutDashboard, FolderOpen, BarChart3, UserRound, LogOut } from "lucide-react";
import { Logo } from "@/components/app/Logo";
import { toast } from "sonner";
import { useSession } from "@/lib/session";
import { logoutUser } from "@/lib/users";
import { WorkspaceProvider } from "@/lib/workspace";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/cases", label: "Cases", icon: FolderOpen },
  { to: "/pilot-metrics", label: "Pilot Metrics", icon: BarChart3 },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;

function AppLayout() {
  const session = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (session === null) navigate({ to: "/login", replace: true });
  }, [session, navigate]);

  if (!session) return <div className="min-h-screen bg-background" />;

  const logout = () => {
    logoutUser().catch((err) => {
      console.error(err);
      toast.error("Could not sign out. Try again.");
    });
  };

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-sidebar px-3 py-5 text-sidebar-foreground">
        <Logo light className="px-2" />
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
          <button onClick={logout} className="flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </nav>
        <div className="rounded-lg border border-sidebar-border p-3">
          <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">{session.fullName}</p>
          <p className="truncate text-xs">{session.role}</p>
          <p className="truncate text-xs opacity-70">{session.organisation}</p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-6 py-7 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <WorkspaceProvider user={session}>
            <Outlet />
          </WorkspaceProvider>
        </div>
      </main>
    </div>
  );
}
