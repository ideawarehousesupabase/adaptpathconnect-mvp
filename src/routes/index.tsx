import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AdaptPath OS — DFG Accessible Bathroom Case Platform" },
      { name: "description", content: "One shared case record from OT assessment to council approval for Disabled Facilities Grant bathroom adaptations." },
      { property: "og:title", content: "AdaptPath OS — DFG Accessible Bathroom Case Platform" },
      { property: "og:description", content: "One shared case record from OT assessment to council approval for DFG bathroom adaptations." },
    ],
  }),
  component: Index,
});

function Index() {
  const nav = useNavigate();
  const session = useSession();
  useEffect(() => {
    if (session !== undefined) nav({ to: session ? "/dashboard" : "/login", replace: true });
  }, [nav, session]);
  return <div className="min-h-screen bg-background" />;
}
