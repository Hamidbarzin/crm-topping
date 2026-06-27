import { useGetActivity } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

export default function ActivityTimeline({ entityType, entityId }: { entityType: string; entityId: number | null }) {
  const { data: entries, isLoading } = useGetActivity(
    { entityType, entityId: entityId ?? 0 },
    { query: { enabled: !!entityId, queryKey: ["activity", entityType, entityId] } },
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <Clock className="w-3.5 h-3.5" />
        Activity History
      </div>
      <div className="border border-border rounded-md max-h-52 overflow-y-auto">
        {isLoading && (
          <div className="p-3 space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        )}
        {!isLoading && (!entries || entries.length === 0) && (
          <div className="text-center text-muted-foreground py-6 text-sm">No activity recorded yet</div>
        )}
        {!isLoading && entries && entries.length > 0 && (
          <ul className="divide-y divide-border">
            {entries.map(e => (
              <li key={e.id} className="px-3 py-2 flex items-start gap-2.5">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-snug">{e.description}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {e.userName ? `${e.userName} · ` : ""}
                    {formatDistanceToNow(parseISO(e.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
