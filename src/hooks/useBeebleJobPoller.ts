"use client";

import { useEffect, useRef } from "react";
import type { BeebleClient, BeebleJob } from "@/lib/beeble-api";

export function useBeebleJobPoller(
  jobId: string | null,
  client: BeebleClient | null,
  onUpdate: (job: BeebleJob) => void,
) {
  const onUpdateRef = useRef(onUpdate);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!jobId || !client) return;

    const poll = async () => {
      try {
        const job = await client.getJob(jobId);
        onUpdateRef.current(job);
        if (job.status === "completed" || job.status === "failed") {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (e) {
        console.error("[useBeebleJobPoller]", e);
      }
    };

    void poll();
    intervalRef.current = setInterval(() => void poll(), 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [jobId, client]);
}
