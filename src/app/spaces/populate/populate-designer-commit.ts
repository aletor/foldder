import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import {
  buildDesignerGeneratedSubgraph,
  type DesignerMaterializedRow,
} from "@/app/spaces/loop/loop-designer-materialize";
import { LOOP_COMMIT_EVENT } from "@/app/spaces/loop/use-loop-context";

export type PopulateDesignerInstance = {
  label: string;
  pages: DesignerPageState[];
  cardId?: string;
};

/** Deposita instancias Designer congeladas en el nested space (mismo mecanismo que Loop). */
export function dispatchPopulateDesignerCommit(args: {
  populateNodeId: string;
  spaceName: string;
  instances: PopulateDesignerInstance[];
}): void {
  if (typeof window === "undefined") return;
  const rows: DesignerMaterializedRow[] = args.instances.map((inst, rowIndex) => ({
    rowIndex,
    cardId: inst.cardId,
    pages: inst.pages,
  }));
  const sub = buildDesignerGeneratedSubgraph(args.populateNodeId, rows);
  const nodes = sub.nodes.map((node, index) => ({
    ...node,
    data: {
      ...node.data,
      label: args.instances[index]?.label ?? node.data?.label,
    },
  }));
  window.dispatchEvent(
    new CustomEvent(LOOP_COMMIT_EVENT, {
      detail: {
        loopNodeId: args.populateNodeId,
        spaceName: args.spaceName,
        nodes,
        edges: sub.edges,
      },
    }),
  );
}
