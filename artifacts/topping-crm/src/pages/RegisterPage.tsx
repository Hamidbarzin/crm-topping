import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle } from "lucide-react";

const ROLES = ["Sales_Rep", "Closer", "Employee"];

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "Employee", slug: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          slug: form.slug || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create account");
        return;
      }
      login(data.token, data.user);
      navigate("/dashboard");
    } catch {
      setError("Could not connect to the server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <span className="text-white font-black text-sm">T</span>
          </div>
          <span className="font-bold">Topping CRM</span>
        </div>
        <h2 className="text-2xl font-bold text-foreground">Create account</h2>
        <p className="text-sm text-muted-foreground mt-1">Set up your Topping CRM account</p>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-1.5">
            <Label className="text-sm">Full name</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" required className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Email</Label>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@toppingcourier.ca" required className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Password</Label>
            <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="At least 6 characters" required className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Your role</Label>
            <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Booking slug <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="e.g. jane" className="h-10" />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <Button type="submit" className="w-full h-10" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-sm text-center text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
