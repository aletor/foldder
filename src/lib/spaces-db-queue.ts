/**
 * Serializa lecturas/escrituras de `data/spaces-db.json` en la API.
 * Sin esto, POST (guardar) y DELETE pueden intercalarse: el último POST escribe
 * una copia antigua del array y los borrados parecen “volver” al recargar.
 */
let chain: Promise<unknown> = Promise.resolve();

export function runSpacesDbExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(() => fn());
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
