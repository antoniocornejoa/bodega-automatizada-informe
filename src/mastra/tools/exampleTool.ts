import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const exampleTool = createTool({
  id: "example-tool",
  description: "A simple example tool that demonstrates how to create Mastra tools",
  inputSchema: z.object({
    message: z.string().describe("A message to process"),
    count: z.number().optional().describe("Optional number parameter"),
  }),
  outputSchema: z.object({
    processed: z.string(),
    timestamp: z.string(),
    metadata: z.object({
      characterCount: z.number(),
      wordCount: z.number(),
    }),
  }),
  execute: async (inputData, context) => {
    const logger = context?.mastra?.getLogger();
    logger?.info('[exampleTool] Executing');
    const processedMessage = inputData.message.toUpperCase();
    const words = inputData.message.split(' ').filter(w => w.length > 0);
    return {
      processed: processedMessage,
      timestamp: new Date().toISOString(),
      metadata: { characterCount: inputData.message.length, wordCount: words.length },
    };
  },
});
