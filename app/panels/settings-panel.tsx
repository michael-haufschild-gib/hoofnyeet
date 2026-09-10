import { BookOpen, Check, ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  HATS,
  PONIES,
  hatAsset,
  ponyUnlocked,
} from '@/lib/game/catalogue/cosmetics';
import {
  CHALLENGE_RULES,
  challengeUnlocked,
} from '@/lib/game/catalogue/challenge-rules';
import type { SaveData } from '@/lib/game/storage';
import type { ViewState } from '@/lib/game/controller';
import type { ControllerRef } from '../screens/types';

/** Which tab of the settings dialog is showing. */
export type SettingsTab = 'controls' | 'wardrobe' | 'rules';

/** Which key binding is waiting for the next keypress, or `null` when none is. */
export type RemapTarget = 'primaryKey' | 'secondaryKey' | null;

const TABS: SettingsTab[] = ['controls', 'wardrobe', 'rules'];

/** The boolean preferences, in the order the dialog lists them. */
const TOGGLES = [
  { key: 'music', label: 'Music', detail: '' },
  { key: 'effects', label: 'Sound effects', detail: '' },
  {
    key: 'reduced',
    label: 'Less camera chaos',
    detail: 'Reduce shake, particles, and extra motion',
  },
  {
    key: 'gentle',
    label: 'Less gruesome nonsense',
    detail: 'Trade splatter and bones for absurd debris',
  },
  {
    key: 'assisted',
    label: 'Assisted tapping',
    detail: 'Hold to gallop. Applies to your next run.',
  },
] as const;

/** The tab the arrow, Home and End keys move to from `current`. */
function nextTab(key: string, current: SettingsTab): SettingsTab | null {
  if (key === 'Home') return TABS[0];
  if (key === 'End') return TABS[2];
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  return TABS[(TABS.indexOf(current) + (key === 'ArrowRight' ? 1 : 2)) % 3];
}

/** The three settings tabs, with the roving focus a tablist is expected to have. */
function SettingsTabs({
  save,
  tab,
  onSelect,
}: {
  save: SaveData;
  tab: SettingsTab;
  onSelect: (tab: SettingsTab) => void;
}) {
  const unlockedPonies = PONIES.filter((p) => ponyUnlocked(p.id, save)).length;
  return (
    <div
      className="settings-tabs"
      role="tablist"
      tabIndex={-1}
      aria-label="Stable settings"
      onKeyDown={(e) => {
        const next = nextTab(e.key, tab);
        if (!next) return;
        e.preventDefault();
        onSelect(next);
        document.getElementById(`${next}-tab`)?.focus();
      }}
    >
      <button
        role="tab"
        aria-selected={tab === 'controls'}
        aria-controls="stable-controls"
        id="controls-tab"
        tabIndex={tab === 'controls' ? 0 : -1}
        onClick={() => onSelect('controls')}
      >
        Controls & sound
      </button>
      <button
        role="tab"
        aria-selected={tab === 'wardrobe'}
        aria-controls="stable-wardrobe"
        id="wardrobe-tab"
        tabIndex={tab === 'wardrobe' ? 0 : -1}
        onClick={() => onSelect('wardrobe')}
      >
        Dressing room <span>{unlockedPonies}/4</span>
      </button>
      <button
        role="tab"
        aria-selected={tab === 'rules'}
        aria-controls="stable-rules"
        id="rules-tab"
        tabIndex={tab === 'rules' ? 0 : -1}
        onClick={() => onSelect('rules')}
      >
        Tour rules
      </button>
    </div>
  );
}

/** The call to action on a rule card: selected, choosable, or still locked. */
function ruleState(
  save: SaveData,
  id: SaveData['challenge'],
  requirement: string,
) {
  if (!challengeUnlocked(id, save.wins)) return requirement;
  return save.challenge === id ? '✓ SELECTED' : 'CHOOSE';
}

/** Tour rule sets, which unlock as tours are won. */
function RulesTab({
  save,
  controller,
}: {
  save: SaveData;
  controller: ControllerRef;
}) {
  return (
    <div role="tabpanel" id="stable-rules" aria-labelledby="rules-tab">
      <p className="rule-intro">
        Win tours. Unlock worse terms. These rules apply to your next tour;
        Daily Disaster and Quick Yeet keep their usual rules.
      </p>
      <div className="challenge-choices">
        {CHALLENGE_RULES.map((rule) => (
          <button
            key={rule.id}
            className={save.challenge === rule.id ? 'selected' : ''}
            aria-pressed={save.challenge === rule.id}
            disabled={!challengeUnlocked(rule.id, save.wins)}
            onClick={() =>
              controller.current?.setPreference('challenge', rule.id)
            }
          >
            <span>
              <b>{rule.name}</b>
              <small>{rule.detail}</small>
            </span>
            <em>{ruleState(save, rule.id, rule.requirement)}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

/** One key binding, which listens for the next keypress once armed. */
function RemapButton({
  save,
  binding,
  index,
  remap,
  onRemap,
  controller,
}: {
  save: SaveData;
  binding: 'primaryKey' | 'secondaryKey';
  index: number;
  remap: RemapTarget;
  onRemap: (target: RemapTarget) => void;
  controller: ControllerRef;
}) {
  const role = index === 0 ? 'GALLOP / FLAP / KICK' : 'JUMP / FLIP / ABILITY';
  return (
    <button
      onClick={() => onRemap(binding)}
      onKeyDown={(e) => {
        if (remap !== binding) return;
        e.preventDefault();
        e.stopPropagation();
        if (!/^(Space|Arrow(Up|Down|Left|Right)|Key[A-Z])$/.test(e.code))
          return;
        controller.current?.setPreference(binding, e.code);
        onRemap(null);
      }}
    >
      {remap === binding ? 'PRESS A KEY…' : `${role}: ${save[binding]}`}
    </button>
  );
}

/** Sound, motion and accessibility toggles, plus the two key bindings. */
function ControlsTab({
  save,
  remap,
  onRemap,
  controller,
}: {
  save: SaveData;
  remap: RemapTarget;
  onRemap: (target: RemapTarget) => void;
  controller: ControllerRef;
}) {
  return (
    <div role="tabpanel" id="stable-controls" aria-labelledby="controls-tab">
      <div className="settings-list">
        {TOGGLES.map((item) => (
          <label
            className="setting-row"
            key={item.key}
            htmlFor={`setting-${item.key}`}
          >
            <span>
              <b>{item.label}</b>
              <small>{item.detail}</small>
            </span>
            <Switch
              id={`setting-${item.key}`}
              checked={save[item.key]}
              onCheckedChange={(v) =>
                controller.current?.setPreference(item.key, v)
              }
              aria-label={item.label}
            />
          </label>
        ))}
      </div>
      <h3>Keys</h3>
      <div className="remap-buttons">
        {(['primaryKey', 'secondaryKey'] as const).map((binding, index) => (
          <RemapButton
            key={binding}
            save={save}
            binding={binding}
            index={index}
            remap={remap}
            onRemap={onRemap}
            controller={controller}
          />
        ))}
      </div>
    </div>
  );
}

/** Recovery for a hat that failed to fit or a portrait that failed to render. */
function WardrobeError({
  wardrobe,
  portraitError,
  onRetryHat,
  onRetryPortrait,
}: {
  wardrobe: ViewState['wardrobe'];
  portraitError: string;
  onRetryHat: () => void;
  onRetryPortrait: () => void;
}) {
  const message = wardrobe?.error || portraitError;
  if (!message) return null;
  return (
    <div className="wardrobe-error" role="alert">
      <span>{message}</span>
      <button onClick={wardrobe?.error ? onRetryHat : onRetryPortrait}>
        {wardrobe?.error ? 'Retry hat' : 'Retry preview'}
      </button>
    </div>
  );
}

/** The caption under a hat: fitting, equipped, equippable, or its unlock rule. */
function hatState(
  save: SaveData,
  wardrobe: ViewState['wardrobe'],
  id: SaveData['hat'],
  requirement: string,
) {
  if (wardrobe?.hat === id && wardrobe.loading) return 'Fitting…';
  if (save.hat === id) return 'Equipped';
  return save.hats.includes(id) ? 'Equip' : requirement;
}

/** Pony and hat selection. Both apply immediately to the live rig. */
function WardrobeTab({
  save,
  wardrobe,
  portraits,
  portraitError,
  onRetryPortrait,
  controller,
}: {
  save: SaveData;
  wardrobe: ViewState['wardrobe'];
  portraits: Record<string, string>;
  portraitError: string;
  onRetryPortrait: () => void;
  controller: ControllerRef;
}) {
  return (
    <div role="tabpanel" id="stable-wardrobe" aria-labelledby="wardrobe-tab">
      <div className="wardrobe-heading">
        <h3>MEET YOUR LIABILITY</h3>
        <span>Applied immediately.</span>
      </div>
      <WardrobeError
        wardrobe={wardrobe}
        portraitError={portraitError}
        onRetryHat={() =>
          wardrobe && controller.current?.setPreference('hat', wardrobe.hat)
        }
        onRetryPortrait={onRetryPortrait}
      />
      <div className="pony-grid">
        {PONIES.map((pony) => (
          <button
            key={pony.id}
            className={`pony-option ${save.pony === pony.id ? 'selected' : ''}`}
            disabled={!ponyUnlocked(pony.id, save)}
            aria-pressed={save.pony === pony.id}
            onClick={() => controller.current?.setPreference('pony', pony.id)}
          >
            <span className="pony-portrait">
              {portraits[pony.id] && (
                <img src={portraits[pony.id]} alt="" width={112} height={140} />
              )}
              {save.pony === pony.id && <Check size={16} />}
            </span>
            <b>{pony.name}</b>
            <small>
              {ponyUnlocked(pony.id, save)
                ? 'Ready for trouble'
                : pony.requirement}
            </small>
          </button>
        ))}
      </div>
      <p className="pony-tagline">
        {PONIES.find((p) => p.id === save.pony)?.tagline}
      </p>
      <h3>DRESS FOR THE DISASTER</h3>
      <div className="hat-grid">
        {HATS.map((hat) => (
          <button
            key={hat.id}
            disabled={!save.hats.includes(hat.id)}
            className={`hat-option ${save.hat === hat.id ? 'selected' : ''}`}
            aria-pressed={save.hat === hat.id}
            onClick={() => controller.current?.setPreference('hat', hat.id)}
          >
            <img src={hatAsset(hat.id)} alt="" width={72} height={70} />
            <b>{hat.name}</b>
            <small>{hatState(save, wardrobe, hat.id, hat.requirement)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The settings dialog body: three tabs plus the door to the scrapbook. */
export function SettingsPanel({
  save,
  wardrobe,
  tab,
  onSelectTab,
  remap,
  onRemap,
  portraits,
  portraitError,
  onRetryPortrait,
  onScrapbook,
  controller,
}: {
  save: SaveData;
  wardrobe: ViewState['wardrobe'];
  tab: SettingsTab;
  onSelectTab: (tab: SettingsTab) => void;
  remap: RemapTarget;
  onRemap: (target: RemapTarget) => void;
  portraits: Record<string, string>;
  portraitError: string;
  onRetryPortrait: () => void;
  onScrapbook: () => void;
  controller: ControllerRef;
}) {
  return (
    <>
      <SettingsTabs save={save} tab={tab} onSelect={onSelectTab} />
      <button className="collection-link" onClick={onScrapbook}>
        <BookOpen size={17} /> Scrapbook <ChevronRight size={15} />
      </button>
      {tab === 'rules' && <RulesTab save={save} controller={controller} />}
      {tab === 'controls' && (
        <ControlsTab
          save={save}
          remap={remap}
          onRemap={onRemap}
          controller={controller}
        />
      )}
      {tab === 'wardrobe' && (
        <WardrobeTab
          save={save}
          wardrobe={wardrobe}
          portraits={portraits}
          portraitError={portraitError}
          onRetryPortrait={onRetryPortrait}
          controller={controller}
        />
      )}
    </>
  );
}
