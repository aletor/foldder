/** Serializa lecturas/escrituras de `data/loop-shares.json`. */
let chain: Promise<unknown> = Promise.resolve();

export function runLoopShareExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(() => fn());
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
