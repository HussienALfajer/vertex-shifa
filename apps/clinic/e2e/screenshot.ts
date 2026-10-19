import { expect, type Page, type TestInfo } from '@playwright/test';

/**
 * An RTL screenshot per project (desktop light and dark, tablet, phone), kept in test-results/
 * (uploaded by CI) and in the report. No screen is wider than its window (AGENTS.md
 * "Responsive"): the page never scrolls sideways.
 */
export async function screenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  // A string: the E2E is typed for Node, without the DOM's globals.
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow, `${name} scrolls sideways on ${testInfo.project.name}`).toBe(0);
  const path = testInfo.outputPath(`${name}-${testInfo.project.name}.png`);
  // Transitions end at once, so a control just pressed shows its final state.
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
