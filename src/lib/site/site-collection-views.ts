import type {
  CarouselOpts,
  CollectionContent,
  CollectionView,
  GridOpts,
  MarqueeOpts,
  TableOpts,
} from "./site-types";

export const COLLECTION_VIEW_LABELS: Record<CollectionView, string> = {
  grid: "Grid",
  carousel: "Carrusel",
  table: "Tabla",
  marquee: "Marquesina",
};

export function defaultViewOptions(view: CollectionView): CollectionContent["viewOptions"] {
  switch (view) {
    case "carousel":
      return { snap: true, autoplay: false, peek: true, controls: "dots" } satisfies CarouselOpts;
    case "table":
      return { visibleFields: ["src", "caption"], stickyHeader: true, zebra: true } satisfies TableOpts;
    case "marquee":
      return { speed: 2, grayscale: false } satisfies MarqueeOpts;
    case "grid":
    default:
      return { columns: 3, density: "normal" } satisfies GridOpts;
  }
}

export function switchCollectionView(content: CollectionContent, view: CollectionView): CollectionContent {
  if (content.view === view) return content;
  return {
    ...content,
    view,
    viewOptions: defaultViewOptions(view),
  };
}
