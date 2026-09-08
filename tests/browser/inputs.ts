import type { Page } from './fixtures';

/** Resolve the fixed control locations before play; deliver real device taps promptly. */
export async function nativeActions(page: Page, touch = false, mouse = false) {
  const pads = touch
    ? await Promise.all(
        ['primary', 'secondary'].map(async (action) => {
          const box = await page.locator(`.action-pad.${action}`).boundingBox();
          if (!box)
            throw new Error(`${action} control is outside the viewport`);
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        }),
      )
    : null;
  return async (action: 'primary' | 'secondary') => {
    if (pads) {
      const point = pads[action === 'primary' ? 0 : 1];
      await page.touchscreen.tap(point.x, point.y);
    } else if (mouse) {
      await page.mouse.click(170, 220, {
        button: action === 'primary' ? 'left' : 'right',
      });
    } else
      await page.keyboard.press(action === 'primary' ? 'Space' : 'ArrowUp');
  };
}

/** Home is in the pause menu during play, keeping the active screen quiet. */
export async function returnHome(page: Page) {
  const brand = page.getByRole('button', { name: 'Hoof and Yeet home' });
  if (await brand.isVisible()) await brand.click();
  else {
    const home = page.getByRole('button', { name: 'Home', exact: true });
    if (!(await home.isVisible()))
      await page
        .getByRole('button', { name: 'Pause game', exact: true })
        .click();
    await home.click();
  }
}
