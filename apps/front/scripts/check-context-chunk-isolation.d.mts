import type { Plugin } from 'vite';

export type ContextDeclaration = {
	name: string;
	sourceFile: string;
	/** Structural positions (`contexts.probe`, `contexts[0]`, `<default>.probe`)
	 *  the source scan recorded for a holder-position mint. */
	mintingPositions?: string[];
};

export type ClientChunk = {
	fileName: string;
	modules: Record<string, unknown>;
};

export declare const findReactContextDeclarations: (
	tsconfigPath: string,
	onProgramSourceFiles?: (sourceFiles: Set<string>) => void,
) => ContextDeclaration[];

export declare const findContextChunkIsolationViolations: (
	contexts: ContextDeclaration[],
	chunks: ClientChunk[],
	projectDirectory?: string,
) => string[];

export declare const findContextInventoryViolations: (
	contexts: ContextDeclaration[],
	contextInventory: ContextDeclaration[],
	projectDirectory?: string,
) => string[];

export declare const contextChunkIsolationPlugin: (options: {
	contextInventory: ContextDeclaration[];
	tsconfigPath: string;
	workspaceDirectory?: string;
}) => Plugin;
