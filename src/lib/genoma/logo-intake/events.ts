import fs from "node:fs";
import path from "node:path";
import type { LogoIntakeEvent } from "@/lib/genoma/logo-intake/types";

const EVENTS_PATH = path.join(process.cwd(), "data/logo-intake-events.jsonl");

export function logLogoIntakeEvent(event: LogoIntakeEvent): void {
  fs.mkdirSync(path.dirname(EVENTS_PATH), { recursive: true });
  fs.appendFileSync(EVENTS_PATH, `${JSON.stringify(event)}\n`, "utf8");
  console.info("[logo-intake:event]", event.kind, event.projectId);
}
