import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/app/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { registerUser, ROLES, type Role } from "@/lib/users";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create account — AdaptPath OS" },
      { name: "description", content: "Register as an OT, DFG officer or HIA manager on AdaptPath OS." },
      { property: "og:title", content: "Create account — AdaptPath OS" },
      { property: "og:description", content: "Register as an OT, DFG officer or HIA manager on AdaptPath OS." },
    ],
  }),
  component: RegisterPage,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function RegisterPage() {
  const nav = useNavigate();
  const [f, setF] = useState({ fullName: "", email: "", password: "", confirm: "", role: "" as Role | "", organisation: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (Object.values(f).some((v) => !v.trim())) return setError("All fields are required.");
    if (!EMAIL_RE.test(f.email.trim())) return setError("Please enter a valid email address.");
    if (f.password.length < 8) return setError("Password must be at least 8 characters.");
    if (f.password !== f.confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      const res = await registerUser({ fullName: f.fullName, email: f.email, password: f.password, role: f.role as Role, organisation: f.organisation });
      if (!res.ok) return setError(res.error);
      toast.success("Account created successfully.");
      nav({ to: "/login" });
    } catch (err) {
      console.error(err);
      setError("Could not reach the account service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="For OTs, council DFG officers and HIA managers.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5"><Label htmlFor="fn">Full Name</Label><Input id="fn" value={f.fullName} onChange={set("fullName")} /></div>
        <div className="space-y-1.5"><Label htmlFor="em">Email Address</Label><Input id="em" type="email" value={f.email} onChange={set("email")} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="pw">Password</Label><Input id="pw" type="password" value={f.password} onChange={set("password")} /></div>
          <div className="space-y-1.5"><Label htmlFor="cpw">Confirm Password</Label><Input id="cpw" type="password" value={f.confirm} onChange={set("confirm")} /></div>
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v as Role })}>
            <SelectTrigger aria-label="Role"><SelectValue placeholder="Select your role" /></SelectTrigger>
            <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="org">Organisation Name</Label><Input id="org" value={f.organisation} onChange={set("organisation")} /></div>
        {error && <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Create Account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already registered? <Link to="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
