# Despliegue (Vercel): Foldder

Aplicación **Next.js** (**Foldder**): canvas en `/spaces` (la raíz `/` redirige a `/spaces`).

## Vercel

- **Root directory:** raíz del repo (sin subcarpeta).
- **Build command:** `npm run build`
- **Install:** `npm install`
- **Node:** la versión LTS que recomiende Vercel para Next 16.

## Variables de entorno

Añade en Vercel → Settings → Environment Variables las que uses (Production / Preview según necesites):

| Variable | Uso |
|----------|-----|
| `OPENAI_API_KEY` | Asistente del canvas, enhance de prompts, describe |
| `GEMINI_API_KEY` o `GOOGLE_API_KEY` | Rutas `/api/gemini/*` |
| `GROK_API_KEY` | `/api/grok/*` |
| `RUNWAYML_API_KEY` o `RUNWAYML_API_SECRET` | `/api/runway/*` |
| `REPLICATE_API_TOKEN` | Matte de imagen/vídeo |
| `VOLCENGINE_ARK_API_KEY` o `SEEDANCE_API_KEY` | `/api/seedance/video` |
| `BEEBLE_API_KEY` | Proxy `/api/beeble/*` |
| `PINTEREST_ACCESS_TOKEN` | `/api/pinterest/search` |
| `AUTH_SECRET` | Secreto obligatorio de Auth.js/NextAuth para firmar sesión JWT/cookies |
| `AUTH_GOOGLE_ID` | Client ID de Google OAuth |
| `AUTH_GOOGLE_SECRET` | Client Secret de Google OAuth |
| `AUTH_TRUST_HOST` | `true` detrás de proxy/reverse proxy (en Vercel suele inferirse) |
| `AUTH_URL` | Opcional en v5; URL base pública cuando haga falta forzarla |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET_NAME` | Subidas, URLs firmadas y persistencia durable |
| `FOLDDER_SPACES_DB_S3_KEY` | Opcional. Clave S3 para proyectos (`spaces-db.json`) |
| `FOLDDER_PRESENTER_SHARES_S3_KEY` | Opcional. Clave S3 para enlaces presenter |
| `FOLDDER_USAGE_S3_KEY` | Opcional. Clave S3 para log de uso/costes |
| `FOLDDER_SPACES_DDB_TABLE` | Opcional. Tabla DynamoDB para proyectos Spaces (si está, se prioriza sobre JSON/S3) |
| `FOLDDER_PRESENTER_SHARES_DDB_TABLE` | Opcional. Tabla DynamoDB para enlaces de presenter (si está, se prioriza sobre JSON/S3) |
| `FOLDDER_PRESENTER_SHARES_DDB_DECK_GSI` | Opcional. Nombre de GSI por `deckKey` para listar enlaces por deck sin `scan` |
| `FOLDDER_DDB_DISABLE` | Opcional. `1` para desactivar DynamoDB temporalmente y volver a fallback JSON/S3 |
| `FFMPEG_PATH` | Opcional. Ruta a `ffmpeg` si el runtime no lo expone en PATH |

El build de producción **no exige** estas claves en tiempo de compilación; hacen falta en runtime para que las APIs respondan.

## Persistencia en producción

Vercel Functions tienen sistema de ficheros de solo lectura y solo dejan `/tmp` como scratch space. Por eso:

- `data/spaces-db.json` y `data/presenter-shares.json` sirven en local.
- En producción debes usar S3 para esos metadatos si quieres persistencia real.
- El código ya lee/escribe en S3 automáticamente cuando existen las credenciales AWS y, si quieres, puedes separar las claves con `FOLDDER_SPACES_DB_S3_KEY` y `FOLDDER_PRESENTER_SHARES_S3_KEY`.
- Si defines tablas DynamoDB (`FOLDDER_SPACES_DDB_TABLE` / `FOLDDER_PRESENTER_SHARES_DDB_TABLE`), esas rutas pasan a persistencia por item (sin read-modify-write de JSON global).

Esquema mínimo recomendado:

- Tabla `FOLDDER_SPACES_DDB_TABLE`
  - `Partition key`: `id` (String)
- Tabla `FOLDDER_PRESENTER_SHARES_DDB_TABLE`
  - `Partition key`: `token` (String)
  - GSI opcional para listar por deck (`FOLDDER_PRESENTER_SHARES_DDB_DECK_GSI`):
    - `Partition key`: `deckKey` (String)
    - `Sort key` recomendado: `createdAt` (String)

Sugerencia de claves:

- `FOLDDER_SPACES_DB_S3_KEY=foldder-meta/spaces-db.json`
- `FOLDDER_PRESENTER_SHARES_S3_KEY=foldder-meta/presenter-shares.json`
- `FOLDDER_USAGE_S3_KEY=foldder-meta/api-usage.jsonl`

## Notas operativas

- La app usa `maxDuration = 300` en las rutas de vídeo largas. En Vercel eso encaja con 300 s por defecto cuando Fluid Compute está activo.
- Presenter ya no envía el código de acceso al navegador; la verificación se hace contra `/api/presenter-share/verify`.
- La fuente global ya no depende de `next/font/google`, así que el build no necesita salir a Google Fonts.

## Google OAuth (producción)

Checklist mínimo para activar login Google en producción:

1. En Google Cloud Console, añade como Authorized redirect URI:
   - `https://TU_DOMINIO/api/auth/callback/google`
2. Si usas dev y prod, usa OAuth apps separadas o múltiples redirect URIs.
3. En Vercel Production define:
   - `AUTH_SECRET` (aleatorio, >=32 chars)
   - `AUTH_GOOGLE_ID`
   - `AUTH_GOOGLE_SECRET`
   - `AUTH_TRUST_HOST=true` (si aplica)
4. No reutilizar claves de otros servicios como secreto de auth.

## Proyecto hermano (marketing)

El producto de marketing y contenido vive en otro repo. Para un enlace desde Labs del marketing, allí se define `NEXT_PUBLIC_MEDIA_COMPOSER_URL` apuntando a la URL de despliegue de **Foldder**. Ver `DEPLOY.md` del repo marketing.

## Migración JSON/S3 -> DynamoDB

Checklist recomendado:

1. Crear tablas DynamoDB (ver esquema mínimo arriba).
2. Configurar en entorno:
   - `FOLDDER_SPACES_DDB_TABLE`
   - `FOLDDER_PRESENTER_SHARES_DDB_TABLE`
3. Ejecutar dry-run local:
   - `npm run migrate:dynamo`
4. Ejecutar migración real:
   - `npm run migrate:dynamo -- --commit`
5. Si necesitas reescribir registros existentes:
   - `npm run migrate:dynamo -- --commit --overwrite`
6. Nota: Spaces en DynamoDB se guarda en formato chunked (`project-meta` + `project-chunk`) para evitar el límite de 400KB/item.
7. Si quieres migrar solo presenter (sin tocar Spaces):
   - `npm run migrate:dynamo -- --commit --skip-spaces`
8. Verificar en app (`GET /api/spaces`, `GET /api/presenter-share`) y en CloudWatch.
9. Mantener fallback preparado durante la ventana de transición:
   - `FOLDDER_DDB_DISABLE=1` (rollback rápido a JSON/S3).
