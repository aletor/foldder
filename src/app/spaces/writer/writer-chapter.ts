import { mergeAttributes, Node } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { WriterPageBreak } from "./writer-page-break";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    writerChapter: {
      insertWriterChapter: () => ReturnType;
    };
  }
}

export const WriterChapterTitle = Node.create({
  name: "chapterTitle",
  content: "inline*",
  defining: true,
  marks: "",
  parseHTML() {
    return [{ tag: "h1[data-writer-chapter-title]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["h1", mergeAttributes(HTMLAttributes, { "data-writer-chapter-title": "" }), 0];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { $from } = this.editor.state.selection;
        if ($from.parent.type.name !== "chapterTitle") return false;
        const insertAt = $from.after();
        return this.editor.chain().insertContentAt(insertAt, { type: "paragraph" }).focus(insertAt + 1).run();
      },
    };
  },
});

export const WriterChapter = Node.create({
  name: "chapter",
  group: "block",
  addExtensions() {
    return [WriterPageBreak];
  },
  content: "chapterTitle (paragraph | heading | bulletList | orderedList | blockquote | pageBreak | sceneHeading | action | character | dialogue | parenthetical | transition)*",
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-chapter-id"),
        renderHTML: (attributes) => (attributes.id ? { "data-chapter-id": attributes.id } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "section[data-chapter-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["section", mergeAttributes(HTMLAttributes, { class: "writer-chapter" }), 0];
  },
  addCommands() {
    return {
      insertWriterChapter:
        () =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: "chapter",
              attrs: { id: crypto.randomUUID() },
              content: [{ type: "chapterTitle" }, { type: "paragraph" }],
            })
            .run(),
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const tr = state.tr;
          let changed = false;
          state.doc.descendants((node, pos) => {
            if (node.type.name === "chapter" && !node.attrs.id) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: crypto.randomUUID() });
              changed = true;
            }
          });
          return changed ? tr : null;
        },
      }),
    ];
  },
});
