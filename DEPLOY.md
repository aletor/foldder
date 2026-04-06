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
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET_NAME` | Subidas y URLs firmadas (`s3-utils`) |

El build de producción **no exige** estas claves en tiempo de compilación; hacen falta en runtime para que las APIs respondan.

## Proyecto hermano (marketing)

El producto de marketing y contenido vive en otro repo. Para un enlace desde Labs del marketing, allí se define `NEXT_PUBLIC_MEDIA_COMPOSER_URL` apuntando a la URL de despliegue de **Foldder**. Ver `DEPLOY.md` del repo marketing.
