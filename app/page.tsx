import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  MoveRight,
  Volume2,
  VolumeX,
  Trophy,
  Settings2,
  Pause,
  Play,
  RotateCcw,
  BookOpen,
  Check,
  Zap,
  Skull,
  Heart,
  Coins,
  Film,
  Share2,
  Download,
  X,
  Home as HomeIcon,
  ChevronRight,
  Map,
  Sparkles,
  Package,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  GameController,
  type ViewState,
  type Recording,
} from '@/lib/game/controller';
import {
  createGame,
  LANDINGS,
  jumpTarget,
  PHYSICS,
  type Action,
} from '@/lib/game/simulation';
import { defaultSave } from '@/lib/game/storage';
import { HATS, PONIES, ponyUnlocked } from '@/lib/game/cosmetics';
import {
  CHALLENGE_RULES,
  insuranceCapacity,
  challengeUnlocked,
} from '@/lib/game/challenge-rules';
import { CATASTROPHES } from '@/lib/game/catastrophes';
import { registerGameTools } from '@/lib/game/webmcp';
import {
  CONTENT_VERSION,
  WORLDS,
  RELICS,
  relicById,
  relicArt,
  SYNERGIES,
} from '@/lib/game/content';
import {
  availableWorlds,
  objective,
  dailyKey,
  parseChallenge,
  price,
  challengeUrl,
  type RunMode,
} from '@/lib/game/run';
import {
  exportClip,
  incidentCard,
  downloadBlob,
  shareFile,
  listIncidents,
  type Incident,
} from '@/lib/game/sharing';
const initial: ViewState = {
  game: createGame(),
  save: defaultSave(),
  run: null,
  screen: 'home',
  ready: false,
  error: '',
  graphicsLost: false,
  newBest: false,
  newHats: [],
  fps: 60,
};
export default function Home() {
  const [challengeWarning] = useState(() =>
    new URLSearchParams(window.location.search).has('seed') &&
    !parseChallenge(window.location.search)
      ? 'That challenge uses an older or unsupported course. Start a fresh run below.'
      : '',
  );
  const canvas = useRef<HTMLCanvasElement>(null),
    clipVideo = useRef<HTMLVideoElement>(null),
    controller = useRef<GameController | null>(null),
    exportAbort = useRef<AbortController | null>(null);
  const [view, setView] = useState(initial),
    [panel, setPanel] = useState<
      'settings' | 'scrapbook' | 'clip' | 'levels' | 'upgrades' | null
    >(null),
    [replacement, setReplacement] = useState<string | null>(null),
    [shopping, setShopping] = useState(false),
    [portrait, setPortrait] = useState(true),
    [captions, setCaptions] = useState(true),
    [clipLength, setClipLength] = useState(0),
    [progress, setProgress] = useState<number | null>(null),
    [clip, setClip] = useState<Blob | null>(null),
    [notice, setNotice] = useState(''),
    [incidents, setIncidents] = useState<Incident[]>([]),
    [selectedRecording, setSelectedRecording] = useState<{
      recording: Recording;
      challenge?: { url: string; score: number };
    } | null>(null),
    [remap, setRemap] = useState<'primaryKey' | 'secondaryKey' | null>(null);
  const [settingsTab, setSettingsTab] = useState<
    'controls' | 'wardrobe' | 'rules'
  >('controls');
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  useEffect(() => {
    if (panel === 'settings' && view.ready)
      setPortraits(
        controller.current?.renderer.ponyPortraits(view.save.hat) ?? {},
      );
  }, [panel, view.ready, view.save.hat]);
  const hudRef = useCallback((node: HTMLDivElement | null) => {
    controller.current?.observeHud(node);
  }, []);
  useEffect(() => {
    if (!canvas.current) return;
    const c = new GameController(canvas.current, setView);
    controller.current = c;
    const unregister = registerGameTools(c);
    if (import.meta.env.DEV)
      (window as Window & { __hoof?: GameController }).__hoof = c;
    return () => {
      exportAbort.current?.abort();
      unregister();
      c.dispose();
      controller.current = null;
      Reflect.deleteProperty(window, '__hoof');
    };
  }, []);
  useEffect(() => {
    if (!clip || !clipVideo.current) return;
    const url = URL.createObjectURL(clip);
    clipVideo.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [clip]);
  const s = view.game,
    run = view.run,
    home = view.screen === 'home',
    playing = view.screen === 'game',
    results = view.screen === 'results',
    crashing = s.phase === 'landing',
    air = s.phase === 'flight',
    replay = s.phase === 'replay',
    goal = run ? objective(run) : null,
    jump = jumpTarget(s),
    speed = Math.max(
      0,
      (s.speed - PHYSICS.minSpeed) / (PHYSICS.maxSpeed - PHYSICS.minSpeed),
    ),
    build = run ? [...run.passives, run.ability] : [],
    contractClear =
      !!goal &&
      !s.failed &&
      s.distance >= goal.distance &&
      s.havoc >= goal.havoc &&
      s.bossHits >= goal.bossHits;
  const today = new Date().toISOString().slice(0, 10);
  const dailyBest = view.save.daily[dailyKey(today, view.save.assisted)];
  const focus = () => canvas.current?.focus({ preventScroll: true });
  const start = (mode: RunMode) => {
    controller.current?.startRun(mode);
    setNotice('');
  };
  const launch = () => {
    void controller.current?.launch().then(focus);
  };
  const takeUpgrade = (id: string, replace?: string) => {
    const c = controller.current;
    if (!c?.choose(id, replace)) return;
    setReplacement(null);
    if (!shopping) void c.next(true).then(focus);
  };
  const continueTour = () => {
    setShopping(false);
    void controller.current?.next(true).then(focus);
  };
  const open = (p: typeof panel) => {
    if (playing) controller.current?.pause(true);
    setPanel(p);
    setNotice('');
    if (p === 'scrapbook') void listIncidents().then(setIncidents);
    if (p === 'clip') {
      const recording = controller.current?.recording();
      setSelectedRecording(
        recording
          ? {
              recording,
              challenge: run
                ? {
                    url: challengeUrl(run, window.location.origin),
                    score: run.score,
                  }
                : undefined,
            }
          : null,
      );
      setClip(null);
    }
  };
  const close = () => {
    exportAbort.current?.abort();
    setPanel(null);
    setProgress(null);
    setRemap(null);
  };
  const makeClip = async () => {
    const recording =
      selectedRecording?.recording ?? controller.current?.recording();
    if (!recording) return;
    const abort = new AbortController();
    exportAbort.current = abort;
    setNotice('');
    setClip(null);
    setProgress(0);
    controller.current?.setExporting(true);
    try {
      setClip(
        await exportClip(recording, {
          portrait,
          captions,
          duration: clipLength || undefined,
          signal: abort.signal,
          progress: setProgress,
        }),
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setNotice((e as Error).message);
    } finally {
      controller.current?.setExporting(false);
      setProgress(null);
    }
  };
  const card = async () => {
    try {
      const recording =
        selectedRecording?.recording ?? controller.current?.recording();
      if (recording)
        downloadBlob(
          await incidentCard(recording),
          'hoof-and-yeet-incident.png',
        );
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const challenge = async () => {
    if (!selectedRecording?.challenge) return;
    const { url, score } = selectedRecording.challenge;
    try {
      if (navigator.share)
        await navigator.share({
          title: 'Can your horse do worse?',
          text: `I caused ${score.toLocaleString()} points of trouble. Your turn.`,
          url,
        });
      else {
        await navigator.clipboard.writeText(url);
        setNotice('Challenge link copied. Send it to a questionable friend.');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError')
        setNotice('Copy this challenge: ' + url);
    }
  };
  const controlKey = (action: Action) => {
    const code =
      action === 'primary' ? view.save.primaryKey : view.save.secondaryKey;
    const label =
      (
        {
          ArrowUp: '↑',
          ArrowDown: '↓',
          ArrowLeft: '←',
          ArrowRight: '→',
        } as Record<string, string>
      )[code] ?? code.replace(/^Key|^Digit/, '');
    return (
      <div className="guide-input">
        <span className="guide-keyboard">
          <kbd className={`guide-key ${action}`}>{label}</kbd>
          <span className="guide-mouse">
            or {action === 'primary' ? 'left click' : 'right click'}
          </span>
        </span>
        <span className="guide-touch">
          <span className={`guide-key ${action}`} aria-hidden="true">
            {action === 'primary' ? <Zap size={18} /> : <ArrowUp size={18} />}
          </span>
          <b>{action === 'primary' ? 'Tap left' : 'Tap right'}</b>
        </span>
      </div>
    );
  };
  const pad = (
    action: Action,
    label: string,
    sub: string,
    disabled: boolean,
  ) => (
    <button
      className={`action-pad ${action}`}
      disabled={disabled || s.paused}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        controller.current?.pointerDown(`pad-${e.pointerId}-${action}`, action);
      }}
      onPointerUp={(e) =>
        controller.current?.pointerUp(`pad-${e.pointerId}-${action}`)
      }
      onPointerCancel={() => controller.current?.cancelPointer()}
      onLostPointerCapture={(e) =>
        controller.current?.pointerUp(`pad-${e.pointerId}-${action}`)
      }
      onClick={(e) => {
        if (e.detail === 0) controller.current?.action(action);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="pad-icon">
        {action === 'primary' ? <Zap /> : <ArrowUp />}
      </span>
      <span>
        <b>{label}</b>
        <small>{sub}</small>
      </span>
      <span className="pad-inputs">
        <kbd>
          {action === 'primary'
            ? view.save.primaryKey.replace('Key', '')
            : view.save.secondaryKey.replace('Arrow', '')}
        </kbd>
        <small>or {action === 'primary' ? 'left click' : 'right click'}</small>
      </span>
    </button>
  );
  return (
    <main
      className={`game-page unstable play-first ${home ? 'is-home' : ''} ${playing ? 'is-active' : ''} ${view.save.reduced ? 'reduced-motion' : ''}`}
    >
      <header className="topbar">
        <button
          className="brand"
          onClick={() => controller.current?.home()}
          aria-label="Hoof and Yeet home"
        >
          hoof<span>&</span>yeet
        </button>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label={
              view.save.music || view.save.effects
                ? 'Mute sound'
                : 'Enable sound'
            }
            onClick={() => {
              const on = !(view.save.music || view.save.effects);
              controller.current?.setPreference('music', on);
              controller.current?.setPreference('effects', on);
            }}
          >
            {view.save.music || view.save.effects ? (
              <Volume2 size={19} />
            ) : (
              <VolumeX size={19} />
            )}
          </button>
          <button
            className="icon-button"
            aria-label="Settings and hats"
            onClick={() => open('settings')}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>
      <section
        className={`arena ${home ? 'is-title' : 'is-playing'} ${air ? 'in-air' : ''} screen-${view.screen}`}
        aria-label="Hoof and Yeet game"
      >
        <canvas
          ref={canvas}
          tabIndex={0}
          aria-label="Hoof and Yeet game field"
          onPointerDown={(e) => {
            if (e.button !== 0 && e.button !== 2) return;
            e.preventDefault();
            focus();
            e.currentTarget.setPointerCapture(e.pointerId);
            controller.current?.pointerDown(
              `field-${e.pointerId}-${e.button === 2 ? 'secondary' : 'primary'}`,
              e.button === 2 ? 'secondary' : 'primary',
            );
          }}
          onPointerUp={(e) =>
            controller.current?.pointerUp(
              `field-${e.pointerId}-${e.button === 2 ? 'secondary' : 'primary'}`,
            )
          }
          onPointerCancel={() => controller.current?.cancelPointer()}
          onLostPointerCapture={() => controller.current?.clearInputs()}
          onContextMenu={(e) => e.preventDefault()}
        />
        <div className="arena-top">
          {playing && run?.mode !== 'quick' && (
            <span className="event-chip">
              {run?.stage !== undefined ? run.stage + 1 : 1} / 9
            </span>
          )}
          {playing && (
            <button
              className="arena-pause"
              onClick={() => controller.current?.pause()}
              aria-label={s.paused ? 'Resume game' : 'Pause game'}
            >
              {s.paused ? <Play size={18} /> : <Pause size={18} />}
            </button>
          )}
        </div>
        {home && (
          <div className="tour-home">
            <h1 aria-label="Hoof & Yeet">
              hoof<span>&</span>yeet
            </h1>
            <fieldset className="home-controls" aria-label="How to play">
              <div className="guide-row guide-inputs">
                <span aria-hidden="true" />
                {controlKey('primary')}
                {controlKey('secondary')}
              </div>
              {[
                ['On track', 'Run', 'Jump'],
                ['In air', 'Flap', 'Roll'],
                ['On landing', 'Kick', 'Ability'],
              ].map(([phase, primary, secondary]) => (
                <div className="guide-row" key={phase}>
                  <span className="guide-phase">{phase}</span>
                  <span className="guide-action">
                    <b>{primary}</b>
                    {primary === 'Run' && <small>(tap)</small>}
                  </span>
                  <span className="guide-action">
                    <b>{secondary}</b>
                  </span>
                </div>
              ))}
            </fieldset>
            {challengeWarning && (
              <p className="challenge-warning">{challengeWarning}</p>
            )}
            <div className="home-actions">
              <button
                className="start-button"
                disabled={!view.ready}
                onClick={() => {
                  if (view.save.run)
                    void controller.current?.resumeRun().then(focus);
                  else start('tour');
                }}
              >
                <span>
                  <b>{view.save.run ? 'RESUME TOUR' : 'PLAY TOUR'}</b>
                  <small>
                    {view.save.run
                      ? `Event ${view.save.run.stage + 1} / 9`
                      : '9 events · earn upgrades'}
                  </small>
                </span>
                <Play size={22} fill="currentColor" />
              </button>
              <button
                className="quick-play"
                disabled={!view.ready}
                onClick={() => {
                  controller.current?.start();
                  focus();
                }}
              >
                <Zap size={20} />
                <span>Quick play</span>
              </button>
            </div>
            <nav className="home-destinations" aria-label="Explore the game">
              <button onClick={() => open('levels')}>
                <Map />
                <span>Levels</span>
              </button>
              <button
                disabled={!view.ready}
                onClick={() => {
                  setSettingsTab('wardrobe');
                  open('settings');
                }}
              >
                <Sparkles />
                <span>Pony & hats</span>
              </button>
              <button onClick={() => open('upgrades')}>
                <Package />
                <span>Upgrades</span>
              </button>
            </nav>
            <div className="mode-buttons">
              {view.save.run && (
                <button disabled={!view.ready} onClick={() => start('tour')}>
                  New tour <MoveRight size={15} />
                </button>
              )}
              <button
                disabled={!view.ready}
                onClick={() => start('daily')}
                title={
                  dailyBest
                    ? `Daily best: ${dailyBest.toLocaleString()}`
                    : 'Today’s shared course'
                }
              >
                Daily <Skull size={15} />
              </button>
            </div>
          </div>
        )}
        {view.screen === 'briefing' && run && (
          <div className="planning-screen">
            <div className="event-heading">
              <span className="eyebrow">
                {run.mode === 'daily' ? 'DAILY · ' : ''}ACT{' '}
                {Math.floor(run.stage / 3) + 1} / 3
              </span>
              <h2>Choose your level</h2>
              {(run.updatedDaily || run.rules !== 'standard') && (
                <p className="rule-description">
                  {run.updatedDaily
                    ? 'Your saved daily continues as a tour, with your progress intact.'
                    : CHALLENGE_RULES.find((rule) => rule.id === run.rules)
                        ?.detail}
                </p>
              )}
            </div>
            <div className="route-grid">
              {(run.mode === 'quick' ? [WORLDS[0]] : availableWorlds(run)).map(
                (w) => (
                  <button
                    key={w.id}
                    className="route-card"
                    aria-label={`Play ${w.name}`}
                    disabled={!view.ready}
                    style={
                      {
                        '--route-color': w.color,
                        '--route-focus': w.id === 'farm' ? '100%' : '35%',
                      } as React.CSSProperties
                    }
                    onClick={() => {
                      void controller.current?.launch(w.id).then(focus);
                    }}
                  >
                    <img
                      src={`/art/${w.art}.webp`}
                      alt=""
                      width={600}
                      height={300}
                    />
                    <div>
                      <h3>{w.name}</h3>
                      <p>{w.description}</p>
                      <span className="route-go">
                        Play here <MoveRight size={17} />
                      </span>
                    </div>
                  </button>
                ),
              )}
            </div>
            <div className="route-footnote">
              <span>{goal?.distance} m → choose an upgrade</span>
              <span>
                <Heart size={14} /> {run.insurance} tries
              </span>
            </div>
          </div>
        )}
        {view.screen === 'pitstop' && run && (
          <div className="planning-screen pitstop">
            <div className="event-heading">
              <span className="eyebrow">{run.stage + 1} / 9 COMPLETE</span>
              <h2>
                {run.rewardTaken
                  ? 'Ready to roll?'
                  : 'Pick a perk. Keep going.'}
              </h2>
            </div>
            <div className="relic-offers">
              {run.offers.map((id) => {
                const r = relicById(id);
                const potential = SYNERGIES.filter(
                  (c) =>
                    c.items.includes(id) &&
                    c.items.some((x) => x !== id && build.includes(x)),
                );
                return (
                  <button
                    className={`relic-card ${build.includes(id) ? 'chosen' : ''}`}
                    disabled={
                      build.includes(id) ||
                      (run.rewardTaken && run.salvage < price(run, 'equipment'))
                    }
                    key={id}
                    onClick={() => {
                      if (r.category !== 'active' && run.passives.length >= 4)
                        setReplacement(id);
                      else takeUpgrade(id);
                    }}
                  >
                    <div className="relic-art">
                      <img src={relicArt(id)} width={130} height={115} alt="" />
                    </div>
                    <h3>{r.name}</h3>
                    <p>{r.description}</p>
                    {potential.map((c) => (
                      <span className="synergy-opportunity" key={c.id}>
                        ✦ {c.name}
                      </span>
                    ))}
                    <b>
                      {build.includes(id)
                        ? '✓ EQUIPPED'
                        : run.rewardTaken
                          ? `${price(run, 'equipment')} salvage`
                          : r.category === 'active'
                            ? `Replaces ${relicById(run.ability).name}`
                            : 'Choose →'}
                    </b>
                  </button>
                );
              })}
            </div>
            {replacement && (
              <div className="replacement">
                <b>Replace which relic with {relicById(replacement).name}?</b>
                <div>
                  {run.passives.map((id) => (
                    <button
                      key={id}
                      onClick={() => {
                        takeUpgrade(replacement, id);
                      }}
                    >
                      {relicById(id).name}
                      <small>{relicById(id).description}</small>
                    </button>
                  ))}
                  <button onClick={() => setReplacement(null)}>Cancel</button>
                </div>
              </div>
            )}
            <div className="pitstop-tools">
              <span className="pocket-money">
                <Coins size={17} /> {run.salvage}
              </span>
              <button
                className="text-button"
                aria-expanded={shopping}
                onClick={() => setShopping(!shopping)}
              >
                Shop & reroll <ChevronRight size={15} />
              </button>
              {run.rewardTaken && (
                <button
                  className="start-button"
                  disabled={!view.ready}
                  onClick={continueTour}
                >
                  CONTINUE <MoveRight size={20} />
                </button>
              )}
            </div>
            <div className="equipped-perks" aria-label="Equipped upgrades">
              <span>Equipped</span>
              {build.map((id) => (
                <span key={id} title={relicById(id).description}>
                  <img src={relicArt(id)} alt="" width={26} height={26} />
                  {relicById(id).name}
                </span>
              ))}
            </div>
            {shopping && (
              <div className="pitstop-shop">
                <button
                  disabled={
                    run.insurance >= insuranceCapacity(run.rules) ||
                    run.salvage < price(run, 'insurance')
                  }
                  onClick={() => controller.current?.insurance()}
                >
                  <Heart size={15} /> Extra try · {price(run, 'insurance')}
                </button>
                <button
                  disabled={
                    run.rewardTaken || run.salvage < price(run, 'reroll')
                  }
                  onClick={() => controller.current?.reroll()}
                >
                  <RotateCcw size={15} /> Reroll · {price(run, 'reroll')}
                </button>
                <small>
                  {run.rewardTaken
                    ? 'Extra perks cost salvage. Continue when ready.'
                    : 'Your first pick is free. Stay to shop, or close this for a quick getaway.'}
                </small>
              </div>
            )}
          </div>
        )}
        {playing && (
          <>
            <div className="hud" ref={hudRef}>
              <div className="hud-metric">
                {s.launched ? (
                  <>
                    <span>{crashing ? 'Total distance' : 'Distance'}</span>
                    <strong>
                      {s.distance.toFixed(1)}
                      <small> m</small>
                    </strong>
                    {crashing && (
                      <span>
                        +
                        {Math.max(
                          0,
                          s.distance - (s.flightDistance ?? s.distance),
                        ).toFixed(1)}{' '}
                        m after landing
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span>Speed</span>
                    <meter
                      className="speed-track"
                      aria-label="Speed"
                      value={Math.round(speed * 100)}
                      min={0}
                      max={100}
                    />
                  </>
                )}
                {s.launched && !crashing && run?.mode !== 'quick' && (
                  <span className={contractClear ? 'target-cleared' : ''}>
                    {s.distance >= (goal?.distance ?? 0) ? '✓' : '↗'}{' '}
                    {goal?.distance} m target
                  </span>
                )}
              </div>
              {s.phase !== 'title' && !replay && (
                <div
                  className={`ability-hint ${crashing && s.wreck?.abilityReady ? 'is-ready' : ''}`}
                  aria-label="Equipped ability"
                >
                  <img
                    src={relicArt(s.ability)}
                    alt=""
                    width={32}
                    height={32}
                  />
                  <span>
                    <b>{relicById(s.ability).name}</b>
                    <small>
                      {crashing
                        ? s.wreck?.abilityReady
                          ? 'Use the right control now'
                          : 'Used'
                        : 'Right control after landing'}
                    </small>
                  </span>
                </div>
              )}
              {s.boss && s.launched && (
                <div className="boss-progress" aria-label="Boss objective">
                  <span>
                    <Skull size={15} /> {s.bossHits}/{goal?.bossHits} hits
                  </span>
                  <span>
                    {s.havoc}/{goal?.havoc} havoc
                  </span>
                </div>
              )}
            </div>
            {s.phase === 'countdown' && !s.paused && (
              <div className="countdown">
                <b key={s.countdownBeat}>{s.countdownBeat || 'GO!'}</b>
              </div>
            )}
            {s.phase === 'runup' && !s.paused && (
              <div className={`timing-cue ${jump.ready ? 'jump-now' : ''}`}>
                <span>
                  {jump.ready
                    ? '↑ JUMP!'
                    : jump.late
                      ? '↑ LAST CHANCE!'
                      : 'TAP TO GALLOP'}
                </span>
              </div>
            )}
            {replay && (
              <button
                className="skip-replay"
                onClick={() => controller.current?.skipReplay()}
              >
                Done
              </button>
            )}
          </>
        )}
        {results && run && (
          <section className="result-screen" aria-label="Attempt results">
            <div className={`result-stamp ${view.newBest ? 'new-best' : ''}`}>
              {run.status === 'won' && run.mode !== 'quick'
                ? 'TOUR COMPLETE'
                : run.status === 'lost'
                  ? 'OUT OF TRIES'
                  : run.status === 'briefing'
                    ? `${run.insurance} TRIES LEFT`
                    : view.newBest
                      ? 'NEW BEST'
                      : 'NICE YEET.'}
            </div>
            <h2>{s.failed ? 'Premature yeet.' : LANDINGS[s.landing].name}</h2>
            <p className="result-measure">
              {(s.flightDistance ?? s.distance).toFixed(1)} m jump +{' '}
              {Math.max(
                0,
                s.distance - (s.flightDistance ?? s.distance),
              ).toFixed(1)}{' '}
              m after landing
            </p>
            <div className="result-distance">
              {s.distance.toFixed(1)}
              <span>m</span>
            </div>
            <div className="result-stats">
              <span>
                <b>{s.havoc}</b> havoc
              </span>
              <span>
                <b>{s.style}</b> style
              </span>
              {run.mode !== 'quick' && (
                <span>
                  <b>{run.score.toLocaleString()}</b> total
                </span>
              )}
            </div>
            {(s.failed ||
              run.status === 'briefing' ||
              run.status === 'lost') && (
              <p className="result-reason">
                {s.failed
                  ? s.failureReason
                  : goal?.boss && s.bossHits < goal.bossHits
                    ? `${s.bossHits}/${goal.bossHits} boss hits. Send more wreckage their way.`
                    : `Reach ${goal?.distance} m to clear this event.`}
              </p>
            )}
            {view.newHats.length > 0 && (
              <span className="unlock-note">New hat unlocked</span>
            )}
            <div className="result-main-actions">
              {run.status === 'pitstop' ? (
                <button
                  className="start-button"
                  onClick={() => {
                    setShopping(false);
                    controller.current?.pitstop();
                  }}
                >
                  NEXT <MoveRight size={20} />
                </button>
              ) : run.status === 'briefing' ? (
                <button className="start-button" onClick={launch}>
                  TRY AGAIN <RotateCcw size={18} />
                </button>
              ) : (
                <button
                  className="start-button"
                  onClick={() =>
                    run.mode === 'quick'
                      ? controller.current?.start()
                      : start(run.mode)
                  }
                >
                  {run.mode === 'quick' ? 'AGAIN' : 'PLAY AGAIN'}{' '}
                  <RotateCcw size={18} />
                </button>
              )}
            </div>
            <div className="result-links">
              <button
                onClick={() => {
                  controller.current?.replayIncident();
                  focus();
                }}
              >
                <Play size={14} /> Replay
              </button>
              <button onClick={() => open('clip')}>
                <Share2 size={15} /> Share
              </button>
            </div>
            {notice && <p className="inline-notice">{notice}</p>}
          </section>
        )}
        {s.paused && playing && (
          <div className="pause-screen">
            <h2>Paused.</h2>
            <button
              className="start-button"
              onClick={() => {
                controller.current?.pause(false);
                focus();
              }}
            >
              RESUME <Play size={19} />
            </button>
            <button className="text-button" onClick={() => open('settings')}>
              <Settings2 size={16} /> Settings
            </button>
            <button
              className="text-button"
              onClick={() => controller.current?.home()}
            >
              <HomeIcon size={16} /> Home
            </button>
          </div>
        )}
        {(view.error || view.graphicsLost) && (
          <div className="error-panel" role="alert">
            <b>
              {view.graphicsLost
                ? 'The picture needs a moment.'
                : 'The horse needs a moment.'}
            </b>
            <p>
              {view.error ||
                'Your run is paused while the picture recovers. You can reload if it does not return.'}
            </p>
            <button
              className="start-button"
              onClick={() => window.location.reload()}
            >
              {view.graphicsLost ? 'RELOAD GAME' : 'TRY AGAIN'}
            </button>
          </div>
        )}
        <div
          className={`ticker ${playing && (crashing || replay) && !s.paused ? 'has-commentary' : ''}`}
        >
          <div className="play-caption" aria-live="polite" aria-atomic="true">
            {playing && (crashing || replay) && !s.paused
              ? s.wreck?.caption
              : ''}
          </div>
        </div>
      </section>
      {playing ? (
        <section className="play-controls" aria-label="Game controls">
          {pad(
            'primary',
            crashing
              ? 'KICK'
              : air
                ? s.equipment.includes('beans')
                  ? 'FART BOOST'
                  : 'FLAP'
                : 'RUN',
            crashing
              ? `${s.wreck?.kicks ?? 0} left`
              : air
                ? `${s.flaps} left`
                : 'Tap repeatedly',
            !(
              s.phase === 'runup' ||
              (air && s.flaps > 0) ||
              (crashing && (s.wreck?.kicks ?? 0) > 0)
            ),
          )}
          {pad(
            'secondary',
            crashing
              ? relicById(s.ability).name.toUpperCase()
              : air
                ? 'ROLL'
                : 'JUMP',
            crashing
              ? s.wreck?.abilityReady
                ? 'Ready'
                : 'Used'
              : air
                ? '+style'
                : 'Time the bounce',
            !(
              s.phase === 'runup' ||
              air ||
              (crashing && s.wreck?.abilityReady)
            ),
          )}
        </section>
      ) : null}
      <Dialog
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          className={`horse-dialog ${panel === 'clip' ? 'clip-dialog' : ''} ${panel === 'levels' || panel === 'upgrades' ? 'browse-dialog' : ''}`}
        >
          <div className="dialog-heading">
            <DialogTitle>
              {panel === 'settings'
                ? settingsTab === 'wardrobe'
                  ? 'Pony & hats'
                  : 'Settings'
                : panel === 'clip'
                  ? 'Share your yeet'
                  : panel === 'levels'
                    ? 'Choose a level'
                    : panel === 'upgrades'
                      ? 'Upgrades'
                      : 'Scrapbook'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {panel === 'settings'
                ? 'Dress for the job. Reassign the buttons. Negotiate with gravity.'
                : panel === 'clip'
                  ? 'Your actual recorded disaster, with sound. Nothing is uploaded automatically.'
                  : panel === 'levels'
                    ? 'Quick play in any of the six worlds. Your tour stays saved.'
                    : panel === 'upgrades'
                      ? 'Win tour events to choose upgrades. Abilities are used after landing; perks work automatically.'
                      : `${view.save.rounds} attempts. ${view.save.wins} completed tours. ${view.save.discoveries.length}/24 discoveries. Saved on this device.`}
            </DialogDescription>
          </div>
          <div className="dialog-body">
            {panel === 'levels' && (
              <>
                <p className="browse-intro">Quick play · all six worlds</p>
                <div className="level-browser">
                  {WORLDS.map((world) => (
                    <button
                      key={world.id}
                      disabled={!view.ready}
                      aria-label={`Play ${world.name}`}
                      onClick={() => {
                        close();
                        controller.current?.start(world.id);
                        focus();
                      }}
                    >
                      <img
                        src={`/art/${world.art}.webp`}
                        alt=""
                        width={300}
                        height={140}
                        loading="lazy"
                      />
                      <span>
                        <b>{world.name}</b>
                        <Play size={16} fill="currentColor" />
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {panel === 'upgrades' && (
              <>
                <p className="browse-intro">
                  Play a tour. Clear an event. Pick an upgrade.
                </p>
                {['active', 'passive'].map((category) => (
                  <section className="upgrade-library" key={category}>
                    <h3>
                      {category === 'active' ? 'Abilities' : 'Perks'}
                      <small>
                        {category === 'active'
                          ? 'Right control after landing · one use'
                          : 'Work automatically when equipped'}
                      </small>
                    </h3>
                    <div className="upgrade-catalogue">
                      {RELICS.filter(
                        (r) =>
                          (r.category === 'active') === (category === 'active'),
                      ).map((r) => (
                        <article
                          key={r.id}
                          className={
                            view.save.unlocked.includes(r.id) ? '' : 'is-locked'
                          }
                        >
                          <img
                            src={relicArt(r.id)}
                            alt=""
                            width={64}
                            height={64}
                            loading="lazy"
                          />
                          <div>
                            <h4>{r.name}</h4>
                            <p>{r.description}</p>
                            <small>
                              {view.save.unlocked.includes(r.id)
                                ? 'Available in tours'
                                : 'More attempts unlock this'}
                            </small>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </>
            )}
            {panel === 'settings' && (
              <>
                <div
                  className="settings-tabs"
                  role="tablist"
                  tabIndex={-1}
                  aria-label="Stable settings"
                  onKeyDown={(e) => {
                    if (
                      !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(
                        e.key,
                      )
                    )
                      return;
                    e.preventDefault();
                    const tabs = ['controls', 'wardrobe', 'rules'] as const;
                    const next =
                      tabs[
                        e.key === 'Home'
                          ? 0
                          : e.key === 'End'
                            ? 2
                            : (tabs.indexOf(settingsTab) +
                                (e.key === 'ArrowRight' ? 1 : 2)) %
                              3
                      ];
                    setSettingsTab(next);
                    document.getElementById(`${next}-tab`)?.focus();
                  }}
                >
                  <button
                    role="tab"
                    aria-selected={settingsTab === 'controls'}
                    aria-controls="stable-controls"
                    id="controls-tab"
                    tabIndex={settingsTab === 'controls' ? 0 : -1}
                    onClick={() => setSettingsTab('controls')}
                  >
                    Controls & sound
                  </button>
                  <button
                    role="tab"
                    aria-selected={settingsTab === 'wardrobe'}
                    aria-controls="stable-wardrobe"
                    id="wardrobe-tab"
                    tabIndex={settingsTab === 'wardrobe' ? 0 : -1}
                    onClick={() => setSettingsTab('wardrobe')}
                  >
                    Dressing room{' '}
                    <span>
                      {
                        PONIES.filter((p) => ponyUnlocked(p.id, view.save))
                          .length
                      }
                      /4
                    </span>
                  </button>
                  <button
                    role="tab"
                    aria-selected={settingsTab === 'rules'}
                    aria-controls="stable-rules"
                    id="rules-tab"
                    tabIndex={settingsTab === 'rules' ? 0 : -1}
                    onClick={() => setSettingsTab('rules')}
                  >
                    Tour rules
                  </button>
                </div>
                <button
                  className="collection-link"
                  onClick={() => open('scrapbook')}
                >
                  <BookOpen size={17} /> Scrapbook <ChevronRight size={15} />
                </button>
                {settingsTab === 'rules' && (
                  <div
                    role="tabpanel"
                    id="stable-rules"
                    aria-labelledby="rules-tab"
                  >
                    <p className="rule-intro">
                      Win tours. Unlock worse terms. These rules apply to your
                      next tour; Daily Disaster and Quick Yeet keep their usual
                      rules.
                    </p>
                    <div className="challenge-choices">
                      {CHALLENGE_RULES.map((rule) => (
                        <button
                          key={rule.id}
                          className={
                            view.save.challenge === rule.id ? 'selected' : ''
                          }
                          aria-pressed={view.save.challenge === rule.id}
                          disabled={!challengeUnlocked(rule.id, view.save.wins)}
                          onClick={() =>
                            controller.current?.setPreference(
                              'challenge',
                              rule.id,
                            )
                          }
                        >
                          <span>
                            <b>{rule.name}</b>
                            <small>{rule.detail}</small>
                          </span>
                          <em>
                            {challengeUnlocked(rule.id, view.save.wins)
                              ? view.save.challenge === rule.id
                                ? '✓ SELECTED'
                                : 'CHOOSE'
                              : rule.requirement}
                          </em>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {settingsTab === 'controls' && (
                  <div
                    role="tabpanel"
                    id="stable-controls"
                    aria-labelledby="controls-tab"
                  >
                    <div className="settings-list">
                      {(
                        [
                          {
                            key: 'music',
                            label: 'Music',
                            detail: '',
                          },
                          {
                            key: 'effects',
                            label: 'Sound effects',
                            detail: '',
                          },
                          {
                            key: 'reduced',
                            label: 'Less camera chaos',
                            detail: 'Reduce shake, particles, and extra motion',
                          },
                          {
                            key: 'gentle',
                            label: 'Less gruesome nonsense',
                            detail:
                              'Trade splatter and bones for absurd debris',
                          },
                          {
                            key: 'assisted',
                            label: 'Assisted tapping',
                            detail: 'Hold to gallop. Applies to your next run.',
                          },
                        ] as const
                      ).map((item) => (
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
                            checked={view.save[item.key]}
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
                      {(['primaryKey', 'secondaryKey'] as const).map(
                        (key, i) => (
                          <button
                            key={key}
                            onClick={() => setRemap(key)}
                            onKeyDown={(e) => {
                              if (remap !== key) return;
                              e.preventDefault();
                              e.stopPropagation();
                              if (
                                /^(Space|Arrow(Up|Down|Left|Right)|Key[A-Z])$/.test(
                                  e.code,
                                )
                              ) {
                                controller.current?.setPreference(key, e.code);
                                setRemap(null);
                              }
                            }}
                          >
                            {remap === key
                              ? 'PRESS A KEY…'
                              : `${i === 0 ? 'GALLOP / FLAP / KICK' : 'JUMP / FLIP / ABILITY'}: ${view.save[key]}`}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                )}
                {settingsTab === 'wardrobe' && (
                  <div
                    role="tabpanel"
                    id="stable-wardrobe"
                    aria-labelledby="wardrobe-tab"
                  >
                    <div className="wardrobe-heading">
                      <h3>MEET YOUR LIABILITY</h3>
                      <span>Applied immediately.</span>
                    </div>
                    <div className="pony-grid">
                      {PONIES.map((pony) => {
                        const unlocked = ponyUnlocked(pony.id, view.save);
                        return (
                          <button
                            key={pony.id}
                            className={`pony-option ${view.save.pony === pony.id ? 'selected' : ''}`}
                            disabled={!unlocked}
                            aria-pressed={view.save.pony === pony.id}
                            onClick={() =>
                              controller.current?.setPreference('pony', pony.id)
                            }
                          >
                            <span className="pony-portrait">
                              {portraits[pony.id] && (
                                <img
                                  src={portraits[pony.id]}
                                  alt=""
                                  width={112}
                                  height={140}
                                />
                              )}
                              {view.save.pony === pony.id && (
                                <Check size={16} />
                              )}
                            </span>
                            <b>{pony.name}</b>
                            <small>
                              {unlocked
                                ? 'Ready for trouble'
                                : pony.requirement}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                    <p className="pony-tagline">
                      {PONIES.find((p) => p.id === view.save.pony)?.tagline}
                    </p>
                    <h3>DRESS FOR THE DISASTER</h3>
                    <div className="hat-grid">
                      {HATS.map((hat) => (
                        <button
                          key={hat.id}
                          disabled={!view.save.hats.includes(hat.id)}
                          className={`hat-option ${view.save.hat === hat.id ? 'selected' : ''}`}
                          aria-pressed={view.save.hat === hat.id}
                          onClick={() =>
                            controller.current?.setPreference('hat', hat.id)
                          }
                        >
                          <img
                            src={`/art/sprites/${hat.art}.webp`}
                            alt=""
                            width={72}
                            height={70}
                          />
                          <b>{hat.name}</b>
                          <small>
                            {view.save.hat === hat.id
                              ? 'Equipped'
                              : view.save.hats.includes(hat.id)
                                ? 'Equip'
                                : hat.requirement}
                          </small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {panel === 'scrapbook' && (
              <>
                <div className="scrapbook-stats">
                  <span>
                    <b>{view.save.best.toFixed(1)}m</b> FURTHEST YEET
                  </span>
                  <span>
                    <b>{view.save.bestHavoc}</b> MAXIMUM HAVOC
                  </span>
                  <span>
                    <b>{view.save.unlocked.length}/30</b> BAD IDEAS
                  </span>
                </div>
                <section
                  className="daily-records"
                  aria-label="Daily Disaster records"
                >
                  <div>
                    <h3>DAILY DISASTER RECORDS</h3>
                    <span>Completed tours · this device</span>
                  </div>
                  {Object.keys(view.save.daily).length ? (
                    <ol>
                      {Object.entries(view.save.daily)
                        .sort(([a], [b]) =>
                          b
                            .replace(/^v\d+:/, '')
                            .localeCompare(a.replace(/^v\d+:/, '')),
                        )
                        .slice(0, 5)
                        .map(([day, score]) => (
                          <li key={day}>
                            <span>
                              <b>
                                {new Date(
                                  `${day.replace(/^v\d+:/, '').slice(0, 10)}T12:00:00Z`,
                                ).toLocaleDateString('en-GB', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                  timeZone: 'UTC',
                                })}
                              </b>
                              <small>
                                {!day.startsWith(`v${CONTENT_VERSION}:`) &&
                                  'Previous course · '}
                                {day.endsWith(':assisted')
                                  ? 'Assisted tapping'
                                  : 'Classic tapping'}
                              </small>
                            </span>
                            <strong>
                              {score.toLocaleString()} <small>pts</small>
                            </strong>
                          </li>
                        ))}
                    </ol>
                  ) : (
                    <p>
                      Finish today’s nine-event tour to pin your first score
                      here.
                    </p>
                  )}
                </section>
                <div className="saved-incidents">
                  {incidents.map((i) => (
                    <button
                      key={i.id}
                      onClick={() => {
                        setSelectedRecording({ recording: i.recording });
                        setClip(null);
                        setPanel('clip');
                      }}
                    >
                      <Film size={18} />
                      <span>
                        <b>{i.name}</b>
                        <small>
                          {i.distance.toFixed(1)}m · {i.havoc} havoc
                        </small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </div>
                <div className="landing-grid">
                  {WORLDS.flatMap((w) =>
                    w.disasters.map((d, i) => (
                      <div
                        className={`landing-card ${view.save.discoveries.includes(`${w.id}:${i}`) ? 'discovered' : ''}`}
                        key={`${w.id}:${i}`}
                      >
                        <span className="landing-number">{w.name}</span>
                        {view.save.discoveries.includes(`${w.id}:${i}`) ? (
                          <img
                            src={`/art/sprites/${CATASTROPHES[w.id][i].trap}.webp`}
                            alt=""
                            width={90}
                            height={78}
                          />
                        ) : (
                          <Skull size={22} />
                        )}
                        <b>
                          {view.save.discoveries.includes(`${w.id}:${i}`)
                            ? d
                            : 'Undocumented incident'}
                        </b>
                        <small>
                          {view.save.discoveries.includes(`${w.id}:${i}`)
                            ? 'EVIDENCE FILED'
                            : 'Keep yeeting. Science needs you.'}
                        </small>
                      </div>
                    )),
                  )}
                </div>
                <h3>LANDING AWARDS · {view.save.landings.length}/8</h3>
                <div className="awards-grid">
                  {Object.entries(LANDINGS).map(([id, landing]) => (
                    <div
                      className={
                        view.save.landings.includes(id as keyof typeof LANDINGS)
                          ? 'discovered'
                          : ''
                      }
                      key={id}
                    >
                      <Trophy size={24} />
                      <span>
                        <b>{landing.award}</b>
                        <small>
                          {view.save.landings.includes(
                            id as keyof typeof LANDINGS,
                          )
                            ? landing.description
                            : 'Finish a new kind of very bad landing.'}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
                <h3>YOUR TERRIBLE IDEAS</h3>
                <div className="relic-index">
                  {RELICS.map((r) => (
                    <span
                      key={r.id}
                      className={
                        view.save.unlocked.includes(r.id) ? 'unlocked' : ''
                      }
                      title={r.description}
                    >
                      {r.icon}{' '}
                      {view.save.unlocked.includes(r.id) ? r.name : '???'}
                    </span>
                  ))}
                </div>
              </>
            )}
            {panel === 'clip' && (
              <>
                <details className="export-options">
                  <summary>
                    Video options · {portrait ? 'vertical' : 'landscape'},{' '}
                    {clipLength ? `${clipLength}s` : 'full incident'}
                  </summary>
                  <div className="clip-options">
                    <button
                      className={portrait ? 'selected' : ''}
                      onClick={() => setPortrait(true)}
                      disabled={progress !== null}
                    >
                      ▯ VERTICAL · 9:16
                    </button>
                    <button
                      className={!portrait ? 'selected' : ''}
                      onClick={() => setPortrait(false)}
                      disabled={progress !== null}
                    >
                      ▭ LANDSCAPE · 16:9
                    </button>
                    <label htmlFor="clip-length">
                      Highlight length
                      <select
                        id="clip-length"
                        value={clipLength}
                        disabled={progress !== null}
                        onChange={(e) => setClipLength(Number(e.target.value))}
                      >
                        <option value={0}>Full incident</option>
                        <option value={12}>12s · extended highlight</option>
                        <option value={10}>10s · impact to punchline</option>
                        <option value={8}>8s · concentrated chaos</option>
                      </select>
                    </label>
                    <label htmlFor="clip-captions">
                      Incident captions{' '}
                      <Switch
                        id="clip-captions"
                        checked={captions}
                        onCheckedChange={setCaptions}
                        disabled={progress !== null}
                      />
                    </label>
                  </div>
                </details>
                {clip && (
                  <video
                    className="clip-preview"
                    ref={clipVideo}
                    controls
                    playsInline
                    aria-label="Your incident highlight"
                  >
                    <track
                      kind="captions"
                      src="/audio/incident-captions.vtt"
                      srcLang="en"
                      label="Sound descriptions"
                    />
                  </video>
                )}
                <div className="clip-stage">
                  <Film size={42} />
                  <b>
                    {clip
                      ? 'Ready to share'
                      : progress !== null
                        ? 'Making your video…'
                        : 'Save the best twelve seconds.'}
                  </b>
                  <p>
                    {progress !== null
                      ? 'Keep this tab visible. This takes about twelve seconds.'
                      : 'Your landing, with sound.'}
                  </p>
                  {progress !== null && (
                    <div className="clip-progress">
                      <i style={{ width: `${progress * 100}%` }} />
                    </div>
                  )}
                </div>
                {notice && <output className="inline-notice">{notice}</output>}
                <div className="clip-actions">
                  {selectedRecording?.challenge && (
                    <button
                      disabled={progress !== null}
                      onClick={() => void challenge()}
                    >
                      <Share2 size={16} /> Challenge a friend
                    </button>
                  )}
                  {progress !== null ? (
                    <button
                      className="start-button"
                      onClick={() => exportAbort.current?.abort()}
                    >
                      CANCEL <X size={18} />
                    </button>
                  ) : clip ? (
                    <>
                      <button
                        className="start-button"
                        onClick={() =>
                          void shareFile(
                            clip,
                            `hoof-and-yeet.${clip.type.includes('mp4') ? 'mp4' : 'webm'}`,
                          )
                        }
                      >
                        SHARE VIDEO <Share2 size={18} />
                      </button>
                      <button
                        onClick={() =>
                          downloadBlob(
                            clip,
                            `hoof-and-yeet.${clip.type.includes('mp4') ? 'mp4' : 'webm'}`,
                          )
                        }
                      >
                        <Download size={17} /> Download
                      </button>
                    </>
                  ) : (
                    <button
                      className="start-button"
                      onClick={() => void makeClip()}
                    >
                      MAKE VIDEO <Film size={18} />
                    </button>
                  )}
                  <button
                    disabled={progress !== null}
                    onClick={() => void card()}
                  >
                    Save image
                  </button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <span className="sr-only" aria-live="polite">
        {results
          ? `Attempt complete. ${s.distance.toFixed(1)} metres. ${s.havoc} havoc.`
          : s.phase === 'runup' && jump.ready
            ? 'Jump now'
            : s.phase === 'countdown'
              ? 'Get ready'
              : ''}
      </span>
    </main>
  );
}
