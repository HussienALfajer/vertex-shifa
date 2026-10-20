import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The main navigation: the sidebar from the `md` breakpoint; on a phone, the sheet the top bar's
 * menu button opens (following a link closes it, `closeNav` otherwise).
 */
export async function mainNav(page: Page): Promise<Locator> {
  const open = page.getByRole('button', { name: 'افتح القائمة' });
  const nav = page.getByRole('navigation', { name: 'التنقل الرئيسي' });
  // The shell is drawn once the session is known: the sidebar, or the phone's menu button.
  await expect(nav.or(open).first()).toBeVisible();
  if (await open.isVisible()) await open.click();
  return nav;
}

/** Closes the phone's navigation sheet, if `mainNav` opened it. */
export async function closeNav(page: Page): Promise<void> {
  if (await page.locator('[data-slot="sheet-content"]').isVisible())
    await page.keyboard.press('Escape');
}

/** Opens the signed-in person's menu in the top bar. */
export async function openUserMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^قائمة الحساب: / }).click();
}

/**
 * Locks the computer: the top bar's lock button, or the member menu's item below 384 px, where the
 * button gives its room to the brand.
 */
export async function lock(page: Page): Promise<void> {
  const menu = page.getByRole('button', { name: /^قائمة الحساب: / });
  await expect(menu).toBeVisible();
  const button = page.getByRole('button', { name: 'قفل' });
  if (await button.isVisible()) {
    await button.click();
    return;
  }
  await menu.click();
  await page.getByRole('menuitem', { name: 'قفل' }).click();
}
