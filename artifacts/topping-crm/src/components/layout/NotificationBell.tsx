import { Link } from "wouter";
import { useGetAlerts, getGetAlertsQueryKey } from "@workspace/api-client-react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const severityDot: Record<string, string> = {
  danger: "bg-red-500",
  warning: "bg-yellow-500",
  info: "bg-blue-500",
};

function entityHref(entityType?: string): string {
  switch (entityType) {
    case "task": return "/tasks";
    case "lead": return "/leads";
    case "meeting": return "/calendar";
    case "deal": return "/pipeline";
    default: return "/my-work";
  }
}

export default function NotificationBell() {
  const { data } = useGetAlerts({ query: { queryKey: getGetAlertsQueryKey(), refetchInterval: 60000 } });
  const alerts = data?.alerts ?? [];
  const count = alerts.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notifications">
          <Bell className="w-4 h-4" />
          {count > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border">
          <div className="font-semibold text-sm">Notifications</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {count === 0 ? "You're all caught up" : `${count} item${count > 1 ? "s" : ""} need attention`}
          </div>
        </div>
        <ScrollArea className="max-h-80">
          {count === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No notifications</div>
          ) : (
            <div className="divide-y divide-border">
              {alerts.map((a, i) => (
                <Link key={i} href={entityHref(a.entityType)}>
                  <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer">
                    <span className={cn("mt-1.5 w-2 h-2 rounded-full flex-shrink-0", severityDot[a.severity] ?? "bg-zinc-400")} />
                    <span className="text-sm leading-snug">{a.message}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
