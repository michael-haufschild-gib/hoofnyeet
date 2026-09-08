import { test, expect } from './fixtures';
import type { Incident } from '../../lib/game/sharing';

test('saving and pruning incidents preserve old recordings without reading their replay payloads', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const result = await page.evaluate(async () => {
    // Exercise the real upgrade from the original incident database.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('hoof-incidents-v2', 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('incidents', { keyPath: 'id' });
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction('incidents', 'readwrite');
        for (let i = 1; i <= 5; i++)
          tx.objectStore('incidents').put({
            id: `old-${i}`,
            name: 'Old incident',
            created: i,
            distance: i * 100,
            havoc: 0,
            recording: {
              contentVersion: 4,
              duration: 1,
              frames: [{ time: i, distance: i * 100 }],
              events: [],
            },
          });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      };
      request.onerror = () => reject(request.error);
    });
    const path = '/lib/game/sharing.ts';
    const sharing = await import(path);
    // A value read while pruning is a regression, regardless of replay size.
    const descriptor = Object.getOwnPropertyDescriptor(
      IDBObjectStore.prototype,
      'getAll',
    )!;
    Object.defineProperty(IDBObjectStore.prototype, 'getAll', {
      configurable: true,
      value() {
        throw new Error('saveIncident must not hydrate archived replays');
      },
    });
    const saved = [];
    try {
      for (const created of [6, 0, 7, 8])
        saved.push(
          await sharing.saveIncident({
            id: `new-${created}`,
            name: 'New incident',
            created,
            distance: created * 100,
            havoc: 0,
            recording: {
              contentVersion: 5,
              duration: 1,
              frames: [{ time: created, distance: created * 100 }],
              events: [],
            },
          }),
        );
    } finally {
      Object.defineProperty(IDBObjectStore.prototype, 'getAll', descriptor);
    }
    const incidents: Incident[] = await sharing.listIncidents();
    const open = Object.getOwnPropertyDescriptor(IDBFactory.prototype, 'open')!;
    let unavailable;
    try {
      Object.defineProperty(IDBFactory.prototype, 'open', {
        configurable: true,
        value() {
          throw new DOMException('Storage unavailable', 'SecurityError');
        },
      });
      unavailable = await sharing.saveIncident(incidents[0]);
    } finally {
      Object.defineProperty(IDBFactory.prototype, 'open', open);
    }
    return { saved, unavailable, incidents };
  });
  expect(result.saved).toEqual([true, true, true, true]);
  expect(result.unavailable).toBe(false);
  expect(result.incidents.map((i) => i.created)).toEqual([8, 7, 6, 5, 4]);
  expect(result.incidents.find((i) => i.id === 'old-5')!.recording).toEqual({
    contentVersion: 4,
    duration: 1,
    frames: [{ time: 5, distance: 500 }],
    events: [],
  });
});
