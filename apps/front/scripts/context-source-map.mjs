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

const SOURCE_MAP_BASE64 =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// The decode is bounded: every character must be in the base64 alphabet, every
// field must terminate (continuation bit cleared) before the input ends, and
// no field may exceed the 31-bit value range of the standard encoding.
// Malformed input throws a named guard error — it never hangs and never
// silently mis-reads.
export const readSourceMapVlq = (encoded, state, chunkFileName) => {
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
export const decodeSourceMapSegments = (map, chunkFileName) => {
	const segments = [];
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

			const fields = [];
			const state = { index: 0 };
			while (state.index < rawSegment.length) {
				fields.push(readSourceMapVlq(rawSegment, state, chunkFileName));
			}

			if (![1, 4, 5].includes(fields.length)) {
				throw new Error(
					`Context chunk isolation guard could not decode the source map for chunk ${chunkFileName}: segment carries ${fields.length} VLQ fields.`,
				);
			}

			if (fields.length === 1) {
				genCol += fields[0];
				segments.push({ genCol, genLine, mapped: false });
				continue;
			}

			const [genColDelta, sourceIndexDelta, origLineDelta, origColDelta] =
				fields;
			genCol += genColDelta;
			sourceIndex += sourceIndexDelta;
			origLine += origLineDelta;
			origCol += origColDelta;
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
export const resolveRenderedMapSource = (mapSource, chunkDirectory) => {
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
// call's first token — the callee at the span start — is excluded: bundlers
// map an emitted callee identifier to its import position, and a callee
// *reference* emitted without the call would occupy the same in-span start
// position as the call itself. Only the argument-list extent (the open
// paren, arguments, close paren) can be emitted by the call and by nothing
// else, so a segment there is an emitted call, not a token that happens to
// map into the span.
export const renderedSegmentMatchesCallEmission = (segment, span) => {
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
// declaration), and `if`/`for`/`while`/`switch`/`catch`/`with` parens are
// excluded because their leading keyword is not an expression end. Strings,
// comments, template literals (including `${…}` interpolation) and regex
// literals are skipped as opaque tokens so their contents never register as
// calls.
//
// The scan is a single bounded pass with no backtracking; a malformed or
// truncated construct (an unterminated string or template) simply terminates
// the scan at that point, and a truncated extent list only ever makes a copy
// *less* attributable — the fail-closed direction.
export const findEmittedCallExtents = (code) => {
	const lineStarts = [];
	lineStarts.push(0);
	for (let index = 0; index < code.length; index++) {
		if (code[index] === '\n') {
			lineStarts.push(index + 1);
		}
	}
	const positionOf = (pos) => {
		let low = 0;
		let high = lineStarts.length - 1;
		while (low < high) {
			const mid = (low + high + 1) >> 1;
			if (lineStarts[mid] <= pos) {
				low = mid;
			} else {
				high = mid - 1;
			}
		}
		return { col: pos - lineStarts[low], line: low };
	};

	const extents = [];
	const parenStack = [];
	// Stack of open template literals; the top entry's `depth` is the nesting
	// depth of the `${ … }` interpolations currently open in it. A depth of 0
	// means the template's static text is being scanned (opaque); a depth
	// above 0 means the code inside an interpolation is being scanned.
	const templates = [];
	let regex = false;
	let comment = undefined;
	let previousSignificant = undefined;

	const isIdentifierPart = (character) =>
		character !== undefined &&
		(/[A-Za-z0-9_$]/.test(character) || character.charCodeAt(0) > 127);

	const isExpressionEnd = (character) =>
		character !== undefined &&
		(isIdentifierPart(character) ||
			character === ')' ||
			character === ']' ||
			character === '}' ||
			character === '`');

	const inTemplateText = () =>
		templates.length > 0 && templates[templates.length - 1].depth === 0;

	const inInterpolation = () =>
		templates.length > 0 && templates[templates.length - 1].depth > 0;

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
				previousSignificant = '`';
			} else if (character === '$' && next === '{') {
				templates[templates.length - 1].depth = 1;
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
			previousSignificant = quote;
			continue;
		}

		if (character === '`') {
			templates.push({ depth: 0 });
			previousSignificant = '`';
			continue;
		}

		if (character === '/') {
			if (next === '/') {
				comment = 'line';
				index++;
				continue;
			}
			if (next === '*') {
				comment = 'block';
				index++;
				continue;
			}
			if (
				previousSignificant === undefined ||
				'([{;,=:!&|?+-*%^<>=~'.includes(previousSignificant)
			) {
				regex = true;
				continue;
			}
		}

		if (character === '(') {
			parenStack.push({
				start: index,
				isCall: isExpressionEnd(previousSignificant),
			});
			previousSignificant = '(';
			continue;
		}

		if (character === ')') {
			const open = parenStack.pop();
			if (open && open.isCall && parenStack.length === 0) {
				const startPosition = positionOf(open.start);
				const endPosition = positionOf(index + 1);
				extents.push({
					endCol: endPosition.col,
					endLine: endPosition.line,
					startCol: startPosition.col,
					startLine: startPosition.line,
				});
			}
			previousSignificant = ')';
			continue;
		}

		if (inInterpolation()) {
			const template = templates[templates.length - 1];
			if (character === '{') {
				template.depth++;
				previousSignificant = '{';
				continue;
			}
			if (character === '}') {
				template.depth--;
				if (template.depth === 0) {
					previousSignificant = '}';
				}
				continue;
			}
		}

		if (!/\s/.test(character)) {
			previousSignificant = character;
		}
	}

	return extents;
};

// Whether a segment's generated position lies strictly inside the argument
// list of an emitted call — the token range only a call's own execution
// occupies.
const segmentInsideEmittedCall = (segment, extents) => {
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

// Classifies one delivered copy of a context source module against the map
// the chunk carries. `segments` are the copy's own resolved segments (the
// map's source id resolved to the copy's module id); `mintSpans` are the
// recorded extents of the context's minting calls; `emittedCallExtents` are
// the argument-list extents parsed from the chunk's generated code, or
// undefined when the chunk carries no generated code to parse against.
//
// A copy is attributable when the map is precise — it resolves the copy to
// distinct original positions, so a map that collapses the copy onto a single
// anchor cannot answer — and, when the chunk's code is available, when the
// map ties at least one of its positions to a call the copy actually emits:
// an emitted mint call whose tokens the map never touches means the map does
// not describe this copy, so the copy cannot be trusted as non-minting. A
// copy is minting when an attributable segment lies strictly inside a
// recorded mint span.
export const classifyCopyAttribution = (
	segments,
	mintSpans,
	emittedCallExtents,
) => {
	const copyPositions = new Set(
		segments.map((segment) => `${segment.origLine}:${segment.origCol}`),
	);
	const precise = copyPositions.size >= 2;
	const attributedToEmittedCall =
		emittedCallExtents === undefined ||
		segments.some((segment) =>
			segmentInsideEmittedCall(segment, emittedCallExtents),
		);
	const attributable = precise && attributedToEmittedCall;
	const minted =
		attributable &&
		segments.some((segment) =>
			mintSpans.some((span) =>
				renderedSegmentMatchesCallEmission(segment, span),
			),
		);
	return { attributable, minted };
};
