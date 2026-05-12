import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";

export const metadata: Metadata = {
  title: "Foldder",
  description:
    "Foldder — visual Spaces workflow for Runway, Gemini, Grok, and composition tools.",
  icons: { icon: "/favicon.ico", apple: "/favicon.png" },
  other: {
    google: "notranslate",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" translate="no" className="notranslate" suppressHydrationWarning>
      <body className="notranslate antialiased" translate="no">
        <AuthSessionProvider>
          <AppShell>{children}</AppShell>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
