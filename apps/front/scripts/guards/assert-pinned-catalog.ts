/**
 * Pure reader for the flat default `catalog:` block of `pnpm-workspace.yaml`.
 *
 * `assert-pinned.ts` runs as front's `preinstall`, before any dependency
 * exists, so the catalog cannot be read with the `yaml` package — the hand
 * scanner stays (#2326, review E1/M1e: it must not mis-read valid YAML).
 *
 * Scope: the flat default catalog only (no named `catalogs:`) — the shape
 * this repo uses. Correct on valid YAML for that block:
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

/** Parse the flat default `catalog:` block; throw on any unknown shape. */
export const parseCatalog = (workspaceYaml: string): Map<string, string> => {
	const catalog = new Map<string, string>();
	let inCatalog = false;

	for (const rawLine of workspaceYaml.split('\n')) {
		const line = rawLine.trimEnd();
		if (!inCatalog) {
			if (/^catalog:\s*$/.test(line)) {
				inCatalog = true;
			}
			continue;
		}
		const trimmed = line.trim();
		// Blank lines and comment lines (at any indent) never close the block.
		if (trimmed === '' || trimmed.startsWith('#')) {
			continue;
		}
		// Only a non-indented, non-comment line (a new top-level key) closes it.
		if (!/^\s/.test(line)) {
			inCatalog = false;
			continue;
		}
		const entry = /^\s+(?:"([^"]+)"|'([^']+)'|([^:\s][^:]*))\s*:\s*(.+)$/.exec(
			line,
		);
		if (entry === null) {
			throw new Error(`pnpm-workspace.yaml: unknown catalog line: ${line}`);
		}
		const name = (entry[1] ?? entry[2] ?? entry[3]).trim();
		catalog.set(name, readValue(entry[4]));
	}
	return catalog;
};
