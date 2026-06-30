"use client";

import { ImageIcon, Type, Users } from "lucide-react";
import type { VerticalCarouselSlide } from "../containers/types";
import "./studio-panel.css";

function StudioSlideJugador() {
  return (
    <div className="studio-panel">
      <p className="studio-panel__hint">
        Elige la carpeta de jugador. Solo verás el panel del elemento seleccionado.
      </p>
      <ul className="studio-panel__tabs" aria-label="Jugadores">
        <li>
          <button type="button" className="studio-panel__tab">
            PLAYER_1
          </button>
        </li>
        <li>
          <button type="button" className="studio-panel__tab is-active">
            PLAYER_2
          </button>
        </li>
      </ul>
      <div className="studio-panel__card">
        <div className="studio-panel__head">
          <span className="studio-panel__avatar" aria-hidden>
            <Users size={12} />
          </span>
          <span className="studio-panel__name">PLAYER_2</span>
          <label className="studio-panel__manual">
            <input type="checkbox" readOnly />
            Manual
          </label>
        </div>
      </div>
      <p className="studio-panel__section-title">Conexión al dataset</p>
      <p className="studio-panel__hint">
        Cada hueco del diseño usa una columna de la fila elegida abajo.
      </p>
    </div>
  );
}

function StudioSlidePerfil() {
  return (
    <div className="studio-panel">
      <p className="studio-panel__section-title">Conexión al dataset</p>
      <p className="studio-panel__facet-label">
        <ImageIcon size={11} aria-hidden /> <code>PLAYER_2.perfil</code>
      </p>
      <div className="studio-panel__mosaic">
        <button type="button" className="studio-panel__thumb is-active">
          <div className="studio-panel__thumb-photo" />
          <span className="studio-panel__thumb-label">Foto</span>
        </button>
        <button type="button" className="studio-panel__thumb">
          <div className="studio-panel__thumb-photo studio-panel__thumb-photo--pose1" />
          <span className="studio-panel__thumb-label">pose_1</span>
        </button>
        <button type="button" className="studio-panel__thumb">
          <div className="studio-panel__thumb-photo studio-panel__thumb-photo--pose2" />
          <span className="studio-panel__thumb-label">pose_2</span>
        </button>
        <button type="button" className="studio-panel__thumb">
          <div className="studio-panel__thumb-photo studio-panel__thumb-photo--pose3" />
          <span className="studio-panel__thumb-label">pose_3</span>
        </button>
      </div>
    </div>
  );
}

function StudioSlideCampos() {
  return (
    <div className="studio-panel">
      <p className="studio-panel__section-title">Campos de texto</p>
      <div className="studio-panel__field">
        <span className="studio-panel__field-key">
          <Type size={11} aria-hidden />
          <code>PLAYER_2.nombre</code>
        </span>
        <select className="studio-panel__select" defaultValue="nombre" aria-label="Columna nombre">
          <option value="nombre">Nombre</option>
          <option value="edad">Edad</option>
        </select>
      </div>
      <div className="studio-panel__field">
        <span className="studio-panel__field-key">
          <Type size={11} aria-hidden />
          <code>PLAYER_2.dorsal</code>
        </span>
        <select className="studio-panel__select" defaultValue="edad" aria-label="Columna dorsal">
          <option value="nombre">Nombre</option>
          <option value="edad">Edad</option>
        </select>
      </div>
    </div>
  );
}

function StudioSlideFila() {
  return (
    <div className="studio-panel">
      <p className="studio-panel__section-title">Elegir fila</p>
      <ul className="studio-panel__rows">
        <li className="studio-panel__row is-active">
          <span className="studio-panel__row-photo" aria-hidden />
          <span className="studio-panel__row-name">Aymeric Laporte</span>
          <span className="studio-panel__row-check" aria-label="Seleccionado">
            ✓
          </span>
        </li>
        <li className="studio-panel__row">
          <span className="studio-panel__row-photo studio-panel__row-photo--alt" aria-hidden />
          <span className="studio-panel__row-name">Pau Torres</span>
        </li>
      </ul>
    </div>
  );
}

export const STUDIO_POPULATE_CAROUSEL_SLIDES: VerticalCarouselSlide[] = [
  { id: "jugador", label: "Jugador", content: <StudioSlideJugador /> },
  { id: "perfil", label: "Perfil", content: <StudioSlidePerfil /> },
  { id: "campos", label: "Campos", content: <StudioSlideCampos /> },
  { id: "fila", label: "Fila", content: <StudioSlideFila /> },
];
