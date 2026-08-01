import type { Plugin } from 'vite';

export type ContextDeclaration = {
	name: string;
	sourceFile: string;
};

export type ClientChunk = {
	fileName: string;
	modules: Record<string, unknown>;
};

export declare const findReactContextDeclarations: (
	tsconfigPath: string,
) => ContextDeclaration[];

export declare const findContextChunkIsolationViolations: (
	contexts: ContextDeclaration[],
	chunks: ClientChunk[],
) => string[];

export declare const contextChunkIsolationPlugin: (options: {
	tsconfigPath: string;
}) => Plugin;
