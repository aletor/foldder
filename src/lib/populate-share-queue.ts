/** Serializa lecturas/escrituras de `data/populate-shares.json`. */
let chain: Promise<unknown> = Promise.resolve();

export function runPopulateShareExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(() => fn());
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
