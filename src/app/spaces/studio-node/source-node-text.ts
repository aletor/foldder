import type { Node } from "@xyflow/react";

export function textFromStudioSourceNode(source: Node | undefined): string {
  if (!source || !source.data || typeof source.data !== "object") return "";
  const row = source.data as Record<string, unknown>;
  if (source.type === "notes") {
    return (
      (typeof row.contentMarkdown === "string" && row.contentMarkdown.trim()) ||
      (typeof row.plainText === "string" && row.plainText.trim()) ||
      (typeof row.value === "string" ? row.value.trim() : "")
    );
  }
  return (
    (typeof row.value === "string" && row.value.trim()) ||
    (typeof row.promptValue === "string" && row.promptValue.trim()) ||
    (typeof row.text === "string" ? row.text.trim() : "")
  );
}
