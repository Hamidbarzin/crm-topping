import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not reset password");
        return;
      }
      setDone(true);
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

        {done ? (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Password updated</h2>
            <p className="text-sm text-muted-foreground">Your password has been changed. You can now sign in with it.</p>
            <Button className="w-full h-10" onClick={() => navigate("/login")}>Go to sign in</Button>
          </div>
        ) : !token ? (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">Invalid link</h2>
            <p className="text-sm text-muted-foreground">This reset link is missing or invalid. Please request a new one.</p>
            <Link href="/forgot-password" className="inline-block text-sm text-primary font-medium hover:underline">Request a new link</Link>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-foreground">Set a new password</h2>
            <p className="text-sm text-muted-foreground mt-1">Choose a new password for your account</p>

            <form onSubmit={handleSubmit} className="space-y-4 mt-6">
              <div className="space-y-1.5">
                <Label className="text-sm">New password</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" required className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Confirm password</Label>
                <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" required className="h-10" />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-10" disabled={loading}>
                {loading ? "Updating..." : "Update password"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
