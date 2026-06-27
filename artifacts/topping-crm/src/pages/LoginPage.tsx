import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: { client_id: string; auto_select?: boolean; callback: (r: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, cfg: object) => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/config").then(r => r.json()).then(d => {
      if (d.googleClientId) setGoogleClientId(d.googleClientId);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!googleClientId) return;
    const scriptId = "gsi-script";
    if (document.getElementById(scriptId)) {
      initGoogle(googleClientId);
      return;
    }
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => initGoogle(googleClientId);
    document.head.appendChild(script);
  }, [googleClientId]);

  const initGoogle = (clientId: string) => {
    if (!window.google || !googleBtnRef.current) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      callback: async ({ credential }) => {
        setGoogleLoading(true);
        setError("");
        try {
          const res = await fetch("/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Google sign-in failed");
          login(data.token, data.user);
          navigate("/dashboard");
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : "Google sign-in failed");
        } finally {
          setGoogleLoading(false);
        }
      },
    });
    const btnWidth = googleBtnRef.current.offsetWidth || 400;
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: "outline",
      size: "large",
      width: btnWidth,
      text: "continue_with",
    });
  };

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data: any) => {
        login(data.token, data.user);
        navigate("/dashboard");
      },
      onError: () => {
        setError("Invalid email or password");
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ data: { email, password } });
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-sidebar p-12">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white font-black text-base">T</span>
          </div>
          <div>
            <div className="font-bold text-sidebar-foreground">Topping Courier</div>
            <div className="text-xs text-sidebar-foreground/50">Business Operating System</div>
          </div>
        </div>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-sidebar-foreground leading-tight">
              Your team's<br />command center.
            </h1>
            <p className="mt-3 text-sidebar-foreground/60 text-sm leading-relaxed">
              CRM, KPI tracking, pipeline management, team calendar, and booking — all in one place.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Pipeline", desc: "Track every deal" },
              { label: "Calendar", desc: "Book & manage meetings" },
              { label: "KPI Reports", desc: "Daily performance tracking" },
              { label: "Conflict Check", desc: "Avoid scheduling clashes" },
            ].map(item => (
              <div key={item.label} className="bg-sidebar-accent/50 rounded-lg p-3 border border-sidebar-border">
                <div className="text-xs font-semibold text-primary">{item.label}</div>
                <div className="text-xs text-sidebar-foreground/50 mt-0.5">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-sidebar-foreground/30">
          Topping Courier Inc. — Internal Platform
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="flex items-center gap-2 lg:hidden mb-6">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                <span className="text-white font-black text-sm">T</span>
              </div>
              <span className="font-bold">Topping CRM</span>
            </div>
            <h2 className="text-2xl font-bold text-foreground">Sign in</h2>
            <p className="text-sm text-muted-foreground mt-1">Enter your credentials to access the platform</p>
          </div>

          {/* Google Sign-In button */}
          {googleClientId && (
            <div className="mb-5">
              {googleLoading ? (
                <div className="flex items-center justify-center gap-2 h-10 border rounded-md text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in with Google...
                </div>
              ) : (
                <div ref={googleBtnRef} className="w-full" />
              )}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or sign in with email</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@toppingcourier.ca"
                required
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm">Password</Label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="h-10"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-10"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-center text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary font-medium hover:underline">Create account</Link>
          </p>
          <p className="mt-3 text-xs text-center text-muted-foreground">
            Topping Courier Internal — Authorized Personnel Only
          </p>
        </div>
      </div>
    </div>
  );
}
