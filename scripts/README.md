# Scripts

Utilidades CLI del repo (ingesta Genoma, provisionado, wallet, etc.).

Las **corridas reales** que llaman a Gemini (`run-page-vision-*`, `run-nivel1-rerecord-audits.ts`, `run-genoma-ingest-*` con Fase A en vivo) leen `GEMINI_API_KEY` de `.env.local` al arrancar; no hace falta pasarla por terminal. Claves válidas: prefijo `AIza` (standard) o `AQ.` (auth, AI Studio 2026+).
