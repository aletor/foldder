import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  turbopack: {},
  async redirects() {
    return [{ source: "/home_v2", destination: "/", permanent: true }];
  },
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
  webpack: (config, { dev, isServer, webpack }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/data/**", "**/.git/**"],
      };
    }
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      canvas: false,
      "paper/dist/node/canvas.js": false,
    };
    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/node\/extend\.js$/,
        contextRegExp: /paper[/\\]dist$/,
      }),
    );
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        canvas: false,
      };
    }
    return config;
  },
};

export default nextConfig;
