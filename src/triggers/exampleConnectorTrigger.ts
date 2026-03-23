/**
 * Example Connector Trigger - Linear Webhook Handler
 */

import { registerApiRoute } from "../mastra/inngest";
import type { Mastra } from "@mastra/core";

export type LinearWebhookPayload = {
  action: string;
  type: string;
  data: {
    id: string;
    title: string;
    description?: string;
    [key: string]: any;
  };
  createdAt: string;
  organizationId: string;
  [key: string]: any;
};

export type TriggerInfoLinearIssueCreated = {
  type: "linear/issue.created";
  payload: LinearWebhookPayload;
};

type LinearTriggerHandler = (
  mastra: Mastra,
  triggerInfo: TriggerInfoLinearIssueCreated,
  runId?: string,
) => Promise<any>;

export function registerLinearTrigger({
  triggerType,
  handler,
}: {
  triggerType: "linear/issue.created";
  handler: LinearTriggerHandler;
}) {
  return [
    registerApiRoute("/linear/webhook", {
      method: "POST",
      handler: async (c) => {
        const mastra = c.get("mastra");
        const logger = mastra?.getLogger();

        try {
          const payload = await c.req.json();
          console.log("📥 [Linear] Webhook received", { payload });

          if (payload.action !== "create" || payload.type !== "Issue") {
            return c.json({ success: true, skipped: true });
          }

          if (!payload.data) payload.data = {};

          const triggerInfo: TriggerInfoLinearIssueCreated = {
            type: triggerType,
            payload: payload as LinearWebhookPayload,
          };

          const runId = c.req.header("x-mastra-run-id");
          const result = await handler(mastra, triggerInfo, runId);

          return c.json({ success: true, result });
        } catch (error) {
          logger?.error("❌ [Linear] Error processing webhook", {
            error: error instanceof Error ? error.message : String(error),
          });
          return c.json(
            { success: false, error: error instanceof Error ? error.message : String(error) },
            500,
          );
        }
      },
    }),
  ];
}
