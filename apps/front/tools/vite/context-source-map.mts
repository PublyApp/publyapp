// Source-map parsing and rendered-copy attribution for the context chunk
// isolation guard. The guard reads the source map the build itself emitted,
// decodes its VLQ segments, resolves each segment's original source id to the
// absolute module id the guard keys on, and classifies each delivered copy of
// a context source module against the recorded mint spans.
//
// Everything here is the subsystem the guard trusts: the decode is bounded
// (malformed input throws a named error, never hangs), a one-field VLQ segment
// is generated-only and carries no original position, and a copy is only
// attributable when the map is precise *and* ties its positions to the calls
// the copy actually emits.

import path from 'node:path';

/** A recorded minting-call extent in 0-based line / UTF-16 column coordinates. */
export interface SourceSpan {
	startCol: number;
	startLine: number;
	endCol: number;
	endLine: number;
}

/** One decoded mapping segment of a chunk source map. */
export type DecodedSegment =
	| {
			genCol: number;
			genLine: number;
			mapped: false;
	  }
	| {
			genCol: number;
			genLine: number;
			mapped: true;
			origCol: number;
			origLine: number;
			sourceIndex: number;
	  };

/** The subset of a chunk's source map the decoder relies on. */
export interface RawSourceMap {
	version: number;
	mappings: string;
	sources: string[];
}

const SOURCE_MAP_BASE64 =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

interface VlqDecodeState {
	index: number;
}

// The decode is bounded: every character must be in the base64 alphabet, every
// field must terminate (continuation bit cleared) before the input ends, and
// no field may exceed the 31-bit value range of the standard encoding.
// Malformed input throws a named guard error — it never hangs and never
// silently mis-reads.
export const readSourceMapVlq = (
	encoded: string,
	state: VlqDecodeState,
	chunkFileName: string,
): number => {
	let value = 0;
	let shift = 0;
	for (;;) {
		const character = encoded[state.index];
		const digit =
			character === undefined ? -1 : SOURCE_MAP_BASE64.indexOf(character);
		if (digit === -1) {
			throw new Error(
				`Context chunk isolation guard could not decode the source map for chunk ${chunkFileName}: invalid VLQ character ${JSON.stringify(character)}.`,
			);
		}
		state.index++;
		value += (digit & 31) << shift;
		if ((digit & 32) === 0) {
			break;
		}
		shift += 5;
		if (shift > 30) {
			throw new Error(
				`Context chunk isolation guard could not decode the source map for chunk ${chunkFileName}: VLQ field exceeds the supported 31-bit value range.`,
			);
		}
	}
	const sign = value & 1;
	return sign ? -(value >> 1) : value >> 1;
};

// Returns every mapping's original source position, keyed by nothing but the
// position itself: consumers attribute a segment to a module copy by matching
// the resolved source id and test the position against recorded mint spans.
// Per line, segments are comma-separated and each segment carries 1, 4 or 5
// (with names index) zig-zag VLQ fields; any other arity is malformed input.
//
// A segment with exactly one VLQ field is generated-only: by the source map
// specification it has *no* original source, so it is recorded as unmapped and
// never contributes an original position — the previous segment's origin is
// not carried forward for it. Every mapped segment carries its generated line
// and column as well, so consumers can tie it back to the emitted code.
export const decodeSourceMapSegments = (
	map: RawSourceMap,
	chunkFileName: string,
): DecodedSegment[] => {
	const segments: DecodedSegment[] = [];
	let sourceIndex = 0;
	let origLine = 0;
	let origCol = 0;
	let genLine = 0;
	for (const encodedLine of map.mappings.split(';')) {
		let genCol = 0;
		for (const rawSegment of encodedLine.split(',')) {
			if (rawSegment === '') {
				continue;
			}

			const fields: number[] = [];
			const state: VlqDecodeState = { index: 0 };
			while (state.index < rawSegment.length) {
				fields.push(readSourceMapVlq(rawSegment, state, chunkFileName));
			}

			if (![1, 4, 5].includes(fields.length)) {
				throw new Error(
					`Context chunk isolation guard could not decode the source map for chunk ${chunkFileName}: segment carries ${fields.length} VLQ fields.`,
				);
			}

			if (fields.length === 1) {
				genCol += fields[0] ?? 0;
				segments.push({ genCol, genLine, mapped: false });
				continue;
			}

			const [genColDelta, sourceIndexDelta, origLineDelta, origColDelta] =
				fields;
			genCol += genColDelta ?? 0;
			sourceIndex += sourceIndexDelta ?? 0;
			origLine += origLineDelta ?? 0;
			origCol += origColDelta ?? 0;
			if (sourceIndex < 0 || origLine < 0 || origCol < 0) {
				throw new Error(
					`Context chunk isolation guard could not decode the source map for chunk ${chunkFileName}: segment resolves to a negative original position.`,
				);
			}
			segments.push({
				genCol,
				genLine,
				mapped: true,
				origCol,
				origLine,
				sourceIndex,
			});
		}
		genLine++;
	}
	return segments;
};

// Resolves a chunk map's relative source id (relative to the chunk's own
// directory in the output tree) to the absolute module id used by
// chunk.modules. Internal Rolldown virtual ids are prefixed with a NUL byte
// and are not real modules; they yield no segment.
export const resolveRenderedMapSource = (
	mapSource: unknown,
	chunkDirectory: string,
): string | undefined => {
	if (
		typeof mapSource !== 'string' ||
		mapSource === '' ||
		mapSource.startsWith('\0')
	) {
		return undefined;
	}

	const resolved = path.isAbsolute(mapSource)
		? mapSource
		: path.resolve(chunkDirectory, mapSource);
	return path.normalize(resolved).replaceAll('\\', '/');
};

// A rendered segment matches a mint only when the bundler's own map places
// an emitted token strictly inside the recorded extent of the minting call,
// in the standard 0-based coordinates both the scan and the map use. The
// recorded span is the call's *argument-list* extent — the open paren through
// the close paren, as the parser computed it — so a segment here is an
// emitted call, not a token that happens to map into the callee's text. Only
// the argument-list extent can be emitted by the call and by nothing else:
// an emitted callee identifier (or a callee *reference* that maps into the
// callee, for example a mere property access on the minted value) would
// otherwise occupy an in-span position although no call was emitted.
export const renderedSegmentMatchesCallEmission = (
	segment: { origCol: number; origLine: number },
	span: SourceSpan,
): boolean => {
	if (segment.origLine < span.startLine || segment.origLine > span.endLine) {
		return false;
	}
	if (segment.origLine === span.startLine && segment.origCol <= span.startCol) {
		return false;
	}
	if (segment.origLine === span.endLine && segment.origCol >= span.endCol) {
		return false;
	}
	return true;
};

/** One recognized emitted-call extent in generated-code coordinates. */
export interface EmittedCallExtent {
	startCol: number;
	startLine: number;
	endCol: number;
	endLine: number;
}

interface TemplateState {
	depth: number;
}

interface OpenParenState {
	start: number;
	isCall: boolean;
}

type PreviousToken = string | undefined;

interface SourcePosition {
	col: number;
	line: number;
}

type CommentState = 'line' | 'block' | undefined;

// The generated code of a client chunk is minified JavaScript, and the map's
// generated positions refer to exactly that text. The chunks the guard
// consumes are the bundler's own output, so the scanner below deliberately
// tolerates whatever minified shape ships — including template literals that
// carry arbitrary string content (serializer payloads and the like).
//
// A call is recognized by its argument list: an open paren that directly
// follows an expression-ending token (an identifier, a literal, a keyword
// such as this/super/import, or a closing bracket, paren or brace) starts a
// call, and the matching close paren ends it. A function *declaration*'s
// parameter list is excluded (the paren follows the name of a `function`
// declaration), a parameter list whose close paren is directly followed by a
// body brace — a class or object-literal method (`method(value) {`, `get x()
// {`, `async m(v) {`) — is excluded the same way, and
// `if`/`for`/`while`/`switch`/`catch`/`with` parens are excluded because
// their leading keyword is not an expression end. Strings, comments, template
// literals (including `${…}` interpolation) and regex literals are skipped as
// opaque tokens so their contents never register as calls.
//
// The scan is a single bounded pass with no backtracking; a malformed or
// truncated construct (an unterminated string or template) simply terminates
// the scan at that point, and a truncated extent list only ever makes a copy
// *less* attributable — the fail-closed direction.
export const findEmittedCallExtents = (
	code: string,
): EmittedCallExtent[] => {
	const lineStarts: number[] = [];
	lineStarts.push(0);
	for (let index = 0; index < code.length; index++) {
		if (code[index] === '\n') {
			lineStarts.push(index + 1);
		}
	}
	const positionOf = (pos: number): SourcePosition => {
		let low = 0;
		let high = lineStarts.length - 1;
		while (low < high) {
			const mid = (low + high + 1) >> 1;
			if ((lineStarts[mid] ?? 0) <= pos) {
				low = mid;
			} else {
				high = mid - 1;
			}
		}
		return {
			col: pos - (lineStarts[low] ?? 0),
			line: low,
		};
	};

	const extents: EmittedCallExtent[] = [];
	const parenStack: OpenParenState[] = [];
	// Stack of open template literals; the top entry's `depth` is the nesting
	// depth of the `${ … }` interpolations currently open in it. A depth of 0
	// means the template's static text is being scanned (opaque); a depth
	// above 0 means the code inside an interpolation is being scanned.
	const templates: TemplateState[] = [];
	let regex = false;
	let comment: CommentState = undefined;
	// The last significant token: a word (identifier or keyword) or a single
	// symbol character. The scanner decides whether a `(` starts a call by
	// this token, not by the final character — a `(` after a control-flow or
	// grouping keyword (`if`, `for`, `function`, `return`, …) is a statement
	// or grouped-expression paren, never a call, while a `(` after a value
	// token (identifier, closing bracket, `?.`, …) is a call.
	let previousToken: PreviousToken = undefined;
	// True while the scanner is between a `function` keyword and the `(` of its
	// parameter list (across the function's name, if any); that `(` is a
	// parameter list, never a call.
	let functionNamePending = false;

	const isIdentifierStart = (character: string | undefined): boolean =>
		character !== undefined &&
		(/[A-Za-z_$]/.test(character) || character.charCodeAt(0) > 127);

	const isIdentifierPart = (character: string | undefined): boolean =>
		character !== undefined &&
		(/[A-Za-z0-9_$]/.test(character) || character.charCodeAt(0) > 127);

	// Keywords after which a `(` cannot be a call: statement/grouping parens
	// and expression keywords. `import` is a trailing-exception: `import('x')`
	// is a dynamic import (a call-like expression), while `import{n}from` is a
	// declaration whose `(` never follows the keyword directly.
	const NON_CALL_BEFORE_PAREN = new Set([
		'if',
		'for',
		'while',
		'switch',
		'catch',
		'with',
		'function',
		'return',
		'throw',
		'new',
		'delete',
		'void',
		'typeof',
		'do',
		'else',
		'case',
		'in',
		'of',
		'yield',
		'await',
		'instanceof',
		'let',
		'var',
		'const',
		'class',
		'extends',
		'default',
		'static',
		'get',
		'set',
		'async',
		'export',
	]);

	// Keywords after which a `/` starts a regular-expression literal rather
	// than a division: they expect an expression operand next.
	const REGEX_HINT_KEYWORDS = new Set([
		'return',
		'typeof',
		'instanceof',
		'in',
		'of',
		'new',
		'delete',
		'void',
		'throw',
		'yield',
		'await',
		'case',
		'do',
		'else',
	]);

	const isWordToken = (token: PreviousToken): boolean =>
		token !== undefined && /^[^\s()[\]{};:,.\-+*/%<>=!&|^~?]+$/.test(token);

	const expressionEnds = new Set([
		')',
		']',
		'}',
		'`',
		"'",
		'"',
		'?.',
		'++',
		'--',
	]);

	const endsExpression = (token: PreviousToken): boolean => {
		if (token === undefined) {
			return false;
		}
		if (expressionEnds.has(token)) {
			return true;
		}
		if (isWordToken(token)) {
			// A value word (identifier or literal) ends an expression; a
			// statement or grouping keyword after which a `(` can never be a
			// call (`if`, `for`, `function`, `return`, `new`, …) does not —
			// except the literal and `this`/`super`, which are values.
			if (NON_CALL_BEFORE_PAREN.has(token)) {
				return false;
			}
			return true;
		}
		// A number literal ends an expression.
		return /[0-9]/.test(token[0] ?? '');
	};

	const inTemplateText = (): boolean =>
		templates.length > 0 && (templates[templates.length - 1]?.depth ?? 1) === 0;

	const inInterpolation = (): boolean =>
		templates.length > 0 && (templates[templates.length - 1]?.depth ?? 0) > 0;

	for (let index = 0; index < code.length; index++) {
		const character = code[index];
		const next = code[index + 1];

		if (comment === 'line') {
			if (character === '\n' || character === '\r') {
				comment = undefined;
			}
			continue;
		}
		if (comment === 'block') {
			if (character === '*' && next === '/') {
				comment = undefined;
				index++;
			}
			continue;
		}

		if (regex) {
			if (character === '\\') {
				index++;
			} else if (
				character === '/' ||
				character === '\n' ||
				character === '\r'
			) {
				regex = false;
			}
			continue;
		}

		if (inTemplateText()) {
			if (character === '\\') {
				index++;
			} else if (character === '`') {
				templates.pop();
				previousToken = '`';
			} else if (character === '$' && next === '{') {
				const openTemplate = templates[templates.length - 1];
				if (openTemplate) {
					openTemplate.depth = 1;
				}
				index++;
			}
			continue;
		}

		if (character === "'" || character === '"') {
			const quote = character;
			index++;
			while (index < code.length) {
				if (code[index] === '\\') {
					index++;
				} else if (
					code[index] === quote ||
					code[index] === '\n' ||
					code[index] === '\r'
				) {
					break;
				}
				index++;
			}
			previousToken = quote;
			continue;
		}

		if (character === '`') {
			templates.push({ depth: 0 });
			previousToken = '`';
			continue;
		}

		if (character === '/' && next !== '/' && next !== '*') {
			const startsRegex =
				previousToken === undefined ||
				'([{;,=:!&|?+-*%^<>=~'.includes(previousToken) ||
				(previousToken !== undefined &&
					!endsExpression(previousToken) &&
					isWordToken(previousToken) &&
					REGEX_HINT_KEYWORDS.has(previousToken));
			if (startsRegex) {
				regex = true;
				continue;
			}
		}

		if (character === '/' && (next === '/' || next === '*')) {
			comment = next === '/' ? 'line' : 'block';
			index++;
			continue;
		}

		if (isIdentifierStart(character)) {
			let end = index + 1;
			while (end < code.length && isIdentifierPart(code[end])) {
				end++;
			}
			const word = code.slice(index, end);
			previousToken = word;
			// After the `function` keyword the next identifier is the function's
			// name; the `(` after it is the parameter list, never a call.
			if (word === 'function') {
				functionNamePending = true;
			}
			index = end - 1;
			continue;
		}

		if (character >= '0' && character <= '9') {
			let end = index + 1;
			while (
				end < code.length &&
				/[0-9]/.test(code[end] ?? '') &&
				code[end] !== '.'
			) {
				end++;
			}
			previousToken = code.slice(index, end);
			index = end - 1;
			continue;
		}

		if (character === '?' && next === '.') {
			previousToken = '?.';
			index++;
			continue;
		}

		if (character === '(') {
			// The parameter list of a `function` declaration/expression, or
			// a `(` directly after a statement or grouping keyword, is never
			// a call; `import(` is a dynamic import (a call-like expression).
			const isFunctionParameterList = functionNamePending;
			functionNamePending = false;
			parenStack.push({
				start: index,
				isCall: !isFunctionParameterList && endsExpression(previousToken),
			});
			previousToken = '(';
			continue;
		}

		if (character === ')') {
			const open = parenStack.pop();
			if (open && open.isCall && parenStack.length === 0) {
				// A parameter list whose close paren is followed by a body
				// brace — `method(value) {`, `get x() {` — is a method
				// declaration, not a call. An expression statement followed
				// by a block (`f()\n{ … }`) is only reachable through
				// automatic semicolon insertion, which minifiers do not
				// emit; and excluding a brace-followed extent only removes
				// ties, which can only reduce attributability in the
				// fail-closed direction, never mint a pass.
				let after = index + 1;
				while (
					after < code.length &&
					(code[after] === ' ' ||
						code[after] === '\t' ||
						code[after] === '\r' ||
						code[after] === '\n')
				) {
					after++;
				}
				if (code[after] !== '{') {
					const startPosition = positionOf(open.start);
					const endPosition = positionOf(index + 1);
					extents.push({
						endCol: endPosition.col,
						endLine: endPosition.line,
						startCol: startPosition.col,
						startLine: startPosition.line,
					});
				}
			}
			previousToken = ')';
			continue;
		}

		if (inInterpolation()) {
			const template = templates[templates.length - 1];
			if (template) {
				if (character === '{') {
					template.depth++;
					previousToken = '{';
					continue;
				}
				if (character === '}') {
					template.depth--;
					if (template.depth === 0) {
						previousToken = '}';
					}
					continue;
				}
			}
		}

		if (!/\s/.test(character ?? '')) {
			previousToken = character;
			// A `function` keyword is only a parameter-list opener when the
			// `(` follows directly (after the name); any other intermediate
			// token breaks the declaration, so clear the pending flag.
			if (character !== '(') {
				functionNamePending = false;
			}
		}
	}

	return extents;
};

// Whether a segment's generated position lies strictly inside the argument
// list of an emitted call — the token range only a call's own execution
// occupies.
const segmentInsideEmittedCall = (
	segment: { genCol: number; genLine: number },
	extents: readonly EmittedCallExtent[],
): boolean => {
	for (const extent of extents) {
		if (
			segment.genLine > extent.startLine ||
			(segment.genLine === extent.startLine && segment.genCol > extent.startCol)
		) {
			if (
				segment.genLine < extent.endLine ||
				(segment.genLine === extent.endLine && segment.genCol < extent.endCol)
			) {
				return true;
			}
		}
	}
	return false;
};

// The span key identifies a mint span across the module's contexts, so the
// guard can tell which context a copy's tied segment belongs to.
export const spanKeyOf = (span: SourceSpan): string =>
	`${span.startLine}:${span.startCol}:${span.endLine}:${span.endCol}`;

/** The facts the classifier returns about one delivered copy of a module. */
export interface CopyAttribution {
	precise: boolean;
	tiedSpanKeys: Set<string>;
}

// Classifies one delivered copy of a context source module against the map
// the chunk carries and the copy's own rendered code. `segments` are the
// copy's resolved segments (the map's source id resolved to the copy's module
// id); `allMintSpans` are the recorded argument-list extents of every minting
// call in the module (across all its contexts); `emittedCallExtents` are the
// argument-list extents parsed from the chunk's generated code, or undefined
// when the chunk carries no generated code to parse against.
//
// The mint question is "did this copy, at this generated call, mint this
// context". A copy MINTED at a context when a single segment ties a generated
// call to that context's mint span — the same segment inside an emitted call
// and inside the span. The copy's map facts are returned once: `precise` (the
// map resolves the copy to distinct original positions) and `tiedSpanKeys` (the
// set of mint spans, across all the module's contexts, that some segment ties
// to). The caller decides each context's verdict from these facts, so a copy
// whose mint calls are all explained by other contexts' spans is verifiably
// non-minting for the remaining ones, while a copy that ties to no span at all
// is unverifiable (fail closed) rather than silently non-minting.
export const classifyCopyAttribution = (
	segments: readonly {
		origCol: number;
		origLine: number;
		genCol: number;
		genLine: number;
	}[],
	allMintSpans: readonly SourceSpan[],
	emittedCallExtents: readonly EmittedCallExtent[] | undefined,
): CopyAttribution => {
	const copyPositions = new Set(
		segments.map((segment) => `${segment.origLine}:${segment.origCol}`),
	);
	const precise = copyPositions.size >= 2;
	const tiedSpanKeys = new Set<string>();
	for (const segment of segments) {
		if (
			emittedCallExtents !== undefined &&
			!segmentInsideEmittedCall(segment, emittedCallExtents)
		) {
			continue;
		}
		for (const span of allMintSpans) {
			if (renderedSegmentMatchesCallEmission(segment, span)) {
				tiedSpanKeys.add(spanKeyOf(span));
			}
		}
	}
	return { precise, tiedSpanKeys };
};
