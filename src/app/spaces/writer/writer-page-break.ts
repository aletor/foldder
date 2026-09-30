import { mergeAttributes, Node } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    writerPageBreak: {
      insertWriterPageBreak: () => ReturnType;
    };
  }
}

/** Salto manual. El reparto automático no se guarda: solo este nodo. */
export const WriterPageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: "div[data-writer-page-break]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-writer-page-break": "",
        class: "writer-page-break",
        contenteditable: "false",
      }),
      "Salto de página",
    ];
  },
  addCommands() {
    return {
      insertWriterPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: "pageBreak" }).run(),
    };
  },
});
