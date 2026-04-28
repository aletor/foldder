# Contrato de integración: nodos creativos y Brain

Brain es la **memoria creativa versionada** del proyecto (`project.metadata.assets`). El nodo `projectBrain` la **representa** en el lienzo; el **runtime** adapta el contexto por tipo de nodo.

## Principios

1. **Handle Brain**: el nodo creativo expone un handle de entrada de tipo `brain` cuando debe consumir memoria del proyecto.
2. **Detección de cable**: comprobar arista entrante desde un nodo `projectBrain` hacia el handle `brain` del creativo.
3. **No leer `metadata.assets` completo** sin motivo; preferir APIs o contexto ya normalizado (`normalizeProjectAssets`).
4. **Brain Runtime Context**: pedir `buildBrainRuntimeContext({ assets, targetNodeType, targetNodeId, useCase, … })` y usar `contextSlices`, `visualDna`, `contentDna`, `safeCreativeRules`, `avoid`, `warnings`, `evidence`.
5. **Enriquecer la ejecución** con ese contexto (prompts, parámetros de modelo, restricciones).
6. **Diagnóstico opcional**: guardar versión de Brain, advertencias y fuentes ignoradas (p. ej. mock) cuando el producto lo permita.
7. **Telemetría / aprendizajes**: usar los mismos hooks que el resto de nodos Brain-capaces.
8. **Safe Creative Rules**: respetar `doNotGenerate`, `imageGenerationAvoid`, reglas de claims y abstracción visual.
9. **Versionado**: si se persiste diagnóstico, anotar `brainVersion` coherente con `assets.brainMeta`.
10. **Sin mutación directa** de `metadata.assets` salvo por flujos previstos (guardar proyecto, APIs Brain, acciones de Studio).

## Referencias de código

- Tipos y capas: `src/lib/brain/brain-creative-memory-types.ts`
- Contexto runtime: `src/lib/brain/brain-runtime-context.ts`
- Prompt imagen (Nano Banana): `composeBrainImageGeneratorPromptWithRuntime` / `composeBrainImageGeneratorPromptFromRuntimeContext` en `src/lib/brain/build-brain-visual-prompt-context.ts`
- Jerarquía de señales visuales: `VISUAL_SIGNAL_SOURCE_PRIORITY` y `hasTrustedRemoteVisionAnalyses` en `src/lib/brain/brain-merge-signals.ts`
- Ingesta y análisis: `src/app/api/spaces/brain/knowledge/analyze/route.ts`, `src/app/api/spaces/brain/visual/reanalyze/route.ts`
- Normalización persistida: `src/app/spaces/project-assets-metadata.ts` (`normalizeProjectAssets`)
