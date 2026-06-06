import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createToolLogger } from "../logger.js";
import { AuthError } from "../errors.js";
import { ApiError } from "../api/http-client.js";
import type { Product } from "../types/tool-module.js";
import type { AdvContext, PubContext } from "../context.js";
import type { ClientPool } from "../api/client-pool.js";
import { getConfig } from "../config.js";

export type ToolHandler<TArgs, TCtx> = (args: TArgs, ctx: TCtx) => Promise<string>;

export interface ToolDefinition {
  name: string;
  description: string;
  product: Product;
  annotations?: ToolAnnotations;
}

type ContextForProduct<P extends Product> = P extends "advertiser" ? AdvContext : PubContext;

export class ToolWrapper {
  constructor(
    private readonly server: McpServer,
    private readonly clientPool: ClientPool,
  ) {}

  register<TShape extends z.ZodRawShape, P extends Product>(
    definition: ToolDefinition & { product: P },
    schema: TShape,
    handler: ToolHandler<z.objectOutputType<TShape, z.ZodTypeAny>, ContextForProduct<P>>,
  ): void {
    const log = createToolLogger(definition.name);
    const { product } = definition;
    const resolveCtx = () => this.resolveProductContext(product);
    const fmtErr = (e: unknown) => this.formatError(e);
    const inputSchema = z.object(schema);

    const callback = async (args: Record<string, unknown>, _extra: unknown) => {
      const startTime = Date.now();

      try {
        const parsed = inputSchema.parse(args);
        const ctx = resolveCtx();

        const result = await (
          handler as ToolHandler<z.objectOutputType<TShape, z.ZodTypeAny>, AdvContext | PubContext>
        )(parsed, ctx);

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

  private resolveProductContext(product: Product): AdvContext | PubContext {
    const config = getConfig();

    if (product === "advertiser") {
      if (!config.KADAM_ADV_API_KEY) {
        throw new AuthError(
          "KADAM_ADV_API_KEY is not configured. " +
            "Set it to your Kadam advertiser API key from partners.kadam.net -> Profile -> API.",
        );
      }
      const resolved = this.clientPool.resolve(config.KADAM_ADV_API_KEY, undefined);
      return { adv: resolved.adv! } satisfies AdvContext;
    }

    if (!config.KADAM_PUB_API_KEY) {
      throw new AuthError(
        "KADAM_PUB_API_KEY is not configured. " +
          "Set it to your Kadam publisher API key from pub.kadam.net -> Profile -> API.",
      );
    }
    const resolved = this.clientPool.resolve(undefined, config.KADAM_PUB_API_KEY);
    return { pub: resolved.pub! } satisfies PubContext;
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
      return `API response validation failed:\n${issues}`;
    }

    if (error instanceof Error) {
      return `Error: ${error.message}`;
    }

    return `Unexpected error: ${String(error)}`;
  }
}
