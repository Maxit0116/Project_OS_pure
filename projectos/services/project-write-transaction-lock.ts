const projectWriteTransactionLocks = new Map<string, Promise<void>>();

export async function withProjectWriteTransactionLock<T>(
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = projectWriteTransactionLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolvePromise) => { release = resolvePromise; });
  const queued = previous.then(() => current);
  projectWriteTransactionLocks.set(key, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (projectWriteTransactionLocks.get(key) === queued) {
      projectWriteTransactionLocks.delete(key);
    }
  }
}
