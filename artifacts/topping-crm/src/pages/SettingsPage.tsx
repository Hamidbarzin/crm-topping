import AppLayout from "@/components/layout/AppLayout";
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const roleColors: Record<string,string> = {
  CEO: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Admin: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Marketing_Manager: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Sales_Rep: "bg-green-500/10 text-green-400 border-green-500/20",
  Closer: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  IT_Manager: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  Employee: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

export default function SettingsPage() {
  const { data: me, isLoading } = useGetMe();
  const { logout } = useAuth();

  return (
    <AppLayout>
      <div className="p-6 max-w-xl space-y-5">
        <div>
          <h1 className="text-lg font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your account information</p>
        </div>

        {isLoading ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : me ? (
          <Card className="border border-card-border">
            <CardHeader className="pb-3 pt-5 px-5">
              <CardTitle className="text-sm font-semibold">Profile</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-primary">{me.name?.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <div className="font-semibold text-base">{me.name}</div>
                  <div className="text-sm text-muted-foreground">{me.email}</div>
                  <Badge variant="outline" className={cn("mt-1.5 text-xs border", roleColors[me.role] || roleColors.Employee)}>
                    {me.role?.replace("_"," ")}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Booking Slug</div>
                  <div className="text-sm font-mono bg-muted rounded px-2 py-1">
                    {me.slug || <span className="text-muted-foreground italic">not set</span>}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Status</div>
                  <div className={cn("inline-flex items-center gap-1.5 text-sm")}>
                    <div className={cn("w-1.5 h-1.5 rounded-full", me.isActive ? "bg-green-400" : "bg-zinc-500")} />
                    {me.isActive ? "Active" : "Inactive"}
                  </div>
                </div>
              </div>
              {me.slug && (
                <div className="pt-2 border-t border-border">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Booking Link</div>
                  <div className="text-xs font-mono bg-muted rounded px-2 py-1.5 text-primary break-all">
                    /api/booking/availability?userSlug={me.slug}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppLayout>
  );
}
