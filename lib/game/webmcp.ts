import type { GameController } from './controller';
interface ModelContext {
  registerTool(
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ): void | Promise<void>;
}
export function registerGameTools(game: GameController) {
  const context = (document as Document & { modelContext?: ModelContext })
    .modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const register = (
    name: string,
    description: string,
    execute: (input: unknown) => unknown,
    readOnlyHint: boolean,
    inputSchema: object = {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  ) => {
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name,
            description,
            inputSchema,
            annotations: { readOnlyHint },
            execute,
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
  };
  register(
    'read_horse_game',
    'Read the current horse attempt, jump timing, distance and flight resources.',
    () => game.snapshot(),
    true,
  );
  register(
    'start_horse_attempt',
    'Start a fresh attempt, replacing the current attempt.',
    () => {
      if (!game.ready) throw new Error('Artwork is still loading.');
      game.start();
      return game.snapshot();
    },
    false,
  );
  register(
    'horse_action',
    'Press one game control: primary gallops or flaps; secondary jumps or flips.',
    (input) => {
      const value = input as { action?: unknown };
      if (!value || !['primary', 'secondary'].includes(String(value.action)))
        throw new Error('action must be primary or secondary');
      game.action(value.action as 'primary' | 'secondary');
      return game.snapshot();
    },
    false,
    {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['primary', 'secondary'] },
      },
      required: ['action'],
      additionalProperties: false,
    },
  );
  return () => lifecycle.abort();
}
