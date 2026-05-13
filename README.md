# Foldder

Aplicación **Next.js**: canvas **Spaces** (`/spaces`), APIs de Runway, Grok, Gemini, OpenAI (enhance), Replicate (matte) y persistencia en `data/spaces-db.json`.

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) (redirige a `/spaces`).

Despliegue y variables de entorno: **[DEPLOY.md](./DEPLOY.md)**.

En local, la app puede seguir persistiendo en `data/spaces-db.json` y `data/presenter-shares.json`.
En produccion sobre Vercel, conviene usar S3 tambien para esos metadatos mediante
`FOLDDER_SPACES_DB_S3_KEY` y `FOLDDER_PRESENTER_SHARES_S3_KEY`.

Tambien puedes activar DynamoDB para persistencia por item:
- `FOLDDER_SPACES_DDB_TABLE`
- (opcional) `FOLDDER_SPACES_DDB_LIST_GSI` para listar proyectos por fecha sin `scan`
- (opcional) `FOLDDER_SPACES_DDB_OWNER_GSI` para listar proyectos por usuario sin leer otros usuarios
- (opcional) `FOLDDER_SPACES_DDB_PROJECT_GSI` para leer chunks/media refs por proyecto sin `scan`
- `FOLDDER_PRESENTER_SHARES_DDB_TABLE`
- (opcional) `FOLDDER_PRESENTER_SHARES_DDB_DECK_GSI` para listar por `deckKey` sin `scan`

Para instalaciones nuevas usa `spaces_v2`: una tabla nueva con clave compuesta `pk/sk`,
chunks por revision, indice por usuario y media siempre referenciada por S3.
No migra proyectos legacy; al activar estas variables `/api/spaces` usa solo `spaces_v2`.

```bash
npm run provision:spaces-v2
```

Variables:
- `FOLDDER_SPACES_V2_DDB_TABLE` (por defecto `foldder-prod-spaces-v2`)
- `FOLDDER_SPACES_V2_OWNER_GSI` (por defecto `ownerPk-listSk-index`)

**Repositorio:** [github.com/aletor/foldder](https://github.com/aletor/foldder). Si el remoto local apunta al nombre antiguo: `git remote set-url origin https://github.com/aletor/foldder.git`

En el repo de marketing, `NEXT_PUBLIC_MEDIA_COMPOSER_URL` debe apuntar a la URL de despliegue de esta app (Labs).
