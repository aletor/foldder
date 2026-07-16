"use client";

import { useCallback } from "react";
import { useStore, type Edge, type Node, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { normalizeBrandKitDocument } from "@/lib/brandkit/brand-kit-defaults";
import type { BrandKitNodeData } from "@/lib/brandkit/brand-kit-types";
import { resolveSiteAdnFromBrandKit, type SiteAdnContext } from "@/lib/site/site-adn";

export function useSiteAdnConnection(siteNodeId: string): {
  adn: SiteAdnContext;
  connected: boolean;
  brandKitMissing: boolean;
  brandKitNodeId: string | null;
} {
  return useStore(
    useCallback(
      (state: ReactFlowState<Node, Edge>) => {
        const edge = state.edges.find(
          (item) =>
            item.target === siteNodeId &&
            item.targetHandle === "adn" &&
            item.sourceHandle === "brand",
        );
        if (!edge) {
          return {
            adn: resolveSiteAdnFromBrandKit(null),
            connected: false,
            brandKitMissing: false,
            brandKitNodeId: null,
          };
        }

        const source = state.nodeLookup.get(edge.source);
        if (!source || source.type !== "brandKit") {
          return {
            adn: resolveSiteAdnFromBrandKit(null, { edgeId: edge.id }),
            connected: true,
            brandKitMissing: true,
            brandKitNodeId: null,
          };
        }

        const data = source.data as BrandKitNodeData;
        const doc = normalizeBrandKitDocument(data.brandKit);
        const adn = resolveSiteAdnFromBrandKit(doc, { brandKitNodeId: source.id, edgeId: edge.id });

        return {
          adn,
          connected: true,
          brandKitMissing: false,
          brandKitNodeId: source.id,
        };
      },
      [siteNodeId],
    ),
    shallow,
  );
}
