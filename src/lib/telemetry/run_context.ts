import { AsyncLocalStorage } from 'node:async_hooks';

type RunCtx = { run_id?: string; profile?: string };
const storage = new AsyncLocalStorage<RunCtx>();

export function withRunContext<T>(ctx: RunCtx, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function setRunContext(ctx: RunCtx): void {
  const cur = storage.getStore() || {};
  Object.assign(cur, ctx);
  // @ts-ignore set as new store by entering a microtask boundary
  storage.enterWith(cur);
}

export function clearRunContext(): void {
  // Reset to empty context
  // @ts-ignore set as new store by entering a microtask boundary
  storage.enterWith({});
}

export function getRunContext(): RunCtx {
  return storage.getStore() || {};
}

