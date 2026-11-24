type NodeProcess = {
	env: Record<string, string | undefined>;
	stdout: { write(chunk: string): boolean };
	on(event: 'beforeExit' | 'exit', listener: () => void): NodeProcess;
};

/** Undefined in browsers. Typed here so shared-ts needs no Node typings. */
export const nodeProcess = (globalThis as { process?: NodeProcess }).process;

/** Vite's statically replaced env, absent outside Vite. */
export const viteEnv = (
	import.meta as { env?: Record<string, string | undefined> }
).env;
