import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, Section } from "@/components/app/ui-bits";
import { describeError } from "@/lib/firebase";
import { updateUserProfile } from "@/lib/users";
import { useCurrentUser } from "@/lib/workspace";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({
    meta: [
      { title: "Profile — AdaptPath OS" },
      { name: "description", content: "View and update your AdaptPath OS profile." },
      { property: "og:title", content: "Profile — AdaptPath OS" },
      { property: "og:description", content: "View and update your AdaptPath OS profile." },
    ],
  }),
  component: Profile,
});

function Profile() {
  // Live from users/{uid}; the session reflects saved changes on its own.
  const session = useCurrentUser();
  const [fullName, setFullName] = useState(session.fullName);
  const [organisation, setOrganisation] = useState(session.organisation);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFullName(session.fullName);
    setOrganisation(session.organisation);
  }, [session.fullName, session.organisation]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !organisation.trim()) { toast.error("Both fields are required."); return; }
    setBusy(true);
    try {
      await updateUserProfile(session.userId, { fullName, organisation });
      toast.success("Profile updated.");
    } catch (err) {
      console.error(err);
      toast.error(describeError(err, "Could not save your profile."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow="Account" title="Profile" />
      <Section>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="fn">Full Name</Label><Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="em">Email</Label><Input id="em" value={session.email} disabled /></div>
          <div className="space-y-1.5"><Label htmlFor="rl">Role</Label><Input id="rl" value={session.role} disabled /></div>
          <div className="space-y-1.5"><Label htmlFor="org">Organisation</Label><Input id="org" value={organisation} onChange={(e) => setOrganisation(e.target.value)} /></div>
          <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save Changes</Button>
        </form>
      </Section>
    </div>
  );
}
