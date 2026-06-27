import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, MailCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not send reset email");
        return;
      }
      setSent(true);
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

        {sent ? (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <MailCheck className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Check your email</h2>
            <p className="text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{email}</span>, we've sent a password reset link. It expires in 1 hour.
            </p>
            <Link href="/login" className="inline-block text-sm text-primary font-medium hover:underline">Back to sign in</Link>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-foreground">Forgot password</h2>
            <p className="text-sm text-muted-foreground mt-1">Enter your email and we'll send you a reset link</p>

            <form onSubmit={handleSubmit} className="space-y-4 mt-6">
              <div className="space-y-1.5">
                <Label className="text-sm">Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@toppingcourier.ca" required className="h-10" />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-10" disabled={loading}>
                {loading ? "Sending..." : "Send reset link"}
              </Button>
            </form>

            <p className="mt-6 text-sm text-center text-muted-foreground">
              Remembered it?{" "}
              <Link href="/login" className="text-primary font-medium hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
