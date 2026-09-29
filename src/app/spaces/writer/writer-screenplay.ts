import { Extension, mergeAttributes, Node, type Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Plugin } from "@tiptap/pm/state";
import { canSplit } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const WRITER_SCREENPLAY_BLOCKS = [
  "sceneHeading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
] as const;

export type WriterScreenplayBlock = (typeof WRITER_SCREENPLAY_BLOCKS)[number];

export const WRITER_SCREENPLAY_LABELS: Record<WriterScreenplayBlock, string> = {
  sceneHeading: "Encabezado",
  action: "Acción",
  character: "Personaje",
  parenthetical: "Acotación",
  dialogue: "Diálogo",
  transition: "Transición",
};

export function isWriterScreenplayBlock(value: string): value is WriterScreenplayBlock {
  return (WRITER_SCREENPLAY_BLOCKS as readonly string[]).includes(value);
}

export function createWriterStarterKit() {
  return StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    trailingNode: { notAfter: [...WRITER_SCREENPLAY_BLOCKS] },
  });
}

export function writerScreenplayTabTarget(current: string, backward: boolean): WriterScreenplayBlock {
  const index = WRITER_SCREENPLAY_BLOCKS.indexOf(current as WriterScreenplayBlock);
  if (index < 0) return "action";
  const delta = backward ? -1 : 1;
  return WRITER_SCREENPLAY_BLOCKS[(index + delta + WRITER_SCREENPLAY_BLOCKS.length) % WRITER_SCREENPLAY_BLOCKS.length]!;
}

export function writerScreenplayEnterTarget(
  current: string,
  empty: boolean,
): { mode: "set" | "split"; type: WriterScreenplayBlock } {
  if (current === "sceneHeading") return empty ? { mode: "set", type: "action" } : { mode: "split", type: "action" };
  if (current === "action") return empty ? { mode: "set", type: "sceneHeading" } : { mode: "split", type: "action" };
  if (current === "character") return empty ? { mode: "set", type: "action" } : { mode: "split", type: "dialogue" };
  if (current === "parenthetical") return { mode: empty ? "set" : "split", type: "dialogue" };
  if (current === "dialogue") return empty ? { mode: "set", type: "action" } : { mode: "split", type: "character" };
  if (current === "transition") return { mode: empty ? "set" : "split", type: "sceneHeading" };
  return { mode: "split", type: "action" };
}

function screenplayBlock(name: WriterScreenplayBlock) {
  return Node.create({
    name,
    group: "block",
    content: "inline*",
    defining: true,
    addAttributes() {
      if (name !== "character") return {};
      return {
        storyEntityId: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-story-entity") || null,
          renderHTML: (attributes) => (attributes.storyEntityId ? { "data-story-entity": attributes.storyEntityId as string } : {}),
        },
      };
    },
    parseHTML() {
      return [{ tag: `p[data-writer-screenplay="${name}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        "p",
        mergeAttributes(HTMLAttributes, {
          class: `writer-sp writer-sp-${name}`,
          "data-writer-screenplay": name,
        }),
        0,
      ];
    },
    addProseMirrorPlugins() {
      if (name !== "parenthetical") return [];
      return [
        new Plugin({
          props: {
            decorations(state) {
              const widgets: Decoration[] = [];
              state.doc.descendants((node, pos) => {
                if (node.type.name !== "parenthetical") return;
                const paren = (text: string, side: number) =>
                  Decoration.widget(
                    side < 0 ? pos + 1 : pos + node.nodeSize - 1,
                    () => {
                      const element = document.createElement("span");
                      element.className = "writer-sp-paren";
                      element.textContent = text;
                      element.contentEditable = "false";
                      return element;
                    },
                    { side, ignoreSelection: true },
                  );
                widgets.push(paren("(", -1), paren(")", 1));
              });
              return DecorationSet.create(state.doc, widgets);
            },
          },
        }),
      ];
    },
  });
}

export const writerScreenplayNodes = WRITER_SCREENPLAY_BLOCKS.map((name) => screenplayBlock(name));

declare module "@tiptap/core" {
  interface Storage {
    writerScreenplayKeys: {
      enabled: boolean;
    };
  }
  interface Commands<ReturnType> {
    writerScreenplay: {
      setWriterBlock: (name: WriterScreenplayBlock | "paragraph") => ReturnType;
    };
  }
}

function screenplayKeysActive(editor: Editor): boolean {
  return editor.storage.writerScreenplayKeys?.enabled === true;
}

function replaceCurrentBlock(editor: Editor, name: string): boolean {
  const type = editor.schema.nodes[name];
  const { $from } = editor.state.selection;
  if (!type || !$from.parent.isTextblock) return false;
  editor.view.dispatch(editor.state.tr.setNodeMarkup($from.before(), type));
  return true;
}

export function applyWriterScreenplayEnter(editor: Editor): boolean {
  if (!screenplayKeysActive(editor)) return false;
  const { $from } = editor.state.selection;
  if (!$from.parent.isTextblock) return false;
  const target = writerScreenplayEnterTarget($from.parent.type.name, $from.parent.textContent.trim() === "");
  const type = editor.schema.nodes[target.type];
  if (!type) return false;
  if (target.mode === "set") return replaceCurrentBlock(editor, target.type);
  if (!canSplit(editor.state.doc, $from.pos, 1, [{ type }])) return false;
  editor.view.dispatch(editor.state.tr.split($from.pos, 1, [{ type }]));
  return true;
}

export function applyWriterScreenplayTab(editor: Editor, backward = false): boolean {
  if (!screenplayKeysActive(editor)) return false;
  const { $from } = editor.state.selection;
  if (!$from.parent.isTextblock) return false;
  const name = $from.parent.type.name;
  if (!isWriterScreenplayBlock(name) && name !== "paragraph" && !name.startsWith("heading")) return false;
  return replaceCurrentBlock(editor, writerScreenplayTabTarget(name, backward));
}

export const WriterScreenplayKeys = Extension.create({
  name: "writerScreenplayKeys",
  priority: 1000,
  addStorage() {
    return { enabled: false };
  },
  addCommands() {
    return {
      setWriterBlock:
        (name) =>
        ({ editor }) =>
          replaceCurrentBlock(editor, name),
    };
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => applyWriterScreenplayEnter(this.editor),
      Tab: () => applyWriterScreenplayTab(this.editor, false),
      "Shift-Tab": () => applyWriterScreenplayTab(this.editor, true),
    };
  },
});
