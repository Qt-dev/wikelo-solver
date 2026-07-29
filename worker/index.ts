/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { WikeloRepositoryContainer } from "./repository-container";
import { GameDataSyncWorkflow, UexPriceSyncWorkflow } from "./sync-workflows";

export { WikeloRepositoryContainer, GameDataSyncWorkflow, UexPriceSyncWorkflow };

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  WikeloRepositoryContainer: DurableObjectNamespace;
  UEX_SYNC_WORKFLOW: Workflow<{ scheduledAt: string }>;
  GAME_SYNC_WORKFLOW: Workflow<{ scheduledAt: string }>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

function startScheduledWorkflow(workflow: Workflow<{ scheduledAt: string }>, prefix: string, controller: ScheduledController, ctx: ExecutionContext) {
  const scheduledAt = new Date(controller.scheduledTime).toISOString();
  ctx.waitUntil(workflow.create({ id: `${prefix}-${controller.scheduledTime}`, params: { scheduledAt } }).catch((error: unknown) => {
    // Duplicate cron deliveries are expected occasionally; Workflows rejects the
    // duplicate instance ID, while genuine failures remain visible in logs.
    console.error(`${prefix} scheduled workflow was not started`, error);
  }));
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },

  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    if (controller.cron === "15 */6 * * *") startScheduledWorkflow(env.UEX_SYNC_WORKFLOW, "uex", controller, ctx);
    if (controller.cron === "30 3 * * *") startScheduledWorkflow(env.GAME_SYNC_WORKFLOW, "game", controller, ctx);
  },
};

export default worker;
