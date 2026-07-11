import { describe, expect, it } from "vitest";
import { defaultOverflowPageSize, sliceCollectionItems } from "./site-collection-overflow";

describe("site-collection-overflow", () => {
  it("grow returns all items", () => {
    const items = [{ src: "1" }, { src: "2" }, { src: "3" }];
    const slice = sliceCollectionItems(items, "grow", "grid", { columns: 2, density: "normal" });
    expect(slice.visibleItems).toHaveLength(3);
    expect(slice.hiddenCount).toBe(0);
    expect(slice.showMoreControl).toBe(false);
  });

  it("paginate_static truncates without more button", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({ src: String(index) }));
    const slice = sliceCollectionItems(items, "paginate_static", "grid", { columns: 2, density: "normal" });
    expect(slice.visibleItems).toHaveLength(defaultOverflowPageSize("grid", { columns: 2, density: "normal" }));
    expect(slice.hiddenCount).toBeGreaterThan(0);
    expect(slice.showMoreControl).toBe(false);
  });

  it("truncate_more enables ver más", () => {
    const items = Array.from({ length: 10 }, (_, index) => ({ src: String(index) }));
    const slice = sliceCollectionItems(items, "truncate_more", "carousel", {
      snap: true,
      autoplay: false,
      peek: true,
      controls: "dots",
    });
    expect(slice.showMoreControl).toBe(true);
    expect(slice.hiddenCount).toBe(10 - slice.visibleItems.length);
  });
});
