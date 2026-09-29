import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { WriterBlockMark } from "./writer-continuity";

export const WriterSignals = Extension.create({
  name: "writerSignals",
  addStorage() {
    return { marks: [] as WriterBlockMark[], flash: null as { from: number; to: number } | null };
  },
  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        props: {
          decorations(state) {
            const marks = (storage.marks ?? []) as WriterBlockMark[];
            const decorations = marks
              .filter((mark) => mark.from >= 0 && mark.to <= state.doc.content.size && mark.from < mark.to)
              .map((mark) =>
                Decoration.node(mark.from, mark.to, {
                  class: mark.kind === "conflict" ? "writer-signal-conflict" : "writer-signal-memory",
                }),
              );
            const flash = storage.flash as { from: number; to: number } | null;
            if (flash && flash.from >= 0 && flash.to <= state.doc.content.size && flash.from < flash.to) {
              decorations.push(Decoration.node(flash.from, flash.to, { class: "writer-block-flash" }));
            }
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
