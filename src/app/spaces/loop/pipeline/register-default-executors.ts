"use client";

/**
 * Cablea los executors built-in en un registro (por defecto, el compartido). Llamar una vez
 * desde el cliente antes de ejecutar una tubería de Loop. Idempotente (registrar por tipo
 * sobrescribe). Añadir un nodo nuevo = registrar aquí su executor; el motor no se toca.
 */

import { defaultExecutorRegistry, type ExecutorRegistry } from "./executor-registry";
import { nanoBananaExecutor } from "./executors/nano-banana.executor";
import { designerExecutor } from "./executors/designer.executor";
import { mediaDescriberExecutor } from "./executors/media-describer.executor";
import { enhancerExecutor } from "./executors/enhancer.executor";
import { concatenatorExecutor } from "./executors/concatenator.executor";
import { backgroundRemoverExecutor } from "./executors/background-remover.executor";

export function registerDefaultLoopExecutors(
  registry: ExecutorRegistry = defaultExecutorRegistry,
): ExecutorRegistry {
  registry
    .register(nanoBananaExecutor)
    .register(designerExecutor)
    .register(mediaDescriberExecutor)
    .register(enhancerExecutor)
    .register(concatenatorExecutor)
    .register(backgroundRemoverExecutor);
  return registry;
}
