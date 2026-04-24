"use client";

import React from "react";
import Image from "next/image";
import { AUTH_HIGHLIGHTS } from "./spaces-chrome-constants";
import { Loader2 } from "lucide-react";

type Props = {
  loading: boolean;
  onGoogleSignIn: () => void;
  passcode: string;
  passError: boolean;
  onPasscodeChange: (value: string) => void;
};

export function SpacesPasswordOverlay({
  loading,
  onGoogleSignIn,
  passcode,
  passError,
  onPasscodeChange,
}: Props) {
  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0a] backdrop-blur-3xl">
      <div className="absolute left-1/4 top-1/4 h-96 w-96 animate-pulse rounded-full bg-cyan-500/10 blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 animate-pulse rounded-full bg-blue-600/10 blur-[120px] delay-700" />

      <div className="relative z-10 flex w-full max-w-xl flex-col items-center gap-8 px-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-2">
          <div className="mb-4 flex flex-col items-center gap-1">
            <Image
              src="/logo_line_bl.svg"
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 object-contain"
              aria-hidden
            />
          </div>
          <h1 className="mr-[-8px] text-2xl font-black uppercase tracking-[8px] text-white">Foldder</h1>
          <p className="text-[10px] font-bold uppercase tracking-[4px] text-violet-400 opacity-80">Studio Access</p>
        </div>

        <div className="flex w-full max-w-sm flex-col gap-4">
          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-sm font-bold text-white transition-all hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
                <path
                  fill="#FFC107"
                  d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.216 36 24 36c-6.627 0-12-5.373-12-12S17.373 12 24 12c3.059 0 5.842 1.154 7.958 3.042l5.657-5.657C34.053 6.053 29.27 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 12 24 12c3.059 0 5.842 1.154 7.958 3.042l5.657-5.657C34.053 6.053 29.27 4 24 4c-7.682 0-14.347 4.337-17.694 10.691z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.191-5.238C29.17 35.092 26.715 36 24 36c-5.196 0-9.625-3.329-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.085 5.571l.003-.002 6.191 5.238C36.97 39.203 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
                />
              </svg>
            )}
            {loading ? "Conectando..." : "Continuar con Google"}
          </button>
          <p className="text-center text-[9px] font-medium uppercase tracking-[2px] text-white/30">
            Acceso seguro con Gmail
          </p>

          <div className="mt-1 border-t border-white/10 pt-4">
            <p className="mb-2 text-center text-[9px] font-medium uppercase tracking-[2px] text-white/35">
              Acceso temporal por clave
            </p>
            <div className="relative">
              <input
                type="password"
                autoFocus
                maxLength={4}
                value={passcode}
                onChange={(e) => onPasscodeChange(e.target.value)}
                placeholder="••••"
                className={`w-full rounded-2xl bg-white/5 py-4 pl-[1.5em] text-center text-3xl font-black tracking-[1.5em] text-white transition-all placeholder:text-white/10 focus:border-cyan-500/40 focus:outline-none ${
                  passError
                    ? "border border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.2)]"
                    : "border border-white/10"
                }`}
              />
              {passError && (
                <p className="absolute -bottom-6 left-0 w-full animate-bounce text-center text-[8px] font-black uppercase tracking-widest text-rose-500">
                  Clave incorrecta
                </p>
              )}
            </div>
          </div>
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
