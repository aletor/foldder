"use client";

import React from "react";
import { AUTH_HIGHLIGHTS } from "./spaces-chrome-constants";

type Props = {
  passcode: string;
  passError: boolean;
  onPasscodeChange: (value: string) => void;
};

export function SpacesPasswordOverlay({ passcode, passError, onPasscodeChange }: Props) {
  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0a] backdrop-blur-3xl">
      <div className="absolute left-1/4 top-1/4 h-96 w-96 animate-pulse rounded-full bg-cyan-500/10 blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 animate-pulse rounded-full bg-blue-600/10 blur-[120px] delay-700" />

      <div className="relative z-10 flex w-full max-w-xl flex-col items-center gap-8 px-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-2">
          <div className="mb-4 flex flex-col items-center gap-1">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="overlayFoldderFTop" x1="0" y1="0" x2="56" y2="20" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#A06BEE" />
                  <stop offset="1" stopColor="#CAA4F7" />
                </linearGradient>
                <linearGradient id="overlayFoldderFMid" x1="0" y1="20" x2="50" y2="40" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#5F2EEA" />
                  <stop offset="1" stopColor="#B187F4" />
                </linearGradient>
                <linearGradient id="overlayFoldderFBot" x1="0" y1="40" x2="30" y2="60" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#2A1DC7" />
                  <stop offset="1" stopColor="#4E37EE" />
                </linearGradient>
              </defs>
              <rect x="4" y="4" width="56" height="16" rx="4" fill="url(#overlayFoldderFTop)" />
              <rect x="4" y="24" width="48" height="16" rx="4" fill="url(#overlayFoldderFMid)" />
              <rect x="4" y="44" width="22" height="16" rx="4" fill="url(#overlayFoldderFBot)" />
              <path d="M4 48 C5.2 44.8 8.2 44 12 44 H22 L26 48 Z" fill="rgba(0,0,0,0.24)" />
            </svg>
          </div>
          <h1 className="mr-[-8px] text-2xl font-black uppercase tracking-[8px] text-white">Foldder</h1>
          <p className="text-[10px] font-bold uppercase tracking-[4px] text-violet-400 opacity-80">Studio Access</p>
        </div>

        <div className="flex w-full max-w-sm flex-col gap-4">
          <div className="relative">
            <input
              type="password"
              autoFocus
              maxLength={4}
              value={passcode}
              onChange={(e) => onPasscodeChange(e.target.value)}
              placeholder="••••"
              className={`w-full rounded-2xl bg-white/5 py-5 pl-[1.5em] text-center text-4xl font-black tracking-[1.5em] text-white transition-all placeholder:text-white/10 focus:border-cyan-500/40 focus:outline-none ${
                passError
                  ? "border border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.2)]"
                  : "border border-white/10"
              }`}
            />
            {passError && (
              <p className="absolute -bottom-6 left-0 w-full animate-bounce text-center text-[8px] font-black uppercase tracking-widest text-rose-500">
                Invalid passcode
              </p>
            )}
          </div>
          <p className="text-center text-[9px] font-medium uppercase tracking-[2px] text-white/30">
            Enter security key to initialize studio
          </p>
        </div>

        <div className="mx-auto mt-16 grid w-full max-w-xl grid-cols-2 gap-6">
          {AUTH_HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="group flex items-start gap-3 opacity-80 transition hover:opacity-100"
            >
              <Icon
                size={18}
                strokeWidth={1.5}
                className="shrink-0 text-purple-400 drop-shadow-[0_0_6px_rgba(168,85,247,0.6)] transition-transform duration-300 group-hover:scale-110"
                aria-hidden
              />
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-medium text-white">{title}</p>
                <p className="mt-1 text-xs leading-snug text-white/40">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-12 flex flex-col items-center gap-2 opacity-20 transition-opacity hover:opacity-100">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-cyan-500" />
          <span className="text-[8px] font-bold uppercase tracking-[4px] text-white">Verified Infrastructure</span>
        </div>
      </div>
    </div>
  );
}
