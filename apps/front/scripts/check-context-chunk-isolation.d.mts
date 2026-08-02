import type { Plugin } from 'vite';

export type SourceSpan = {
	startLine: number;
	startCol: number;
	endLine: number;
	endCol: number;
};

export type ContextDeclaration = {
	name: string;
	sourceFile: string;
	/** The exact source spans of the calls that mint this context, in the
	 *  TypeScript scan's 0-based line and UTF-16 column coordinates. A
	 *  rendered copy of the source is attributed a mint when the bundler's
	 *  own source map places an emitted call at one of these call starts. */
	mintSpans?: SourceSpan[];
};

export type ClientChunk = {
	fileName: string;
	modules: Record<string, unknown>;
	/** The emitted code of the chunk, when the bundle carries it; the guard
	 *  ties the map's generated positions to the calls it parses in this
	 *  code before it trusts a map for a copy. */
	code?: string;
	/** The source map the build emitted for this chunk. */
	map?: {
		version: number;
		sources: string[];
		mappings: string;
		names?: string[];
	};
};

export declare const findReactContextDeclarations: (
	tsconfigPath: string,
	onProgramSourceFiles?: (sourceFiles: Set<string>) => void,
) => ContextDeclaration[];

export declare const findContextChunkIsolationViolations: (
	contexts: ContextDeclaration[],
	chunks: ClientChunk[],
	projectDirectory?: string,
	outputDirectory?: string,
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
