import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createToolLogger } from "../logger.js";
import { requireAdvKey, requirePubKey, AuthError } from "../config.js";
import { ApiError } from "../api/http-client.js";
import type { Product } from "../types/tool-module.js";

export type ToolHandler<TArgs> = (args: TArgs) => Promise<string>;

export interface ToolDefinition {
  name: string;
  description: string;
  product: Product;
  annotations?: ToolAnnotations;
}

export class ToolWrapper {
  constructor(private readonly server: McpServer) {}

  register<TShape extends z.ZodRawShape>(
    definition: ToolDefinition,
    schema: TShape,
    handler: ToolHandler<z.objectOutputType<TShape, z.ZodTypeAny>>,
  ): void {
    const log = createToolLogger(definition.name);
    const validateAuth = () => this.validateAuth(definition.product);
    const fmtErr = (e: unknown) => this.formatError(e);

    // ShapeOutput<TShape> and z.objectOutputType<TShape> are structurally identical
    // but TypeScript can't prove this for unresolved generics.
    const callback = async (args: Record<string, unknown>, _extra: unknown) => {
      const startTime = Date.now();

      try {
        validateAuth();

        const result = await handler(args as z.objectOutputType<TShape, z.ZodTypeAny>);

        const elapsed = Date.now() - startTime;
        log.info({ elapsed, resultSize: result.length }, "Tool completed");

        return { content: [{ type: "text" as const, text: result }] };
      } catch (error) {
        const elapsed = Date.now() - startTime;
        const message = fmtErr(error);

        log.error({ elapsed, error: message }, "Tool failed");

        return {
          content: [{ type: "text" as const, text: message }],
          isError: true as const,
        };
      }
    };

    this.server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: schema,
        annotations: definition.annotations,
      },
      callback as ToolCallback<TShape>,
    );
  }

  private validateAuth(product: Product): void {
    if (product === "advertiser") {
      requireAdvKey();
    } else if (product === "publisher") {
      requirePubKey();
    }
  }

  private formatError(error: unknown): string {
    if (error instanceof AuthError) {
      return error.message;
    }

    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) {
        return "API key is invalid or expired. Check your API key configuration.";
      }
      if (error.status === 404) {
        return "Resource not found. Verify the ID is correct.";
      }
      if (error.status === 422) {
        return `Validation error: ${error.message}`;
      }
      return `API error (${error.status}): ${error.message}`;
    }

    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
      return `Invalid parameters:\n${issues}`;
    }

    if (error instanceof Error) {
      return `Error: ${error.message}`;
    }

    return `Unexpected error: ${String(error)}`;
  }
}
