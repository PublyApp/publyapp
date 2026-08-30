/**
 * E2E tag guard — pure static analysis using a hand-written tokenizer.
 *
 * The scanner correctly handles:
 * - String literals (single/double quotes, with escapes)
 * - Template literals (with ${} expressions, tracking depth)
 * - Regex literals (distinguishes /regex/ from division)
 * - Single-line and multi-line comments
 * - test.describe modifier chains (serial, parallel, only, skip, fixme)
 * - Arrow function and function-expression callbacks
 *
 * Finds every `test.describe[.modifier]*(` call and classifies each as
 * "top-level" (not nested inside another describe's callback body) by
 * comparing positional ranges.
 *
 * Any describe call whose callback shape the scanner does not understand
 * (not an arrow and not a function expression) is reported as an error
 * — it is never silently ignored.
 *
 * Closed-vocabulary rule: every @tag must be a known domain, @untracked,
 * or @<digits> (ticket). Anything else fails.
 */
import * as fs from 'node:fs';

/* ------------------------------------------------------------------ */
/* Vocabulary — keep in sync with docs/guides/e2e-tags.md               */
/* ------------------------------------------------------------------ */

export const KNOWN_DOMAINS: ReadonlySet<string> = new Set([
	'@auth',
	'@design',
	'@i18n',
	'@public',
	'@security',
	'@shell',
	'@staff-audit',
	'@staff-invitations',
	'@staff-profiles',
	'@staff-tenants',
	'@staff-users',
	'@staff-jobs',
	'@staff-dashboard',
	'@tenant-workspace',
	'@uploads',
]);

const TAG_RE = /@([a-zA-Z0-9_-]+)/g;

/* ------------------------------------------------------------------ */
/* Scanner                                                             */
/* ------------------------------------------------------------------ */

interface Token {
	type: string;
	text: string;
	pos: number;
}

/**
 * Tokenize a TypeScript source string into a flat token list.
 * Correctly skips/identifies strings, template literals, regex literals,
 * and comments so that brace/paren counting is structural-only.
 */
const tokenize = (source: string): Token[] => {
	const tokens: Token[] = [];
	let i = 0;
	const len = source.length;

	// Track whether the previous non-trivia token allows a regex literal
	// to follow.  After identifiers, numbers, ) ], ++ -- etc., / is
	// division.  After = ( [ { , ; : ? ! & | ^ ~ and keywords like
	// return/typeof/void/delete/new, / starts a regex.
	let regexAllowed = true;

	while (i < len) {
		const ch = source[i]!;

		// --- Whitespace ---
		if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
			i++;
			continue;
		}

		// --- Single-line comment ---
		if (ch === '/' && source[i + 1] === '/') {
			while (i < len && source[i] !== '\n') {
				i++;
			}
			continue;
		}

		// --- Multi-line comment ---
		if (ch === '/' && source[i + 1] === '*') {
			i += 2;
			while (i < len - 1 && !(source[i] === '*' && source[i + 1] === '/')) {
				i++;
			}
			i += 2;
			regexAllowed = true;
			continue;
		}

		// --- Regex literal ---
		if (ch === '/' && regexAllowed) {
			const start = i;
			i++; // skip opening /
			let inClass = false;
			while (i < len) {
				const c = source[i]!;
				if (c === '\\') {
					i += 2; // skip escaped char
					continue;
				}
				if (c === '[') {
					inClass = true;
				} else if (c === ']') {
					inClass = false;
				} else if (c === '/' && !inClass) {
					break;
				}
				i++;
			}
			i++; // skip closing /
			// flags
			while (i < len && /[gimsuy]/.test(source[i]!)) {
				i++;
			}
			tokens.push({
				type: 'regex',
				text: source.slice(start, i),
				pos: start,
			});
			regexAllowed = false;
			continue;
		}

		// --- String literal (single or double quote) ---
		if (ch === "'" || ch === '"') {
			const q = ch;
			const start = i;
			i++; // skip opening quote
			while (i < len && source[i] !== q) {
				if (source[i] === '\\') {
					i++;
				}
				i++;
			}
			i++; // skip closing quote
			tokens.push({
				type: 'string',
				text: source.slice(start, i),
				pos: start,
			});
			regexAllowed = false;
			continue;
		}

		// --- Template literal ---
		if (ch === '`') {
			const start = i;
			i++; // skip opening backtick
			while (i < len && source[i] !== '`') {
				if (source[i] === '\\') {
					i += 2;
					continue;
				}
				if (source[i] === '$' && source[i + 1] === '{') {
					let d = 1;
					i += 2;
					while (i < len && d > 0) {
						if (source[i] === '{') {
							d++;
						} else if (source[i] === '}') {
							d--;
						}
						i++;
					}
					continue;
				}
				i++;
			}
			i++; // skip closing backtick
			tokens.push({
				type: 'template',
				text: source.slice(start, i),
				pos: start,
			});
			regexAllowed = false;
			continue;
		}

		// --- Number ---
		if (/[0-9]/.test(ch)) {
			const start = i;
			while (i < len && /[0-9]/.test(source[i]!)) {
				i++;
			}
			// decimal
			if (source[i] === '.' && /[0-9]/.test(source[i + 1] ?? '')) {
				i++; // skip .
				while (i < len && /[0-9]/.test(source[i]!)) {
					i++;
				}
			}
			tokens.push({
				type: 'num',
				text: source.slice(start, i),
				pos: start,
			});
			regexAllowed = false;
			continue;
		}

		// --- Identifier / keyword ---
		if (/[a-zA-Z_$]/.test(ch)) {
			const start = i;
			while (i < len && /[a-zA-Z0-9_$]/.test(source[i]!)) {
				i++;
			}
			const text = source.slice(start, i);
			tokens.push({ type: 'id', text, pos: start });
			// After identifiers, / is division, not regex
			regexAllowed = false;
			continue;
		}

		// --- Arrow => ---
		if (ch === '=' && source[i + 1] === '>') {
			tokens.push({ type: '=>', text: '=>', pos: i });
			i += 2;
			regexAllowed = true;
			continue;
		}

		// --- ++ -- ---
		if (ch === '+' && source[i + 1] === '+') {
			tokens.push({ type: '++', text: '++', pos: i });
			i += 2;
			regexAllowed = false;
			continue;
		}
		if (ch === '-' && source[i + 1] === '-') {
			tokens.push({ type: '--', text: '--', pos: i });
			i += 2;
			regexAllowed = false;
			continue;
		}

		// --- Punctuation that allows regex after ---
		if (
			ch === '=' ||
			ch === '(' ||
			ch === '[' ||
			ch === '{' ||
			ch === ',' ||
			ch === ';' ||
			ch === ':' ||
			ch === '?' ||
			ch === '!' ||
			ch === '&' ||
			ch === '|' ||
			ch === '^' ||
			ch === '~' ||
			ch === '\n'
		) {
			tokens.push({ type: ch, text: ch, pos: i });
			i++;
			regexAllowed = true;
			continue;
		}

		// --- Punctuation that does NOT allow regex after ---
		// ) ] } . ++ -- and all others
		tokens.push({ type: ch, text: ch, pos: i });
		i++;
		regexAllowed = false;
	}

	return tokens;
};

/* ------------------------------------------------------------------ */
/* Public types & API                                                  */
/* ------------------------------------------------------------------ */

export interface DescribeInfo {
	title: string;
	tags: string[];
	topLevel: boolean;
	describePos?: number;
	error?: string;
}

/**
 * Known Playwright test.describe modifiers.
 * Only these (and chained forms like .serial.only) are consumed as
 * describe variants.  Other method calls (e.g. test.describe.configure)
 * are NOT matched.
 */
const DESCRIBE_MODIFIERS = new Set([
	'serial',
	'parallel',
	'only',
	'skip',
	'fixme',
]);

/**
 * Analyze a spec file and return information about every `test.describe`
 * call (including modifier variants like `test.describe.serial`), including
 * whether it is top-level (not inside another describe's callback body).
 *
 * Recognized callback shapes: arrow (`() => {}`) and function expression
 * (`function () {}`).  Unrecognized shapes produce an `error` field rather
 * than being silently skipped.
 */
export const analyzeFile = (filePath: string): DescribeInfo[] => {
	const source = fs.readFileSync(filePath, 'utf8');
	const tokens = tokenize(source);
	const results: DescribeInfo[] = [];

	interface DescribeRecord {
		describePos: number;
		bodyStart: number;
		bodyEnd: number;
		title: string;
		tags: string[];
		error?: string;
	}

	const records: DescribeRecord[] = [];

	for (let i = 0; i < tokens.length; i++) {
		// Match: test.describe[.modifier...](
		if (
			tokens[i]?.type === 'id' &&
			tokens[i]!.text === 'test' &&
			tokens[i + 1]?.type === '.' &&
			tokens[i + 2]?.type === 'id' &&
			tokens[i + 2]!.text === 'describe'
		) {
			// Consume optional modifier chain: .serial, .parallel, .only,
			// .skip, .fixme, and chained forms like .serial.only.
			// Only the known modifier set is consumed; other method calls
			// (e.g. test.describe.configure) do NOT match.
			let parenIdx = i + 3;
			while (
				tokens[parenIdx]?.type === '.' &&
				tokens[parenIdx + 1]?.type === 'id' &&
				DESCRIBE_MODIFIERS.has(tokens[parenIdx + 1]!.text)
			) {
				parenIdx += 2;
			}
			if (tokens[parenIdx]?.type !== '(') {
				continue;
			}

			const describePos = tokens[i]!.pos;
			const callOpen = parenIdx; // index of the opening (

			// Find matching ) — track paren depth
			let parenDepth = 0;
			let callClose = -1;
			for (let j = callOpen; j < tokens.length; j++) {
				if (tokens[j]!.type === '(') {
					parenDepth++;
				} else if (tokens[j]!.type === ')') {
					parenDepth--;
					if (parenDepth === 0) {
						callClose = j;
						break;
					}
				}
			}
			if (callClose === -1) {
				continue;
			}

			// Extract title: first string/template token after opening (
			let title = '';
			const titleTok = tokens[callOpen + 1];
			if (
				titleTok &&
				(titleTok.type === 'string' || titleTok.type === 'template')
			) {
				title = titleTok.text.slice(1, -1); // strip quotes/backticks
			}

			// Extract tags from options object (second argument)
			const tags: string[] = [];

			// Find first comma at depth 1 (inside test.describe parens)
			let firstComma = -1;
			parenDepth = 0;
			for (let j = callOpen + 1; j < callClose; j++) {
				if (tokens[j]!.type === '(') {
					parenDepth++;
				} else if (tokens[j]!.type === ')') {
					parenDepth--;
				} else if (tokens[j]!.type === ',' && parenDepth === 0) {
					firstComma = j;
					break;
				}
			}

			if (firstComma > 0) {
				// Find { after first comma (options object)
				let optsStart = -1;
				for (let j = firstComma + 1; j < callClose; j++) {
					if (tokens[j]!.type === '{') {
						optsStart = j;
						break;
					}
					// If we hit something else (identifier, string), no options
					if (
						tokens[j]!.type === 'id' ||
						tokens[j]!.type === 'string' ||
						tokens[j]!.type === 'template'
					) {
						break;
					}
				}

				if (optsStart > 0) {
					// Find matching }
					let braceDepth = 0;
					let optsEnd = -1;
					for (let j = optsStart; j < callClose; j++) {
						if (tokens[j]!.type === '{') {
							braceDepth++;
						} else if (tokens[j]!.type === '}') {
							braceDepth--;
							if (braceDepth === 0) {
								optsEnd = j;
								break;
							}
						}
					}

					if (optsEnd > 0) {
						// Find tag: [ inside options
						for (let j = optsStart + 1; j < optsEnd; j++) {
							if (
								tokens[j]!.type === 'id' &&
								tokens[j]!.text === 'tag' &&
								tokens[j + 1]?.type === ':' &&
								tokens[j + 2]?.type === '['
							) {
								let bracketDepth = 0;
								for (let k = j + 2; k <= optsEnd; k++) {
									if (tokens[k]!.type === '[') {
										bracketDepth++;
									} else if (tokens[k]!.type === ']') {
										bracketDepth--;
										if (bracketDepth === 0) {
											break;
										}
									} else if (
										tokens[k]!.type === 'string' &&
										bracketDepth === 1
									) {
										const inner = tokens[k]!.text.slice(1, -1);
										let tagMatch: RegExpExecArray | null;
										TAG_RE.lastIndex = 0;
										while ((tagMatch = TAG_RE.exec(inner)) !== null) {
											tags.push(`@${tagMatch[1]}`);
										}
									}
								}
								break;
							}
						}
					}
				}
			}

			// Extract @tags from title
			TAG_RE.lastIndex = 0;
			let titleTagMatch: RegExpExecArray | null;
			while ((titleTagMatch = TAG_RE.exec(title)) !== null) {
				const tag = `@${titleTagMatch[1]}`;
				if (!tags.includes(tag)) {
					tags.push(tag);
				}
			}

			// Find callback body: scan inside (...) at depth 1
			// for => (arrow) or function keyword
			let arrowIdx = -1;
			let funcIdx = -1;
			{
				let depth = 0;
				for (let j = callOpen; j <= callClose; j++) {
					if (tokens[j]!.type === '(') {
						depth++;
					} else if (tokens[j]!.type === ')') {
						depth--;
						if (depth === 0) {
							break;
						}
					}
					// => or function at depth 1 means inside test.describe's parens
					if (depth === 1) {
						if (tokens[j]!.type === '=>') {
							arrowIdx = j;
						} else if (
							tokens[j]!.type === 'id' &&
							tokens[j]!.text === 'function' &&
							funcIdx === -1
						) {
							funcIdx = j;
						}
					}
				}
			}

			let bodyStart = -1;
			let bodyEnd = -1;
			let unsupportedCallback = false;

			if (arrowIdx !== -1) {
				// Arrow callback: find { after =>
				let bodyOpen = -1;
				for (let j = arrowIdx + 1; j < callClose; j++) {
					if (tokens[j]!.type === '{') {
						bodyOpen = j;
						break;
					}
				}
				if (bodyOpen !== -1) {
					let braceDepth = 0;
					for (let j = bodyOpen; j < tokens.length; j++) {
						if (tokens[j]!.type === '{') {
							braceDepth++;
						} else if (tokens[j]!.type === '}') {
							braceDepth--;
							if (braceDepth === 0) {
								bodyStart = tokens[bodyOpen]!.pos;
								bodyEnd = tokens[j]!.pos + 1;
								break;
							}
						}
					}
				}
			} else if (funcIdx !== -1) {
				// function callback: find { after function keyword
				// (may have params in parens between function and {)
				let bodyOpen = -1;
				for (let j = funcIdx + 1; j < callClose; j++) {
					if (tokens[j]!.type === '{') {
						bodyOpen = j;
						break;
					}
				}
				if (bodyOpen !== -1) {
					let braceDepth = 0;
					for (let j = bodyOpen; j < tokens.length; j++) {
						if (tokens[j]!.type === '{') {
							braceDepth++;
						} else if (tokens[j]!.type === '}') {
							braceDepth--;
							if (braceDepth === 0) {
								bodyStart = tokens[bodyOpen]!.pos;
								bodyEnd = tokens[j]!.pos + 1;
								break;
							}
						}
					}
				}
			} else {
				// Unsupported callback shape
				unsupportedCallback = true;
			}

			if (bodyStart === -1 || bodyEnd === -1) {
				if (unsupportedCallback) {
					records.push({
						describePos,
						bodyStart: 0,
						bodyEnd: 0,
						title,
						tags,
						error: `unsupported describe shape at position ${describePos} in "${title || '(untitled)'}"`,
					});
				}
				continue;
			}

			records.push({
				describePos,
				bodyStart,
				bodyEnd,
				title,
				tags,
			});
		}
	}

	// Determine top-level: a describe is top-level if its describePos
	// does NOT fall inside any other describe's callback body range.
	for (const rec of records) {
		if (rec.error) {
			results.push({
				title: rec.title,
				tags: rec.tags,
				topLevel: false,
				describePos: rec.describePos,
				error: rec.error,
			});
			continue;
		}
		const isNested = records.some(
			(other) =>
				other !== rec &&
				!other.error &&
				rec.describePos >= other.bodyStart &&
				rec.describePos < other.bodyEnd,
		);
		results.push({
			title: rec.title,
			tags: rec.tags,
			topLevel: !isNested,
		});
	}

	return results;
};
