"use client";

import { SAVE_SOFT_LIMIT_BYTES } from "./compact-project-save";
import { jsonByteLength, projectSaveFingerprint } from "./project-save-utils";

type SaveWorkerSuccess = {
  id: number;
  ok: true;
  fingerprint: string;
  payloadJson: string;
  payloadBeforeBytes: number;
  needsMainCompaction: boolean;
  durationMs: number;
};

type SaveWorkerError = {
  id: number;
  ok: false;
  error: string;
  durationMs: number;
};

type SaveWorkerResponse = SaveWorkerSuccess | SaveWorkerError;

export type PreparedProjectSavePayload = {
  fingerprint: string;
  payloadJson: string;
  payloadBeforeBytes: number;
  needsMainCompaction: boolean;
  durationMs: number;
  usedWorker: boolean;
};

let saveWorker: Worker | null = null;
let saveWorkerRequestId = 0;
const pending = new Map<
  number,
  {
    resolve: (value: PreparedProjectSavePayload) => void;
    reject: (error: Error) => void;
    timeoutId: number;
  }
>();

function prepareProjectSavePayloadOnMain(input: {
  fingerprintInput: unknown;
  projectToSave: unknown;
}): PreparedProjectSavePayload {
  const startedAt = performance.now();
  const fingerprint = projectSaveFingerprint(input.fingerprintInput);
  const payloadJson = JSON.stringify(input.projectToSave);
  const payloadBeforeBytes = jsonByteLength(payloadJson);
  return {
    fingerprint,
    payloadJson,
    payloadBeforeBytes,
    needsMainCompaction: payloadBeforeBytes > SAVE_SOFT_LIMIT_BYTES,
    durationMs: performance.now() - startedAt,
    usedWorker: false,
  };
}

function getSaveWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (saveWorker) return saveWorker;
  try {
    saveWorker = new Worker(new URL("./project-save.worker.ts", import.meta.url), { type: "module" });
    saveWorker.onmessage = (event: MessageEvent<SaveWorkerResponse>) => {
      const response = event.data;
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      window.clearTimeout(request.timeoutId);
      if (!response.ok) {
        request.reject(new Error(response.error));
        return;
      }
      request.resolve({
        fingerprint: response.fingerprint,
        payloadJson: response.payloadJson,
        payloadBeforeBytes: response.payloadBeforeBytes,
        needsMainCompaction: response.needsMainCompaction,
        durationMs: response.durationMs,
        usedWorker: true,
      });
    };
    saveWorker.onerror = (event) => {
      const error = new Error(event.message || "Project save worker crashed.");
      for (const [id, request] of pending.entries()) {
        pending.delete(id);
        window.clearTimeout(request.timeoutId);
        request.reject(error);
      }
      saveWorker?.terminate();
      saveWorker = null;
    };
    return saveWorker;
  } catch {
    saveWorker = null;
    return null;
  }
}

export async function prepareProjectSavePayload(input: {
  fingerprintInput: unknown;
  projectToSave: unknown;
}): Promise<PreparedProjectSavePayload> {
  const worker = getSaveWorker();
  if (!worker) return prepareProjectSavePayloadOnMain(input);

  try {
    const id = ++saveWorkerRequestId;
    return await new Promise<PreparedProjectSavePayload>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        pending.delete(id);
        reject(new Error("Project save worker timed out."));
      }, 20_000);
      pending.set(id, { resolve, reject, timeoutId });
      worker.postMessage({
        id,
        type: "prepare-save",
        fingerprintInput: input.fingerprintInput,
        projectToSave: input.projectToSave,
        softLimitBytes: SAVE_SOFT_LIMIT_BYTES,
      });
    });
  } catch {
    return prepareProjectSavePayloadOnMain(input);
  }
}
