/**
 * Slack Trigger - Webhook-based Workflow Triggering
 */

import { format, promisify } from "node:util";
import { execFile } from "node:child_process";
import { Mastra } from "@mastra/core";
import { type WorkflowResult, type Step } from "@mastra/core/workflows";
import { IMastraLogger } from "@mastra/core/logger";
import {
  type AuthTestResponse,
  type ChatPostMessageResponse,
  type ConversationsOpenResponse,
  type ConversationsRepliesResponse,
  type UsersConversationsResponse,
  type WebAPICallError,
  ErrorCode,
  WebClient,
} from "@slack/web-api";
import type { Context, Handler, MiddlewareHandler } from "hono";
import { streamSSE } from "hono/streaming";
import type { z } from "zod";

import { registerApiRoute } from "../mastra/inngest";

export type Methods = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "ALL";

export type ApiRoute =
  | {
      path: string;
      method: Methods;
      handler: Handler;
      middleware?: MiddlewareHandler | MiddlewareHandler[];
    }
  | {
      path: string;
      method: Methods;
      createHandler: ({ mastra }: { mastra: Mastra }) => Promise<Handler>;
      middleware?: MiddlewareHandler | MiddlewareHandler[];
    };

export type TriggerInfoSlackOnNewMessage = {
  type: "slack/message.channels";
  params: {
    channel: string;
    channelDisplayName: string;
  };
  payload: any;
};

type DiagnosisStep =
  | { status: "pending"; name: string; extra?: Record<string, any> }
  | { status: "success"; name: string; extra: Record<string, any> }
  | { status: "failed"; name: string; error: string; extra: Record<string, any> };

export async function getClient() {
  let connectionSettings: any;
  async function getAccessToken() {
    if (
      connectionSettings &&
      connectionSettings.settings.expires_at &&
      new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
    ) {
      return {
        token: connectionSettings.settings.access_token,
        user: connectionSettings.settings.oauth?.credentials?.raw?.authed_user?.id,
      };
    }

    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const { stdout } = await promisify(execFile)(
      "replit",
      ["identity", "create", "--audience", `https://${hostname}`],
      { encoding: "utf8" },
    );

    const replitToken = stdout.trim();
    if (!replitToken) throw new Error("Replit Identity Token not found for repl/depl");

    const res = await fetch(
      "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=slack-agent",
      {
        headers: {
          Accept: "application/json",
          "Replit-Authentication": `Bearer ${replitToken}`,
        },
      },
    );
    const resJson = await res.json();
    connectionSettings = resJson?.items?.[0];
    if (!connectionSettings || !connectionSettings.settings.access_token) {
      throw new Error(`Slack not connected: HTTP ${res.status} ${res.statusText}: ${JSON.stringify(resJson)}`);
    }
    return {
      token: connectionSettings.settings.access_token,
      user: connectionSettings.settings.oauth?.credentials?.raw?.authed_user?.id,
    };
  }

  const { token, user } = await getAccessToken();
  const slack = new WebClient(token);
  const response = await slack.auth.test();
  return { slack, auth: response, user };
}

const recentEvents: string[] = [];

function isWebAPICallError(err: unknown): err is WebAPICallError {
  return err !== null && typeof err === "object" && "code" in err && "data" in err;
}

function checkDuplicateEvent(eventName: string) {
  if (recentEvents.includes(eventName)) return true;
  recentEvents.push(eventName);
  if (recentEvents.length > 200) recentEvents.shift();
  return false;
}

export function registerSlackTrigger<
  Env extends { Variables: { mastra: Mastra } },
  TState extends z.ZodObject<any>,
  TInput extends z.ZodType<any>,
  TOutput extends z.ZodType<any>,
  TSteps extends Step<string, any, any>[],
>({
  triggerType,
  handler,
}: {
  triggerType: string;
  handler: (
    mastra: Mastra,
    triggerInfo: TriggerInfoSlackOnNewMessage,
  ) => Promise<WorkflowResult<TState, TInput, TOutput, TSteps> | null>;
}): Array<ApiRoute> {
  return [
    registerApiRoute("/webhooks/slack/action", {
      method: "POST",
      handler: async (c) => {
        const mastra = c.get("mastra");
        const logger = mastra.getLogger();
        try {
          const payload = await c.req.json();
          const { slack, auth } = await getClient();

          if (payload && payload["challenge"]) {
            return c.text(payload["challenge"], 200);
          }

          logger?.info("📝 [Slack] payload", { payload });

          if (payload && payload.event && payload.event.channel) {
            try {
              const result = await slack.conversations.info({ channel: payload.event.channel });
              payload.channel = result.channel;
            } catch (error) {
              logger?.error("Error fetching channel info", { error: format(error) });
            }
          }

          if (
            payload.event?.subtype === "message_changed" ||
            payload.event?.subtype === "message_deleted"
          ) {
            return c.text("OK", 200);
          }

          if (
            (payload.event?.channel_type === "im" && payload.event?.text === "test:ping") ||
            payload.event?.text === `<@${auth.user_id}> test:ping`
          ) {
            await slack.chat.postMessage({
              channel: payload.event.channel,
              text: "pong",
              thread_ts: payload.event.ts,
            });
            return c.text("OK", 200);
          }

          if (payload.event?.bot_id) return c.text("OK", 200);
          if (checkDuplicateEvent(payload.event_id)) return c.text("OK", 200);

          const result = await handler(mastra, {
            type: triggerType,
            params: {
              channel: payload.event.channel,
              channelDisplayName: payload.channel.name,
            },
            payload,
          } as TriggerInfoSlackOnNewMessage);

          return c.text("OK", 200);
        } catch (error) {
          logger?.error("Error handling Slack webhook", { error: format(error) });
          return c.text("Internal Server Error", 500);
        }
      },
    }),
  ];
}
