import type {
  CarouselOpts,
  CollectionContent,
  CollectionItem,
  CollectionView,
  GridOpts,
  TableOpts,
} from "./site-types";

export type CollectionOverflowSlice = {
  visibleItems: CollectionItem[];
  hiddenCount: number;
  /** Muestra botón «Ver más» (truncate_more). */
  showMoreControl: boolean;
};

export function defaultOverflowPageSize(
  view: CollectionView,
  viewOptions: CollectionContent["viewOptions"],
): number {
  switch (view) {
    case "grid": {
      const grid = viewOptions as GridOpts;
      const columns = grid?.columns ?? 3;
      const density = grid?.density ?? "normal";
      const rows = density === "compact" ? 3 : density === "airy" ? 1 : 2;
      return columns * rows;
    }
    case "carousel":
      return 8;
    case "table": {
      const table = viewOptions as TableOpts;
      return Math.max(6, (table?.visibleFields?.length ?? 2) * 3);
    }
    case "marquee":
      return 12;
    default:
      return 9;
  }
}

export function sliceCollectionItems(
  items: CollectionItem[],
  overflow: CollectionContent["overflow"],
  view: CollectionView,
  viewOptions: CollectionContent["viewOptions"],
): CollectionOverflowSlice {
  const pageSize = defaultOverflowPageSize(view, viewOptions);
  if (overflow === "grow" || items.length <= pageSize) {
    return { visibleItems: items, hiddenCount: 0, showMoreControl: false };
  }
  return {
    visibleItems: items.slice(0, pageSize),
    hiddenCount: items.length - pageSize,
    showMoreControl: overflow === "truncate_more",
  };
}

export function collectionDisplayItems(content: CollectionContent): CollectionItem[] {
  const raw = content.items.length ? content.items : [{}, {}, {}];
  return sliceCollectionItems(raw, content.overflow, content.view, content.viewOptions).visibleItems;
}
