"use client";

import React, { useEffect, useRef, useState } from "react";
import { FolderOpen } from "lucide-react";
import type { DevelopSettings } from "../lightroom-develop-settings";
import { ensureBundledProfilesLoaded, listBundledProfilesForModel, profileMatchesCameraModel } from "../lightroom-bundled-profiles";
import {
  getCameraProfile,
  listCameraProfiles,
  listProfilesForDropdown,
  registerDcpFile,
} from "../lightroom-profile-registry";

export type ProfileDropdownProps = {
  settings: DevelopSettings;
  cameraModel?: string;
  profileMatchHint?: string | null;
  disabled?: boolean;
  onChange: (cameraProfileId: string) => void;
};

export function ProfileDropdown({
  settings,
  cameraModel,
  profileMatchHint,
  disabled,
  onChange,
}: ProfileDropdownProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const profiles = listCameraProfiles();
  const active = profiles.find((p) => p.id === settings.cameraProfileId) ?? profiles[0]!;

  useEffect(() => {
    let cancelled = false;
    void ensureBundledProfilesLoaded()
      .then(() => {
        if (!cancelled) setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = listProfilesForDropdown();
  const matchedIds = new Set(listBundledProfilesForModel(cameraModel ?? ""));
  const recommended = grouped.bundled.filter((p) => matchedIds.has(p.id));

  const onPickDcp = async (file: File | null) => {
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const { profile, modelMismatch, mismatchMessage } = registerDcpFile(buffer, file.name, cameraModel);
      if (modelMismatch && mismatchMessage) {
        const force = window.confirm(`${mismatchMessage}\n\n¿Usar este perfil de todos modos?`);
        if (!force) return;
      }
      onChange(profile.id);
      setOpen(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo leer el .dcp");
    }
  };

  const renderOption = (opt: (typeof profiles)[number]) => (
    <li key={opt.id}>
      <button
        type="button"
        className={`lr-profile-dd__option${settings.cameraProfileId === opt.id ? " is-active" : ""}`}
        onClick={() => {
          onChange(opt.id);
          setOpen(false);
        }}
      >
        <span className="lr-profile-dd__thumb" style={{ background: opt.thumb }} />
        {opt.name}
        {opt.bundled ? " (incluido)" : !opt.builtin ? " (.dcp)" : ""}
      </button>
    </li>
  );

  const renderSection = (title: string, items: typeof profiles) =>
    items.length > 0 ? (
      <>
        <li className="lr-profile-dd__section" aria-hidden>
          {title}
        </li>
        {items.map((opt) => renderOption(opt))}
      </>
    ) : null;

  const otherBundled = grouped.bundled.filter((p) => !recommended.some((r) => r.id === p.id));

  return (
    <div className="lr-profile-dd nodrag">
      {profileMatchHint ? (
        <p className="lr-profile-dd__hint" role="status">
          {profileMatchHint}
        </p>
      ) : null}
      <button
        type="button"
        className="lr-profile-dd__trigger"
        disabled={disabled || !loaded}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="lr-profile-dd__thumb" style={{ background: active.thumb }} />
        <span className="lr-profile-dd__label">{loaded ? active.name : "Cargando perfiles…"}</span>
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <ul className="lr-profile-dd__menu" role="listbox">
          {renderSection("Recomendado para esta cámara", recommended)}
          {renderSection("Perfiles de cámara incluidos", otherBundled)}
          {renderSection("Genéricos", grouped.generic)}
          {renderSection("Cargados por ti", grouped.user)}
          <li>
            <button
              type="button"
              className="lr-profile-dd__option lr-profile-dd__option--load"
              onClick={() => fileRef.current?.click()}
            >
              <FolderOpen size={12} />
              Cargar perfil propio…
            </button>
          </li>
        </ul>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept=".dcp,.DCP"
        className="sr-only"
        onChange={(e) => void onPickDcp(e.target.files?.[0] ?? null)}
      />
      {settings.cameraProfileId.startsWith("dcp:") && cameraModel ? (
        <ProfileMismatchWarning profileId={settings.cameraProfileId} cameraModel={cameraModel} />
      ) : null}
    </div>
  );
}

function ProfileMismatchWarning({ profileId, cameraModel }: { profileId: string; cameraModel: string }) {
  const profile = getCameraProfile(profileId);
  if (!profile?.uniqueCameraModel || profileMatchesCameraModel(profile.uniqueCameraModel, cameraModel)) return null;
  return (
    <p className="lr-profile-dd__warn" role="status">
      Perfil para «{profile.uniqueCameraModel}», RAW «{cameraModel}».
    </p>
  );
}
