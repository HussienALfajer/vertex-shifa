import type { Page } from '@playwright/test';

/** The six slots of the code field labelled `label`. */
export function codeField(page: Page, label: string) {
  return page
    .locator('[data-slot="field"]')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('input');
}

/** Types six digits into an empty code field. */
export async function typeCode(page: Page, label: string, digits: string): Promise<void> {
  await codeField(page, label).first().click();
  await page.keyboard.type(digits);
}
