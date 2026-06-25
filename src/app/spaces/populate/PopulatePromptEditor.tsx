"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

/**
 * Editor de prompt con CHIPS visuales para los campos del Dataset.
 *
 * El usuario nunca escribe tokens `{campo}` a mano: elige una columna en el
 * selector y se inserta como un chip (bloque con estilo, contentEditable=false).
 * Internamente el valor sigue siendo una cadena con tokens `{fieldKey}` (lo que
 * consume la resolución por fila), pero el usuario solo ve e interactúa con chips.
 *
 * - Vinculado a la columna real: el chip muestra el `label` actual (si la columna
 *   se renombra, el chip se actualiza); si la columna desaparece, se marca inválido.
 * - Agnóstico al nodo: recibe los campos disponibles por props.
 */

export interface PromptEditorField {
  key: string;
  label: string;
}

export interface PopulatePromptEditorProps {
  /** Valor con tokens `{fieldKey}` (fuente de verdad en datos de Populate). */
  value: string;
  /** Campos cuyo key resuelve un chip válido (listado + constantes). */
  fields: PromptEditorField[];
  /** Campos ofrecidos en el selector "Insertar campo" (texto). */
  insertableFields: PromptEditorField[];
  label?: string;
  placeholder?: string;
  onChange: (next: string) => void;
}

const TOKEN_RE = /\{([a-zA-Z0-9_-]+)\}/g;

function applyChipStyle(
  span: HTMLElement,
  key: string,
  field: PromptEditorField | undefined,
): void {
  span.dataset.fieldKey = key;
  span.contentEditable = "false";
  span.className = `populate-chip${field ? "" : " populate-chip--invalid"}`;
  span.textContent = field ? field.label : key;
  span.title = field ? `Campo: ${field.label}` : `Columna no encontrada: ${key}`;
}

function createChip(key: string, field: PromptEditorField | undefined): HTMLElement {
  const span = document.createElement("span");
  applyChipStyle(span, key, field);
  return span;
}

/** Construye los nodos del editor (texto + chips) a partir del valor con tokens. */
function buildDom(
  root: HTMLElement,
  value: string,
  fieldByKey: Map<string, PromptEditorField>,
): void {
  root.innerHTML = "";
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(value)) !== null) {
    if (match.index > last) {
      root.appendChild(document.createTextNode(value.slice(last, match.index)));
    }
    root.appendChild(createChip(match[1]!, fieldByKey.get(match[1]!)));
    last = match.index + match[0].length;
  }
  if (last < value.length) {
    root.appendChild(document.createTextNode(value.slice(last)));
  }
}

/** Serializa el DOM del editor de vuelta a una cadena con tokens `{fieldKey}`. */
function serialize(root: HTMLElement): string {
  let out = "";
  const walk = (node: ChildNode, isBlock: boolean) => {
    if (isBlock && out.length > 0 && !out.endsWith("\n")) out += "\n";
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
      } else if (child instanceof HTMLElement) {
        if (child.dataset.fieldKey) {
          out += `{${child.dataset.fieldKey}}`;
        } else if (child.tagName === "BR") {
          out += "\n";
        } else {
          walk(child, child.tagName === "DIV" || child.tagName === "P");
        }
      }
    });
  };
  walk(root, false);
  return out;
}

export function PopulatePromptEditor({
  value,
  fields,
  insertableFields,
  label = "Prompt",
  placeholder = "Texto fijo + campos del Dataset…",
  onChange,
}: PopulatePromptEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  /** Última cadena emitida por el editor; evita reconstruir DOM al teclear. */
  const lastSerialized = useRef<string | null>(null);

  const fieldByKey = useMemo(
    () => new Map(fields.map((f) => [f.key, f])),
    [fields],
  );

  // Reconstruye el DOM solo cuando el valor externo difiere de lo que emitimos
  // (inserción de chip, semilla, cambio de plantilla). Al teclear no se reconstruye.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastSerialized.current) {
      buildDom(el, value, fieldByKey);
      lastSerialized.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Campos renombrados / inválidos: actualiza chips en sitio sin tocar el cursor.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.querySelectorAll<HTMLElement>("[data-field-key]").forEach((chip) => {
      const key = chip.dataset.fieldKey;
      if (key) applyChipStyle(chip, key, fieldByKey.get(key));
    });
  }, [fieldByKey]);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const next = serialize(el);
    lastSerialized.current = next;
    onChange(next);
  }, [onChange]);

  const insertField = useCallback(
    (key: string) => {
      const el = editorRef.current;
      if (!el || !key) return;
      el.focus();
      const selection = window.getSelection();
      let range =
        selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      if (!range || !el.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
      }
      range.deleteContents();
      const chip = createChip(key, fieldByKey.get(key));
      range.insertNode(chip);
      const spacer = document.createTextNode(" ");
      chip.after(spacer);
      const after = document.createRange();
      after.setStartAfter(spacer);
      after.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(after);
      emit();
    },
    [emit, fieldByKey],
  );

  return (
    <div className="populate-prompt-editor-wrap">
      <div className="populate-template-panel__row">
        <span className="populate-template-panel__label">{label}</span>
        <select
          className="populate-template-panel__select nodrag"
          value=""
          onChange={(e) => {
            insertField(e.target.value);
            e.target.value = "";
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Insertar campo del Dataset"
          disabled={insertableFields.length === 0}
        >
          <option value="">
            {insertableFields.length === 0 ? "Sin columnas" : "Insertar campo ▾"}
          </option>
          {insertableFields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div
        ref={editorRef}
        className="populate-prompt-editor nodrag"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        data-placeholder={placeholder}
        spellCheck={false}
        onInput={emit}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
