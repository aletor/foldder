/**
 * Registro tipo → executor para Populate. Un nodo solo es elegible en la tubería si tiene
 * executor registrado (`isPipelineExecutable`); el resto se bloquea con mensaje claro.
 *
 * El registro es puro (no importa executors concretos): los built-in se cablean en
 * `register-default-executors.ts`, que es client-side. Así un import server-side del registro
 * no arrastra código de generación (fetch/clients).
 */

import type { NodeExecutor } from "./node-executor";

export class ExecutorRegistry {
  private map = new Map<string, NodeExecutor>();

  register(executor: NodeExecutor): this {
    this.map.set(executor.type, executor);
    return this;
  }

  get(type: string | undefined | null): NodeExecutor | null {
    if (!type) return null;
    return this.map.get(type) ?? null;
  }

  has(type: string | undefined | null): boolean {
    return !!type && this.map.has(type);
  }

  /** ¿Este tipo de nodo puede entrar en una tubería de Populate? */
  isPipelineExecutable(type: string | undefined | null): boolean {
    return this.has(type);
  }

  /** Tipos con executor registrado (para validación/diagnóstico). */
  types(): string[] {
    return [...this.map.keys()];
  }
}

export function createExecutorRegistry(): ExecutorRegistry {
  return new ExecutorRegistry();
}

/** Registro compartido por defecto (poblado por registerDefaultPopulateExecutors). */
export const defaultExecutorRegistry = createExecutorRegistry();
