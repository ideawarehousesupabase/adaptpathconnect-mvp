import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/app/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginUser } from "@/lib/users";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — AdaptPath OS" },
      { name: "description", content: "Sign in to AdaptPath OS, the DFG accessible bathroom case platform." },
      { property: "og:title", content: "Sign in — AdaptPath OS" },
      { property: "og:description", content: "Sign in to AdaptPath OS, the DFG accessible bathroom case platform." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !password) return setError("Please enter your email and password.");
    setBusy(true);
    try {
      const res = await loginUser(email, password);
      if (!res.ok) return setError(res.error);
      nav({ to: "/dashboard" });
    } catch (err) {
      console.error(err);
      setError("Could not reach the account service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="Access your DFG caseload.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email Address</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign In
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to AdaptPath OS? <Link to="/register" className="font-semibold text-primary hover:underline">Create an account</Link>
      </p>
    </AuthShell>
  );
}
