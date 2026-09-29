import { Editor } from "@tiptap/core";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./writer-ai-client", () => ({
  requestWriterAssist: vi.fn(),
  requestWriterAskStory: vi.fn(),
  requestWriterStoryUpdate: vi.fn(),
}));
import { NODE_REGISTRY } from "@/app/spaces/nodeRegistry";
import { spacesNodeTypes } from "@/app/spaces/spaces-react-flow-config";
import { WriterStudio } from "./WriterStudio";
import { requestWriterAskStory, requestWriterAssist, requestWriterStoryUpdate } from "./writer-ai-client";
import { WriterChapter, WriterChapterTitle } from "./writer-chapter";
import { createWriterStarterKit, writerScreenplayNodes } from "./writer-screenplay";
import { emptyWriterContent, writerChapterMap, writerPersistedPatch } from "./writer-document";

afterEach(() => {
  cleanup();
});

describe("Writer studio", () => {
  it("is registered as its own node, separate from Guionista", () => {
    expect(NODE_REGISTRY.writer.label).toBe("Writer");
    expect(NODE_REGISTRY.writer.outputs.map((output) => output.type)).toEqual(["txt", "prompt"]);
    expect(spacesNodeTypes.writer).not.toBe(spacesNodeTypes.guionista);
  });

  it("mounts the sheet with the document surface", async () => {
    render(
      <WriterStudio
        data={{ title: "Borrador", profile: "article", content: emptyWriterContent() }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Writer" })).toBeTruthy();
    expect(screen.getByDisplayValue("Borrador")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelector(".ProseMirror")).toBeTruthy();
    });
  });

  it("changes the page size from the menu without a second document", async () => {
    const user = userEvent.setup();
    render(
      <WriterStudio
        data={{ title: "Borrador", profile: "document", content: emptyWriterContent() }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Menú" }));
    expect(screen.queryByRole("menuitem", { name: "Negrita" })).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Diseño de página" }));
    expect(screen.getByRole("menuitemradio", { name: "A4" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Carta" }).textContent).toBe("LT");
    await user.click(screen.getByRole("menuitemradio", { name: "Carta" }));
    const sheet = document.querySelector(".writer-studio-page") as HTMLElement;
    expect(sheet.style.getPropertyValue("--writer-page-width")).toBe("816px");
    expect(document.querySelectorAll(".ProseMirror")).toHaveLength(1);
  });

  it("stores typed text in the document tree and derives outputs", () => {
    const editor = new Editor({
      extensions: [createWriterStarterKit()],
      content: emptyWriterContent(),
    });
    editor.commands.insertContent("Hola mundo");
    editor.commands.toggleBold();
    const patch = writerPersistedPatch({
      title: "Borrador",
      profile: "post",
      pagePreset: "a5",
      content: editor.getJSON(),
      documentId: "22222222-2222-4222-8222-222222222222",
      documentKey: "knowledge-files/user-assets/abc/writer-documents/doc.json",
    });
    editor.destroy();

    expect(patch.content).toBeNull();
    expect(patch.value).toContain("Hola mundo");
    expect(patch.promptValue).toContain("Hola mundo");
    expect(patch.profile).toBe("post");
    expect(patch.wordCount).toBe(2);
  });

  it("inserts a chapter into the same document and opens the map on demand", async () => {
    const editor = new Editor({
      extensions: [createWriterStarterKit(), WriterChapter, WriterChapterTitle, ...writerScreenplayNodes],
      content: emptyWriterContent(),
    });
    editor.commands.insertWriterChapter();
    const map = writerChapterMap(editor.getJSON());
    editor.destroy();
    expect(map).toHaveLength(1);
    expect(map[0]?.title).toBe("Sin título");
    expect(map[0]?.id).toBeTruthy();

    const user = userEvent.setup();
    render(
      <WriterStudio
        data={{ title: "Borrador", profile: "document", content: emptyWriterContent() }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("complementary", { name: "Mapa del documento" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Menú" }));
    expect(screen.queryByRole("menuitem", { name: "Mapa del documento" })).toBeNull();
    cleanup();
    render(
      <WriterStudio
        data={{
          title: "Borrador",
          profile: "document",
          content: { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Inicio" }] }] },
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Menú" }));
    await user.click(screen.getByRole("menuitem", { name: "Mapa del documento" }));
    expect(screen.getByText("Todavía no hay capítulos.")).toBeTruthy();
    expect(document.querySelectorAll(".ProseMirror")).toHaveLength(1);
  });

  it("uses screenplay blocks when the document type is guion", async () => {
    const user = userEvent.setup();
    render(
      <WriterStudio
        data={{ title: "Escena", profile: "screenplay", content: emptyWriterContent() }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(document.querySelector(".writer-studio-main > .writer-block-palette")).toBeNull();
    expect(document.querySelector(".writer-studio-main")?.firstElementChild).toHaveClass("writer-studio-page");
    await waitFor(() => expect(document.querySelector("[data-writer-screenplay='sceneHeading']")).toBeTruthy());
    document.querySelector("[data-writer-screenplay='sceneHeading']")?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    await user.click(await screen.findByRole("button", { name: "Cambiar bloque" }));
    const palette = screen.getByRole("toolbar", { name: "Estilo del bloque" });
    expect(within(palette).getByRole("button", { name: "Acción" }).textContent).toBe("¶");
    expect(within(palette).getByRole("button", { name: "Encabezado" }).textContent).toBe("#");
    await user.click(within(palette).getByRole("button", { name: "Personaje" }));
    await waitFor(() => expect(document.querySelector("[data-writer-screenplay='character']")).toBeTruthy());
    expect(screen.queryByRole("toolbar", { name: "Estilo del bloque" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Menú" }));
    expect(screen.queryByRole("menuitemradio", { name: "Acción" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Negrita" })).toBeNull();
    expect(document.querySelector(".writer-studio-page.is-screenplay")).toBeTruthy();
    expect(document.querySelectorAll(".ProseMirror")).toHaveLength(1);
  });

  it("keeps the page unchanged until the proposal is accepted", async () => {
    vi.mocked(requestWriterAssist).mockReset();
    vi.mocked(requestWriterAssist).mockResolvedValueOnce({ ok: true, text: "seguía lloviendo" });
    const user = userEvent.setup();
    render(
      <WriterStudio
        data={{ title: "Borrador", profile: "document", content: emptyWriterContent() }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Writer AI" }));
    expect(screen.getByRole("button", { name: "Reescribir" })).toBeDisabled();
    await waitFor(() => expect(document.querySelector(".ProseMirror")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("seguía lloviendo")).toBeTruthy();
    expect(document.querySelector(".ProseMirror")?.textContent ?? "").not.toContain("seguía lloviendo");
    await user.click(screen.getByRole("button", { name: "Comparar" }));
    expect(screen.getByText("En el cursor")).toBeTruthy();
    expect(requestWriterAssist).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Aceptar" }));
    await waitFor(() => {
      expect(document.querySelector(".ProseMirror")?.textContent ?? "").toContain("seguía lloviendo");
    });
    expect(requestWriterAssist).toHaveBeenCalledTimes(1);
  });

  it("does not ask again when the proposal fails", async () => {
    vi.mocked(requestWriterAssist).mockReset();
    vi.mocked(requestWriterAssist).mockResolvedValueOnce({ ok: false, error: "No se ha podido escribir la propuesta." });
    const user = userEvent.setup();
    render(
      <WriterStudio
        data={{ title: "Borrador", profile: "document", content: emptyWriterContent() }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Writer AI" }));
    await waitFor(() => expect(document.querySelector(".ProseMirror")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeTruthy();
    expect(requestWriterAssist).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".ProseMirror")?.textContent ?? "").not.toContain("propuesta");
  });

  it("marks a note as canon and can move it to idea", async () => {
    const user = userEvent.setup();
    render(
      <WriterStudio
        data={{ title: "Borrador", profile: "document", content: emptyWriterContent() }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Menú" }));
    await user.click(screen.getByRole("menuitem", { name: "Memory" }));
    expect(screen.getByText("Nada guardado.")).toBeTruthy();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m", ctrlKey: true, shiftKey: true, bubbles: true }));
    await user.type(await screen.findByRole("textbox", { name: "Recordar" }), "María vive en la casa");
    await user.keyboard("{Enter}");
    expect(screen.getByText("María vive en la casa")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Opciones de memoria" }));
    await user.click(screen.getByRole("button", { name: "Tratar como posibilidad" }));
    expect(screen.getByText("~")).toBeTruthy();
  });

  it("keeps a single side panel open and saves memory from the shortcut", async () => {
    const user = userEvent.setup();
    render(
      <WriterStudio
        data={{
          title: "Borrador",
          profile: "document",
          content: { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Inicio" }] }] },
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Menú" }));
    await user.click(screen.getByRole("menuitem", { name: "Mapa del documento" }));
    expect(screen.getByRole("complementary", { name: "Mapa del documento" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Menú" }));
    await user.click(screen.getByRole("menuitem", { name: "Memory" }));
    expect(screen.queryByRole("complementary", { name: "Mapa del documento" })).toBeNull();
    expect(screen.getByRole("complementary", { name: "Memoria del documento" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Writer AI" }));
    expect(screen.queryByRole("complementary", { name: "Memoria del documento" })).toBeNull();
    expect(screen.getByRole("region", { name: "Propuesta de Writer" })).toBeTruthy();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m", ctrlKey: true, shiftKey: true, bubbles: true }));
    const composer = await screen.findByRole("dialog", { name: "Recordar" });
    expect(composer).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "Recordar" }), "Marta odia conducir");
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog", { name: "Recordar" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Memoria del documento" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Menú" }));
    await user.click(screen.getByRole("menuitem", { name: "Memory" }));
    expect(screen.getByText("Marta odia conducir")).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "Buscar memoria" }), "piano");
    expect(screen.getByText("Nada coincide.")).toBeTruthy();
    expect(screen.queryByText("Marta odia conducir")).toBeNull();
  });

  it("sends the related canon with a continue request", async () => {
    vi.mocked(requestWriterAssist).mockReset();
    vi.mocked(requestWriterAssist).mockResolvedValueOnce({ ok: true, text: "se detiene" });
    const user = userEvent.setup();
    render(
      <WriterStudio
        data={{
          title: "Borrador",
          profile: "document",
          content: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Marta entra en el hospital." }] }],
          },
          memory: [{ id: "m1", kind: "canon", text: "Marta no entra en hospitales desde la muerte de su hermano." }],
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector(".ProseMirror")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Writer AI" }));
    expect(screen.getByText(/Contexto: Marta/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText("se detiene");
    expect(requestWriterAssist).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          line: expect.stringContaining("Marta"),
          memories: [expect.objectContaining({ kind: "canon", text: expect.stringContaining("hospitales") })],
        }),
      }),
    );
  });

  it("remembers a fact about Ana without storing her name as the note", async () => {
    const user = userEvent.setup();
    render(
      <WriterStudio
        data={{
          title: "Escena",
          profile: "screenplay",
          content: {
            type: "doc",
            content: [{ type: "character", content: [{ type: "text", text: "ANA" }] }],
          },
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector("[data-writer-screenplay='character']")).toBeTruthy());
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m", ctrlKey: true, shiftKey: true, bubbles: true }));
    const composer = await screen.findByRole("dialog", { name: "Recordar" });
    expect(composer).toBeTruthy();
    expect(within(composer).getByText("[Ana]")).toBeTruthy();
    expect(within(composer).getByText("¿Qué quieres recordar sobre Ana?")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Ámbito" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Recordar" })).toHaveValue("");
    expect(screen.getByPlaceholderText("¿Qué quieres recordar sobre Ana?")).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "Memoria del documento" })).toBeNull();
    await user.type(screen.getByRole("textbox", { name: "Recordar" }), "se le murieron los padres");
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog", { name: "Recordar" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Menú" }));
    await user.click(screen.getByRole("menuitem", { name: "Memory" }));
    await user.click(screen.getByRole("button", { name: /^Ana/ }));
    expect(screen.getByRole("heading", { name: "ANA" })).toBeTruthy();
    expect(screen.getByText("se le murieron los padres")).toBeTruthy();
  });

  it("associates a typed note with Ana when she is the clear subject", async () => {
    const user = userEvent.setup();
    render(
      <WriterStudio
        data={{
          title: "Escena",
          profile: "screenplay",
          content: {
            type: "doc",
            content: [{ type: "character", content: [{ type: "text", text: "ANA" }] }],
          },
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector(".ProseMirror")).toBeTruthy());
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m", ctrlKey: true, shiftKey: true, bubbles: true }));
    await user.type(await screen.findByRole("textbox", { name: "Recordar" }), "ana no sabe leer");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Menú" }));
    await user.click(screen.getByRole("menuitem", { name: "Memory" }));
    await user.click(screen.getByRole("button", { name: /^Ana/ }));
    expect(screen.getByRole("heading", { name: "ANA" })).toBeTruthy();
    expect(screen.getByText("no sabe leer")).toBeTruthy();
  });

  it("shows the continuity note as text and the choices as buttons", async () => {
    vi.mocked(requestWriterAssist).mockReset();
    const user = userEvent.setup();
    render(
      <WriterStudio
        data={{
          title: "Escena",
          profile: "screenplay",
          content: {
            type: "doc",
            content: [
              { type: "character", content: [{ type: "text", text: "ANA" }] },
              { type: "dialogue", content: [{ type: "text", text: "pues lo leí ayer" }] },
            ],
          },
          memory: [
            { id: "read", kind: "canon", text: "no sabe leer", scope: { type: "entity", entityId: "ana" } },
            { id: "days", kind: "canon", text: "La historia sucede durante tres días" },
          ],
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector(".writer-signal-conflict")).toBeTruthy());
    document.querySelector(".writer-signal-conflict")?.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: -20, clientY: 8 }));
    const popover = await screen.findByRole("dialog", { name: "Posible incoherencia" });
    expect(popover.textContent).toContain("ANA");
    expect(within(popover).getByText("Memory").tagName).not.toBe("BUTTON");
    expect(within(popover).getByText("no sabe leer").tagName).toBe("BLOCKQUOTE");
    expect(within(popover).getByText("Aquí").tagName).not.toBe("BUTTON");
    expect(within(popover).getByText("pues lo leí ayer").tagName).toBe("BLOCKQUOTE");
    expect(screen.getByRole("button", { name: "Editar memory" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mantener texto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "✦ Corregir con IA" })).toBeTruthy();
    expect(requestWriterAssist).not.toHaveBeenCalled();
    popover.ownerDocument.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Posible incoherencia" })).toBeNull());
  });

  it("dismisses one continuity warning without calling the model", async () => {
    vi.mocked(requestWriterAssist).mockReset();
    render(
      <WriterStudio
        data={{
          title: "Escena",
          profile: "screenplay",
          content: {
            type: "doc",
            content: [
              { type: "character", content: [{ type: "text", text: "ANA" }] },
              { type: "dialogue", content: [{ type: "text", text: "pues lo leí ayer" }] },
            ],
          },
          memory: [{ id: "read", kind: "canon", text: "no sabe leer", scope: { type: "entity", entityId: "ana" } }],
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector(".writer-signal-conflict")).toBeTruthy());
    document.querySelector(".writer-signal-conflict")?.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: -20, clientY: 8 }));
    await screen.findByRole("dialog", { name: "Posible incoherencia" });
    (screen.getByRole("button", { name: "Mantener texto" }) as HTMLButtonElement).click();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Posible incoherencia" })).toBeNull();
      expect(document.querySelector(".writer-signal-conflict")).toBeNull();
    });
    expect(requestWriterAssist).not.toHaveBeenCalled();
  });

  it("edits the conflicting memory instead of the top of the list", async () => {
    vi.mocked(requestWriterAssist).mockReset();
    render(
      <WriterStudio
        data={{
          title: "Escena",
          profile: "screenplay",
          content: {
            type: "doc",
            content: [
              { type: "character", content: [{ type: "text", text: "ANA" }] },
              { type: "dialogue", content: [{ type: "text", text: "pues lo leí ayer" }] },
            ],
          },
          memory: [
            { id: "days", kind: "canon", text: "La historia sucede durante tres días" },
            { id: "read", kind: "canon", text: "no sabe leer", scope: { type: "entity", entityId: "ana" } },
          ],
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector(".writer-signal-conflict")).toBeTruthy());
    document.querySelector(".writer-signal-conflict")?.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: -20, clientY: 8 }));
    await screen.findByRole("dialog", { name: "Posible incoherencia" });
    (screen.getByRole("button", { name: "Editar memory" }) as HTMLButtonElement).click();
    const field = await screen.findByRole("textbox", { name: "Editar memoria" });
    expect(field).toHaveValue("no sabe leer");
    expect(screen.getByRole("heading", { name: "ANA" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Memoria del documento" })).toBeTruthy();
    expect(requestWriterAssist).not.toHaveBeenCalled();
  });

  it("keeps a long memory closed until it is asked for", async () => {
    const user = userEvent.setup();
    const memory = Array.from({ length: 500 }, (_, index) => ({
      id: `n${index}`,
      kind: "canon" as const,
      text: `Recuerdo número ${index} sobre un detalle distinto`,
    }));
    render(
      <WriterStudio
        data={{ title: "Libro", profile: "document", content: emptyWriterContent(), memory }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector(".ProseMirror")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Memoria" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Memoria del documento" })).toBeNull();
    expect(document.querySelectorAll(".writer-memory article")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Menú" }));
    await user.click(screen.getByRole("menuitem", { name: "Memory" }));
    expect(screen.getByRole("complementary", { name: "Memoria del documento" })).toBeTruthy();
    expect(document.querySelectorAll(".writer-memory article").length).toBeLessThanOrEqual(8);
    expect(screen.getByText("General")).toBeTruthy();
  });

  it("warns about selectividad without opening memory", async () => {
    vi.mocked(requestWriterAssist).mockReset();
    render(
      <WriterStudio
        data={{
          title: "Escena",
          profile: "screenplay",
          content: {
            type: "doc",
            content: [
              { type: "character", content: [{ type: "text", text: "ANA" }] },
              { type: "dialogue", content: [{ type: "text", text: "cuando aprobé selectividad se me abrió un nuevo mundo" }] },
            ],
          },
          memory: [{ id: "exam", kind: "canon", text: "suspendió selectividad", scope: { type: "entity", entityId: "ana" } }],
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector(".writer-signal-conflict")).toBeTruthy());
    expect(screen.queryByRole("complementary", { name: "Memoria del documento" })).toBeNull();
    expect(requestWriterAssist).not.toHaveBeenCalled();
  });

  it("does not mark a dialogue that does not touch what is known", async () => {
    render(
      <WriterStudio
        data={{
          title: "Escena",
          profile: "screenplay",
          content: {
            type: "doc",
            content: [
              { type: "character", content: [{ type: "text", text: "ANA" }] },
              { type: "dialogue", content: [{ type: "text", text: "hoy quiero un café." }] },
            ],
          },
          memory: [{ id: "parents", kind: "canon", text: "sus padres murieron", scope: { type: "entity", entityId: "ana" } }],
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector("[data-writer-screenplay='dialogue']")).toBeTruthy());
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    expect(document.querySelector(".writer-signal-memory")).toBeNull();
    expect(document.querySelector(".writer-signal-conflict")).toBeNull();
  });

  it("surfaces a related idea beside the cemetery scene", async () => {
    vi.mocked(requestWriterAssist).mockReset();
    render(
      <WriterStudio
        data={{
          title: "Escena",
          profile: "screenplay",
          content: {
            type: "doc",
            content: [
              { type: "character", content: [{ type: "text", text: "ANA" }] },
              { type: "action", content: [{ type: "text", text: "Ana camina por el cementerio." }] },
            ],
          },
          memory: [{ id: "tomb", kind: "idea", text: "podría visitar la tumba de sus padres", scope: { type: "entity", entityId: "ana" } }],
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector(".writer-signal-memory")).toBeTruthy());
    document.querySelector(".writer-signal-memory")?.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: -20, clientY: 8 }));
    expect(await screen.findByRole("dialog", { name: "Idea pendiente" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Usar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Después" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Descartar" })).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "Memoria del documento" })).toBeNull();
    expect(requestWriterAssist).not.toHaveBeenCalled();
  });

  it("keeps a remembered note in Story without opening Story first", async () => {
    const user = userEvent.setup();
    render(
      <WriterStudio
        data={{
          title: "Escena",
          profile: "screenplay",
          content: { type: "doc", content: [{ type: "character", content: [{ type: "text", text: "ANA" }] }] },
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector("[data-writer-screenplay='character']")).toBeTruthy());
    expect(screen.queryByRole("region", { name: "Story" })).toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m", ctrlKey: true, shiftKey: true, bubbles: true }));
    await user.type(await screen.findByRole("textbox", { name: "Recordar" }), "se le murieron los padres");
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("region", { name: "Story" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Story" }));
    await user.click(within(screen.getByRole("navigation", { name: "Navegación de Story" })).getByRole("button", { name: "Ana" }));
    expect(screen.getByText("se le murieron los padres")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Ahora" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Recorrido" })).toBeNull();
  });

  it("creates a character in Story and restores the page when returning to Write", async () => {
    const user = userEvent.setup();
    render(
      <WriterStudio
        data={{
          title: "Escena",
          profile: "document",
          content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "El faro sigue encendido." }] }] },
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector(".ProseMirror")).toBeTruthy());
    const page = document.querySelector(".writer-studio-page") as HTMLElement;
    page.scrollTop = 180;
    await user.click(screen.getByRole("button", { name: "Story" }));
    expect(document.querySelector(".ProseMirror")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "+ Nuevo" }));
    await user.click(screen.getByRole("menuitem", { name: "Personaje" }));
    await user.type(screen.getByRole("textbox", { name: "Nombre del personaje" }), "Pedro");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "+ Definir personaje" }));
    await user.type(screen.getByRole("textbox", { name: "Perfil" }), "Guarda el faro.");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await user.click(screen.getByRole("button", { name: "+ Añadir" }));
    await user.type(screen.getByRole("textbox", { name: "Nota" }), "No habla del accidente.");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByText("No habla del accidente.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Volver a Write" }));
    await waitFor(() => expect(page.scrollTop).toBe(180));
    expect(screen.queryByRole("region", { name: "Story" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Story" }));
    await user.click(within(screen.getByRole("navigation", { name: "Navegación de Story" })).getByRole("button", { name: "Pedro" }));
    expect(screen.getByText("Guarda el faro.")).toBeTruthy();
    expect(screen.getByText("No habla del accidente.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "+ Nuevo" }));
    await user.click(screen.getByRole("menuitem", { name: "Elemento de historia" }));
    await user.type(screen.getByRole("textbox", { name: "Nombre del elemento" }), "La casa");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: "La casa" })).toBeTruthy();
  });

  it("lists where Pedro appears and returns to that block", async () => {
    const user = userEvent.setup();
    render(
      <WriterStudio
        data={{
          title: "Escena",
          profile: "screenplay",
          story: {
            entities: [
              {
                id: "entity-pedro",
                label: "Pedro",
                aliases: ["Pedro"],
                group: "character",
                bound: "entity",
                definition: "Guarda el faro.",
                notes: [],
                events: [],
                stateSummary: null,
                traceSummary: null,
              },
            ],
            looseNotes: [],
          },
          content: {
            type: "doc",
            content: [
              { type: "character", attrs: { blockId: "cue-pedro" }, content: [{ type: "text", text: "PEDRO" }] },
              { type: "action", attrs: { blockId: "act-pedro" }, content: [{ type: "text", text: "Pedro entra en la habitación." }] },
            ],
          },
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector("[data-writer-screenplay='character']")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Story" }));
    await user.click(within(screen.getByRole("navigation", { name: "Navegación de Story" })).getByRole("button", { name: "Pedro" }));
    expect(screen.getByRole("button", { name: "2 referencias →" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Ahora" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Recorrido" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "2 referencias →" }));
    await user.click(document.querySelector("[data-appearance='cue-pedro']") as HTMLElement);
    await waitFor(() => expect(document.querySelector(".writer-block-flash")).toBeTruthy());
    expect(screen.queryByRole("region", { name: "Story" })).toBeNull();
    expect(document.querySelector("[data-writer-block='cue-pedro']")).toBeTruthy();
  });

  it("answers a local Story question without calling the model", async () => {
    const user = userEvent.setup();
    vi.mocked(requestWriterAskStory).mockReset();
    render(
      <WriterStudio
        data={{
          title: "Escena",
          profile: "screenplay",
          story: {
            entities: [
              {
                id: "entity-pedro",
                label: "Pedro",
                aliases: ["Pedro"],
                group: "character",
                bound: "entity",
                definition: "Pedro tiene 38 años. Es orgulloso, reservado y no sabe pedir ayuda.",
                notes: [
                  {
                    id: "note-sister",
                    seq: 1,
                    text: "Su hermana es la única persona ante la que muestra vulnerabilidad.",
                    status: "established",
                    authority: "author",
                    idea: null,
                  },
                ],
                events: [],
                stateSummary: null,
                traceSummary: null,
              },
            ],
            looseNotes: [],
          },
          content: {
            type: "doc",
            content: [
              { type: "character", attrs: { blockId: "cue-pedro" }, content: [{ type: "text", text: "PEDRO" }] },
              { type: "action", attrs: { blockId: "act-pedro" }, content: [{ type: "text", text: "Pedro deja las llaves y sale al puerto." }] },
            ],
          },
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector("[data-writer-block='act-pedro']")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Story" }));
    await user.click(within(screen.getByRole("navigation", { name: "Navegación de Story" })).getByRole("button", { name: "Pedro" }));
    await user.type(screen.getByRole("textbox", { name: "Pregunta sobre Pedro" }), "¿Cuántas veces aparece Pedro?");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    expect(screen.getByText("Pedro aparece 2 veces.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pedro" })).toBeTruthy();
    expect(requestWriterAskStory).not.toHaveBeenCalled();
    expect(requestWriterAssist).not.toHaveBeenCalled();
  });

  it("asks Story once and saves the answer as an idea", async () => {
    const user = userEvent.setup();
    vi.mocked(requestWriterAskStory).mockReset();
    vi.mocked(requestWriterAskStory).mockResolvedValueOnce({
      ok: true,
      answer: "Una posible motivación sería recuperar el control sobre su vida.",
      suggestedMemories: [{ text: "Pedro podría intentar proteger a Ana para evitar afrontar su propia vulnerabilidad." }],
      usedContextSummary: "",
      storyDelta: null,
    });
    render(
      <WriterStudio
        data={{
          title: "Escena",
          profile: "screenplay",
          story: {
            entities: [
              {
                id: "entity-pedro",
                label: "Pedro",
                aliases: ["Pedro"],
                group: "character",
                bound: "entity",
                definition: "Pedro tiene 38 años. Es orgulloso, reservado y no sabe pedir ayuda.",
                notes: [
                  {
                    id: "note-sister",
                    seq: 1,
                    text: "Su hermana es la única persona ante la que muestra vulnerabilidad.",
                    status: "established",
                    authority: "author",
                    idea: null,
                  },
                ],
                events: [],
                stateSummary: null,
                traceSummary: null,
              },
            ],
            looseNotes: [],
          },
          content: {
            type: "doc",
            content: [
              { type: "action", attrs: { blockId: "act-pedro" }, content: [{ type: "text", text: "Pedro deja las llaves y sale al puerto." }] },
            ],
          },
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector("[data-writer-block='act-pedro']")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Story" }));
    await user.click(within(screen.getByRole("navigation", { name: "Navegación de Story" })).getByRole("button", { name: "Pedro" }));
    await user.type(screen.getByRole("textbox", { name: "Pregunta sobre Pedro" }), "¿Cuál podría ser ahora la motivación de Pedro?");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    expect(await screen.findByText("Una posible motivación sería recuperar el control sobre su vida.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pedro" })).toBeTruthy();
    expect(screen.getByText("Pedro tiene 38 años. Es orgulloso, reservado y no sabe pedir ayuda.")).toBeTruthy();
    expect(requestWriterAskStory).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(requestWriterAskStory).mock.calls[0]?.[0];
    expect(JSON.stringify(payload?.storyContext)).toContain("orgulloso");
    expect(JSON.stringify(payload?.storyContext)).toContain("vulnerabilidad");
    expect(JSON.stringify(payload?.storyContext)).toContain("puerto");
    await user.click(screen.getByRole("button", { name: "Guardar como idea" }));
    expect(screen.getByText(/Pedro podría intentar proteger a Ana/)).toBeTruthy();
    expect(requestWriterAskStory).toHaveBeenCalledTimes(1);
  });

  it("shows Ahora and Recorrido from one Ask Story answer without storing the motivation", async () => {
    const user = userEvent.setup();
    vi.mocked(requestWriterAskStory).mockReset();
    vi.mocked(requestWriterAskStory).mockResolvedValueOnce({
      ok: true,
      answer: "Una posible motivación sería vengarse de Juan.",
      suggestedMemories: [],
      usedContextSummary: "",
      storyDelta: {
        events: [
          { entityId: "entity-pedro", text: "Pedro salta del barco.", sourceBlockIds: ["jump"], evidence: [{ blockId: "jump", text: "Pedro salta del barco." }], confidence: 0.98, predicate: "", value: "" },
          { entityId: "entity-pedro", text: "Pedro se lesiona la pierna derecha.", sourceBlockIds: ["hurt"], evidence: [{ blockId: "hurt", text: "se lesiona la pierna derecha" }], confidence: 0.96, predicate: "", value: "" },
        ],
        stateChanges: [
          {
            entityId: "entity-pedro",
            predicate: "physical.right_leg",
            value: "injured",
            text: "Pierna derecha lesionada.",
            sourceBlockIds: ["hurt"],
            evidence: [{ blockId: "hurt", text: "se lesiona la pierna derecha" }],
            confidence: 0.95,
          },
        ],
        facts: [],
        analyzedBlockIds: ["jump", "hurt"],
      },
    });
    render(
      <WriterStudio
        data={{
          title: "Escena",
          profile: "screenplay",
          story: {
            entities: [
              {
                id: "entity-pedro",
                label: "Pedro",
                aliases: ["Pedro"],
                group: "character",
                bound: "entity",
                definition: "Pedro tiene 38 años.",
                notes: [],
                events: [],
                stateSummary: null,
                traceSummary: null,
              },
            ],
            looseNotes: [],
          },
          content: {
            type: "doc",
            content: [
              { type: "action", attrs: { blockId: "jump" }, content: [{ type: "text", text: "Pedro salta del barco." }] },
              { type: "action", attrs: { blockId: "hurt" }, content: [{ type: "text", text: "Pedro se lesiona la pierna derecha." }] },
            ],
          },
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector("[data-writer-block='hurt']")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Story" }));
    await user.click(within(screen.getByRole("navigation", { name: "Navegación de Story" })).getByRole("button", { name: "Pedro" }));
    await user.type(screen.getByRole("textbox", { name: "Pregunta sobre Pedro" }), "¿Cuál podría ser ahora la motivación de Pedro?");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    expect(await screen.findByText("Una posible motivación sería vengarse de Juan.")).toBeTruthy();
    expect(requestWriterAskStory).toHaveBeenCalledTimes(1);
    const now = screen.getByRole("heading", { name: "Ahora" }).closest("section");
    expect(now?.textContent).toContain("Pierna derecha lesionada.");
    expect(now?.textContent).not.toMatch(/vengarse/);
    expect(screen.getByRole("heading", { name: "Recorrido" })).toBeTruthy();
    expect(screen.getByText("Pedro tiene 38 años.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Ver recorrido →" }));
    expect(document.querySelector("[data-event='jump']")?.textContent).toContain("Pedro salta del barco.");
    expect(screen.getByRole("button", { name: "← Pedro" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "← Pedro" }));
    expect(screen.getByText("Pedro tiene 38 años.")).toBeTruthy();
  });

  it("does not call Update Story until the author confirms it", async () => {
    const user = userEvent.setup();
    vi.mocked(requestWriterStoryUpdate).mockReset();
    vi.mocked(requestWriterAskStory).mockReset();
    vi.mocked(requestWriterStoryUpdate).mockResolvedValueOnce({
      ok: true,
      storyDelta: {
        events: [
          {
            entityId: "entity-pedro",
            text: "Pedro salta del barco.",
            sourceBlockIds: ["jump"],
            evidence: [{ blockId: "jump", text: "Pedro salta del barco." }],
            confidence: 0.96,
            predicate: "",
            value: "",
          },
        ],
        stateChanges: [],
        facts: [],
        analyzedBlockIds: ["jump"],
        chapterSummaries: [],
      },
    });
    render(
      <WriterStudio
        data={{
          title: "Escena",
          profile: "screenplay",
          story: {
            entities: [
              {
                id: "entity-pedro",
                label: "Pedro",
                aliases: ["Pedro"],
                group: "character",
                bound: "entity",
                definition: "Pedro tiene 38 años.",
                notes: [],
                events: [],
                stateSummary: null,
                traceSummary: null,
              },
            ],
            looseNotes: [],
          },
          content: {
            type: "doc",
            content: [{ type: "action", attrs: { blockId: "jump" }, content: [{ type: "text", text: "Pedro salta del barco." }] }],
          },
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(document.querySelector("[data-writer-block='jump']")).toBeTruthy());
    expect(requestWriterStoryUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Story" })).toHaveAttribute("title", "Story · 1 cambio");
    await user.click(screen.getByRole("button", { name: "Story" }));
    expect(screen.getByText("1 cambio nuevo")).toBeTruthy();
    expect(requestWriterStoryUpdate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Actualizar Story" }));
    expect(requestWriterStoryUpdate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(requestWriterStoryUpdate).mock.calls[0]?.[1]).toEqual({ skipPreflight: false });
    expect(vi.mocked(requestWriterStoryUpdate).mock.calls[0]?.[0]?.preview.calls).toBe(1);
    expect(requestWriterAskStory).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Volver a Write" })).toBeTruthy();
    await user.click(within(screen.getByRole("navigation", { name: "Navegación de Story" })).getByRole("button", { name: /Pedro/ }));
    expect(screen.getByRole("heading", { name: "Recorrido" })).toBeTruthy();
    expect(screen.queryByText("1 cambio nuevo")).toBeNull();
  });
});
