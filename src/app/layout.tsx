import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Foldder",
  description:
    "Foldder — flujo visual Spaces, Runway, Gemini, Grok y herramientas de composición.",
  icons: { icon: "/favicon.png", apple: "/favicon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
