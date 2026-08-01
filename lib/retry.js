// A transient failure on the very first request batch right after a page
// reload (cold connections, browser resource contention from many parallel
// fetches firing at once) was getting swallowed by callers' blanket catch
// blocks and rendered identically to "no data here" — confusing, since a
// second attempt (e.g. triggered by navigating away and back) would then
// succeed. One retry after a short delay covers exactly that class of
// blip without masking a real, persistent failure (which still throws
// through to the caller's catch after the retry also fails).
export async function retryOnce(fn, delayMs = 500) {
  try {
    return await fn();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return fn();
  }
}
