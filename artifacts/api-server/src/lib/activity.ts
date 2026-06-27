import { db, activityLogsTable } from "@workspace/db";
import { logger } from "./logger";

export type ActivityEntity = "lead" | "client" | "deal" | "meeting" | "task";

export interface LogActivityInput {
  entityType: ActivityEntity;
  entityId: number;
  action: string;
  description: string;
  userId?: number | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Records an activity-log row. Fire-and-forget: a logging failure must never
 * break the user's actual operation, so errors are logged, not thrown.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await db.insert(activityLogsTable).values({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      description: input.description,
      userId: input.userId ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    logger.error({ err, input }, "Failed to record activity log");
  }
}
