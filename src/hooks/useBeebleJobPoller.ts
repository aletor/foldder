"use client";

import { useEffect, useRef } from "react";
import type { BeebleClient, BeebleJob } from "@/lib/beeble-api";

export function useBeebleJobPoller(
  jobId: string | null,
  client: BeebleClient | null,
  onUpdate: (job: BeebleJob) => void,
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!jobId || !client) return;

    let intervalId: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      try {
        const job = await client.getJob(jobId);
        onUpdateRef.current(job);
        if (job.status === "completed" || job.status === "failed") {
          if (intervalId) clearInterval(intervalId);
        }
      } catch (e) {
        console.error("[useBeebleJobPoller]", e);
      }
    };

    void poll();
    intervalId = setInterval(() => void poll(), 5000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [jobId, client]);
}
