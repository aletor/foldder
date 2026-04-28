import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  /**
   * En `next dev --webpack`, evita que escrituras en `data/` (p. ej. `spaces-db.json` al guardar)
   * disparen recompilaciones en cadena. Con Turbopack (`next dev` por defecto) esta opción no aplica
   * al bundler principal; usa `npm run dev` (webpack) para beneficiarte de esto.
   */
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/data/**", "**/.git/**"],
      };
    }
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        canvas: false,
      };
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        "paper/dist/node/canvas.js": false,
      };
    }
    return config;
  },
};

export default nextConfig;
