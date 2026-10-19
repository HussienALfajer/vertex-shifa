import { expect, type Page } from '@playwright/test';

/**
 * The page's work in flight: its `fetch` calls (the API's answers), counted in the page, where
 * one the app aborts settles too (Playwright reports no end for an intercepted request the page
 * cancels), and the device bridge's calls, counted here. `settled` waits until none is open.
 */
type Calls = { open: number; started: number };

const bridgeCalls = new WeakMap<Page, Calls>();

// Strings: the E2E is typed for Node, without the DOM's globals.
const countFetches = `{
  const calls = { open: 0, started: 0 };
  const fetch = window.fetch;
  window.fetch = function (...args) {
    calls.open += 1;
    calls.started += 1;
    return fetch.apply(this, args).finally(() => { calls.open -= 1; });
  };
  window.vertexShifaE2eFetches = () => ({ ...calls });
}`;

// No fetch open before or after two frames and none started between them, the fonts in, and the
// document the same size: React has drawn the last answer.
const stillPage = `document.fonts.ready.then(() => {
  const size = () => document.documentElement.scrollWidth + 'x' + document.documentElement.scrollHeight;
  const before = { ...window.vertexShifaE2eFetches(), size: size() };
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const after = { ...window.vertexShifaE2eFetches(), size: size() };
      resolve(before.open === 0 && after.open === 0 && after.started === before.started && after.size === before.size);
    })),
  );
})`;

/**
 * Follows `page`'s work from its first document on. Returns the wrapper that counts a device
 * bridge call as work in flight while it runs.
 */
export async function trackActivity(
  page: Page,
): Promise<<T>(call: () => Promise<T>) => Promise<T>> {
  const calls: Calls = { open: 0, started: 0 };
  bridgeCalls.set(page, calls);
  await page.addInitScript(countFetches);
  return async (call) => {
    calls.open += 1;
    calls.started += 1;
    try {
      return await call();
    } finally {
      calls.open -= 1;
    }
  };
}

/**
 * Waits until the screen is drawn from every answer it asked for: no request or device call open,
 * none started while two frames are drawn, the fonts loaded and the layout still. Measure or
 * capture the page only then: a full-page screenshot whose page changes size while it is taken
 * fails ("Unable to capture screenshot"), and a box measured mid-render is the wrong one. Not
 * with `page.clock` installed: its animation frames run only when the test moves the clock.
 */
export async function settled(page: Page): Promise<void> {
  const calls = bridgeCalls.get(page);
  if (!calls) throw new Error('settled() needs mockApi(page) first');
  await expect
    .poll(
      async () => {
        if (calls.open > 0) return false;
        const started = calls.started;
        const still = await page.evaluate<boolean>(stillPage);
        return still && calls.open === 0 && calls.started === started;
      },
      { message: 'the page never settled: a request or device call is still open' },
    )
    .toBe(true);
}
