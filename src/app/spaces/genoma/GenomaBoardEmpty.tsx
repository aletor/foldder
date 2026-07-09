"use client";

import React from "react";

export function GenomaBoardEmpty() {
  return (
    <div className="genoma-board-empty" aria-label="Libro de marca vacío">
      <p className="genoma-board-empty__label">libro de marca</p>
      <h2 className="genoma-board-empty__title">Tu marca, desglosada</h2>
      <p className="genoma-board-empty__copy">
        Pega una url o suelta material a la izquierda. El ADN aparecerá aquí, editable y listo para Foldder.
      </p>
    </div>
  );
}
