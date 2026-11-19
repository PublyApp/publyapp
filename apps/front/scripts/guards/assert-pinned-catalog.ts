/**
 * Pure reader for the flat default `catalog:` block of `pnpm-workspace.yaml`.
 *
 * `assert-pinned.ts` runs as front's `preinstall`, before any dependency
 * exists, so the catalog cannot be read with the `yaml` package — the hand
 * scanner stays (#2326, review E1/M1e: it must not mis-read valid YAML).
 *
 * Scope: the default `catalog:` block and named `catalogs:` blocks (#2447),
 * one level of nesting. Correct on valid YAML for that block:
 *   - an inline ` # comment` after a value;
 *   - single/double-quoted names and values;
 *   - indented comment lines and blank lines (neither closes the block);
 *   - the block ends ONLY at the next non-indented, non-comment line.
 * Any other indented line that is not `name: value` is an unknown shape and
 * throws — the guard fails loud instead of silently dropping entries.
 */

/** Read the value side of `name: value`: strip quotes and an inline comment. */
const readValue = (raw: string): string => {
	const rest = raw.trim();
	const quoted = /^"([^"]*)"|^'([^']*)'/.exec(rest);
	if (quoted !== null) {
		const value = quoted[1] ?? quoted[2];
		// Only an inline comment may follow a quoted scalar; anything else is
		// a shape this reader does not understand.
		const tail = rest.slice(quoted[0].length).trim();
		if (value === '' || (tail !== '' && !tail.startsWith('#'))) {
			throw new Error(`pnpm-workspace.yaml: unknown catalog value: ${raw}`);
		}
		return value;
	}
	// A YAML comment starts at `#` preceded by whitespace (or line start).
	const value = rest.replace(/\s+#.*$/, '').trim();
	if (value === '') {
		throw new Error(`pnpm-workspace.yaml: empty catalog value: ${raw}`);
	}
	return value;
};

const ENTRY = /^\s+(?:"([^"]+)"|'([^']+)'|([^:\s][^:]*))\s*:\s*(.+)$/;

/**
 * Parse the default `catalog:` block AND the named `catalogs:` blocks
 * (#2447) into `catalogName -> (dependency -> version)`; the default one is
 * keyed `''`. Throws on any unknown shape.
 */
export const parseCatalogs = (
	workspaceYaml: string,
): Map<string, Map<string, string>> => {
	const catalogs = new Map<string, Map<string, string>>();
	let current: Map<string, string> | null = null;
	let inNamed = false;

	for (const rawLine of workspaceYaml.split('\n')) {
		const line = rawLine.trimEnd();
		const trimmed = line.trim();
		// Blank lines and comment lines (at any indent) never close a block.
		if (trimmed === '' || trimmed.startsWith('#')) {
			continue;
		}
		// Only a non-indented, non-comment line (a top-level key) closes a block.
		if (!/^\s/.test(line)) {
			inNamed = /^catalogs:\s*$/.test(line);
			current = null;
			if (/^catalog:\s*$/.test(line)) {
				current = new Map();
				catalogs.set('', current);
			}
			continue;
		}
		if (current === null && !inNamed) {
			continue;
		}
		// Inside `catalogs:`, a 2-space `name:` line opens a named catalog.
		const header = inNamed
			? /^ {2}(?:"([^"]+)"|'([^']+)'|([^\s:#]+)):\s*$/.exec(line)
			: null;
		if (header !== null) {
			current = new Map();
			catalogs.set(header[1] ?? header[2] ?? header[3], current);
			continue;
		}
		const entry = current === null ? null : ENTRY.exec(line);
		if (current === null || entry === null) {
			throw new Error(`pnpm-workspace.yaml: unknown catalog line: ${line}`);
		}
		const name = (entry[1] ?? entry[2] ?? entry[3]).trim();
		current.set(name, readValue(entry[4]));
	}
	return catalogs;
};

/** The flat default `catalog:` block only. */
export const parseCatalog = (workspaceYaml: string): Map<string, string> =>
	parseCatalogs(workspaceYaml).get('') ?? new Map();
