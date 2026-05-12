import { jsonByteLength, projectSaveFingerprint } from "./project-save-utils";

type PrepareSaveMessage = {
  id: number;
  type: "prepare-save";
  fingerprintInput: unknown;
  projectToSave: unknown;
  softLimitBytes: number;
};

type WorkerInboundMessage = PrepareSaveMessage;

type WorkerOutboundMessage =
  | {
      id: number;
      ok: true;
      fingerprint: string;
      payloadJson: string;
      payloadBeforeBytes: number;
      needsMainCompaction: boolean;
      durationMs: number;
    }
  | {
      id: number;
      ok: false;
      error: string;
      durationMs: number;
    };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerInboundMessage>) => void) | null;
  postMessage: (message: WorkerOutboundMessage) => void;
};

workerScope.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;
  if (!message || message.type !== "prepare-save") return;

  const startedAt = performance.now();
  try {
    const fingerprint = projectSaveFingerprint(message.fingerprintInput);
    const payloadJson = JSON.stringify(message.projectToSave);
    const payloadBeforeBytes = jsonByteLength(payloadJson);
    workerScope.postMessage({
      id: message.id,
      ok: true,
      fingerprint,
      payloadJson,
      payloadBeforeBytes,
      needsMainCompaction: payloadBeforeBytes > message.softLimitBytes,
      durationMs: performance.now() - startedAt,
    } satisfies WorkerOutboundMessage);
  } catch (error) {
    workerScope.postMessage({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error ?? "Unknown save worker error"),
      durationMs: performance.now() - startedAt,
    } satisfies WorkerOutboundMessage);
  }
};

export {};
