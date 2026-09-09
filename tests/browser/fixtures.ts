import { test as base, expect } from '@playwright/test';

/** Test audio may feed a recording track, but never the computer's speakers. */
export const test = base.extend<{ firstRun: boolean }>({
  firstRun: [false, { option: true }],
  context: async ({ context, firstRun }, runFixture) => {
    if (!firstRun)
      await context.addInitScript(() => {
        try {
          const key = 'hoof-and-yeet:v2';
          const save = JSON.parse(localStorage.getItem(key) || '{"version":2}');
          localStorage.setItem(
            key,
            JSON.stringify({ ...save, controlsSeen: true }),
          );
        } catch {
          /* Tests for unavailable storage retain their explicit setup. */
        }
      });
    await context.addInitScript(() => {
      // Clip previews must also remain silent if a test starts native playback.
      // oxlint-disable-next-line typescript/unbound-method
      const nativePlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        this.muted = true;
        return Reflect.apply(nativePlay, this, []);
      };
      // Preserve the native method and explicitly restore its receiver with Reflect.apply.
      // oxlint-disable-next-line typescript/unbound-method
      const nativeConnect = AudioNode.prototype.connect;
      Object.defineProperty(AudioNode.prototype, 'connect', {
        configurable: true,
        value: function (
          this: AudioNode,
          destination: AudioNode | AudioParam,
          ...ports: number[]
        ) {
          if (destination instanceof AudioDestinationNode) return destination;
          return Reflect.apply(nativeConnect, this, [destination, ...ports]);
        },
      });
    });
    await runFixture(context);
  },
});
export { expect };
export type { Page } from '@playwright/test';
