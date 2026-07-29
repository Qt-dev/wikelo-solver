import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { sha256 } from "@/lib/server/crypto";
import { refreshPrices } from "@/lib/server/price-refresh";
import { syncRepositoryData } from "@/lib/server/repository-sync";
import type { WikeloRepositoryContainer } from "./repository-container";

export interface SyncEnv {
  WikeloRepositoryContainer: DurableObjectNamespace<WikeloRepositoryContainer>;
}

export class UexPriceSyncWorkflow extends WorkflowEntrypoint<SyncEnv, { scheduledAt: string }> {
  async run(event: Readonly<WorkflowEvent<{ scheduledAt: string }>>, step: WorkflowStep) {
    return step.do("refresh UEX price snapshots", { retries: { limit: 3, delay: "30 seconds", backoff: "exponential" } }, async () => {
      const timestamp = event.payload.scheduledAt;
      return refreshPrices({ requestId: crypto.randomUUID(), timestamp, bodyHash: await sha256(`uex:${timestamp}`) });
    });
  }
}

export class GameDataSyncWorkflow extends WorkflowEntrypoint<SyncEnv, { scheduledAt: string }> {
  async run(_event: Readonly<WorkflowEvent<{ scheduledAt: string }>>, step: WorkflowStep) {
    return step.do("fetch and import scunpacked-data", { retries: { limit: 2, delay: "5 minutes", backoff: "exponential" }, timeout: "10 minutes" }, async () => syncRepositoryData(this.env.WikeloRepositoryContainer));
  }
}
