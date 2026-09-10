import { ponyUnlocked, type PonyId } from '../catalogue/cosmetics';
import {
  challengeUnlocked,
  type ChallengeRule,
} from '../catalogue/challenge-rules';
import type { SaveData } from '../storage';
import type { Hat } from '../simulation';
import type { GameController } from '../controller';

/** Saved settings a player may change from the interface. */
export type PreferenceKey =
  | 'music'
  | 'effects'
  | 'reduced'
  | 'hat'
  | 'pony'
  | 'challenge'
  | 'assisted'
  | 'gentle'
  | 'primaryKey'
  | 'secondaryKey';

/** Leaves the wardrobe on the failed hat, with the old outfit still worn. */
function showHatError(c: GameController, hat: Hat, request: number) {
  if (c.disposed || request !== c.hatRequest) return;
  c.wardrobe = {
    hat,
    loading: false,
    error: 'That hat could not load. Your current outfit is still equipped.',
  };
  c.publish();
}

/**
 * Shows the wardrobe as loading, then re-applies the choice once the artwork
 * and its shader are resident.
 *
 * `request` is the ticket that identifies this attempt; a newer choice
 * abandons this one rather than overwriting it.
 */
function loadHatThen(c: GameController, hat: Hat, request: number) {
  c.wardrobe = { hat, loading: true, error: '' };
  c.publish();
  void c.renderer
    .prepareHat(hat)
    .then(() => {
      if (!c.disposed && request === c.hatRequest) c.setPreference('hat', hat);
    })
    .catch(() => showHatError(c, hat, request));
}

/**
 * True when the hat can be worn right now.
 *
 * A hat that is owned but not yet resident starts loading and returns false,
 * so the save is written only once the outfit can actually be drawn.
 */
function equipHat(c: GameController, hat: Hat): boolean {
  if (!c.save.hats.includes(hat)) return false;
  const request = ++c.hatRequest;
  if (!c.renderer.hatReady(hat)) {
    loadHatThen(c, hat, request);
    return false;
  }
  c.wardrobe = null;
  return true;
}

/** True when the choice is unlocked, available and not already in use. */
function allowPreference<K extends PreferenceKey>(
  c: GameController,
  key: K,
  value: SaveData[K],
): boolean {
  if (key === 'hat' && !equipHat(c, value as Hat)) return false;
  if (key === 'pony' && !ponyUnlocked(value as PonyId, c.save)) return false;
  if (
    key === 'challenge' &&
    !challengeUnlocked(value as ChallengeRule, c.save.wins)
  )
    return false;
  // The two action keys must stay distinct, or one control becomes unreachable.
  return !(
    (key === 'primaryKey' || key === 'secondaryKey') &&
    value === c.save[key === 'primaryKey' ? 'secondaryKey' : 'primaryKey']
  );
}

/**
 * Writes one setting, persists the save and republishes the view.
 *
 * A rejected choice leaves the save untouched. Changing either sound setting
 * also unlocks the audio context, because the change is itself the gesture the
 * browser wants.
 */
export function applyPreference<K extends PreferenceKey>(
  c: GameController,
  key: K,
  value: SaveData[K],
) {
  if (!allowPreference(c, key, value)) return;
  c.save = { ...c.save, [key]: value };
  c.persist();
  c.syncPreferences();
  c.publish();
  if ((key === 'music' || key === 'effects') && !c.state.paused)
    void c.audio.unlock();
}
