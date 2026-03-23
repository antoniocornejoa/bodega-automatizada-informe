import { inngest } from "./client";
import { init, serve as originalInngestServe } from "@mastra/inngest";
import { registerApiRoute as originalRegisterApiRoute } from "@mastra/core/server";
import { type Mastra } from "@mastra/core";
import { type Inngest, InngestFunction, NonRetriableError } from "inngest";

// Initialize Inngest with Mastra to get Inngest-compatible workflow helpers
const {
  createWorkflow: originalCreateWorkflow,
  createStep,
  cloneStep,
} = init(inngest);

export function createWorkflow(
  params: Parameters<typeof originalCreateWorkflow>[0],
): ReturnType<typeof originalCreateWorkflow> {
  return originalCreateWorkflow({
    ...params,
    retryConfig: {
      attempts: process.env.NODE_ENV === "production" ? 3 : 0,
      ...(params.retryConfig ?? {}),
    },
  });
}

// Export the Inngest client and Inngest-compatible workflow helpers
export { inngest, createStep, cloneStep };

const inngestFunctions: InngestFunction.Any[] = [];

// Create a middleware for Inngest to be able to route triggers to Mastra directly.
export function registerApiRoute<P extends string>(
  ...args: Parameters<typeof originalRegisterApiRoute<P>>
): ReturnType<typeof originalRegisterApiRoute<P>> {
  const [path, options] = args;
  if (typeof options !== "object") {
    return originalRegisterApiRoute(...args);
  }

  const pathWithoutSlash = path.replace(/^\/+/, "");
  const pathWithoutApi = pathWithoutSlash.startsWith("api/")
    ? pathWithoutSlash.substring(4)
    : pathWithoutSlash;

  let functionId: string;
  let eventName: string;

  if (pathWithoutApi.startsWith("webhooks/")) {
    functionId = `api-${pathWithoutApi.replaceAll(/\/+/g, "-")}`;
    eventName = `event/api.${pathWithoutApi.replaceAll(/\/+/g, ".")}`;
  } else {
    const connectorName = pathWithoutApi.split("/")[0];
    functionId = `api-${connectorName}`;
    eventName = `event/api.webhooks.${connectorName}.action`;
  }

  inngestFunctions.push(
    inngest.createFunction(
      { id: functionId, name: path },
      { event: eventName },
      async ({ event, step }) => {
        await step.run("forward request to Mastra", async () => {
          const headers = { ...(event.data.headers ?? {}) };
          if (event.data.runId) {
            headers["x-mastra-run-id"] = event.data.runId;
          }
          const response = await fetch(`http://localhost:5000${path}`, {
            method: event.data.method,
            headers,
            body: event.data.body,
          });

          if (!response.ok) {
            if (
              (response.status >= 500 && response.status < 600) ||
              response.status == 429 ||
              response.status == 408
            ) {
              throw new Error(
                `Failed to forward request to Mastra: ${response.statusText}`,
              );
            } else {
              throw new NonRetriableError(
                `Failed to forward request to Mastra: ${response.statusText}`,
              );
            }
          }
        });
      },
    ),
  );

  return originalRegisterApiRoute(...args);
}

export function registerCronWorkflow(cronExpression: string, workflow: any) {
  console.log("🕐 [registerCronWorkflow] Registering cron trigger", {
    cronExpression,
    workflowId: workflow?.id,
  });

  const cronFunction = inngest.createFunction(
    { id: "cron-trigger" },
    [{ event: "replit/cron.trigger" }, { cron: cronExpression }],
    async ({ event, step }) => {
      return await step.run("execute-cron-workflow", async () => {
        console.log("🚀 [Cron Trigger] Starting scheduled workflow execution", {
          workflowId: workflow?.id,
          scheduledTime: new Date().toISOString(),
          cronExpression,
        });

        try {
          const run = await workflow.createRun();
          const result = await inngest.send({
            name: `workflow.${workflow.id}`,
            data: { runId: run?.runId, inputData: {} },
          });
          console.log("✅ [Cron Trigger] Invoked Inngest function", {
            workflowId: workflow?.id,
            runId: run?.runId,
          });
          return result;
        } catch (error) {
          console.error("❌ [Cron Trigger] Workflow execution failed", {
            workflowId: workflow?.id,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      });
    },
  );

  inngestFunctions.push(cronFunction);
  console.log("✅ [registerCronWorkflow] Cron trigger registered successfully", { cronExpression });
}

export function inngestServe({
  mastra,
  inngest,
}: {
  mastra: Mastra;
  inngest: Inngest;
}): ReturnType<typeof originalInngestServe> {
  let serveHost: string | undefined = undefined;
  if (process.env.NODE_ENV === "production") {
    if (process.env.REPLIT_DOMAINS) {
      serveHost = `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`;
    }
  } else {
    serveHost = "http://localhost:5000";
  }
  return originalInngestServe({
    mastra,
    inngest,
    functions: inngestFunctions,
    registerOptions: { serveHost },
  });
}
