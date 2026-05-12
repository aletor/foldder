"use client";

import { signIn, useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";

type GoogleAccessButtonProps = {
  className: string;
  label?: string;
  authenticatedLabel?: string;
  loadingLabel?: string;
};

export function GoogleAccessButton({
  className,
  label = "Continuar con Google",
  authenticatedLabel = "Elegir cuenta de Google",
  loadingLabel = "Comprobando sesión...",
}: GoogleAccessButtonProps) {
  const { status } = useSession();
  const buttonLabel = status === "authenticated" ? authenticatedLabel : label;

  return (
    <button
      type="button"
      disabled={status === "loading"}
      onClick={() =>
        void signIn("google", { callbackUrl: "/spaces" }, { prompt: "select_account" })
      }
      className={className}
    >
      {status === "loading" ? (
        <Loader2 size={16} className="animate-spin" aria-hidden />
      ) : (
        <GoogleIcon />
      )}
      <span>{status === "loading" ? loadingLabel : buttonLabel}</span>
    </button>
  );
}

function GoogleIcon() {
  return (
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
  );
}
