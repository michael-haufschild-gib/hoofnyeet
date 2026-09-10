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
      // Read through Reflect so the capture is not an unbound method reference:
      // the receiver is supplied explicitly at the Reflect.apply below.
      const nativePlay = Reflect.get(
        HTMLMediaElement.prototype,
        'play',
      ) as HTMLMediaElement['play'];
      HTMLMediaElement.prototype.play = function () {
        this.muted = true;
        return Reflect.apply(nativePlay, this, []);
      };
      // Preserve the native method and explicitly restore its receiver with Reflect.apply.
      const nativeConnect = Reflect.get(
        AudioNode.prototype,
        'connect',
      ) as AudioNode['connect'];
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
