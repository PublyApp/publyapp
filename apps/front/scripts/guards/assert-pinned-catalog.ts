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

const NAME = String.raw`(?:"([^"]+)"|'([^']+)'|([^:\s#][^:\s]*))`;
const ENTRY = new RegExp(String.raw`^\s+${NAME}\s*:\s*(\S.*)$`);
// A `name:` line with no value (optional trailing comment) opens a block.
const HEADER = new RegExp(String.raw`^\s+${NAME}\s*:\s*(?:#.*)?$`);
const TOP_KEY = /^(catalogs?):\s*(?:#.*)?$/;

type Catalogs = Map<string, Map<string, string>>;

const nameOf = (m: RegExpExecArray): string => (m[1] ?? m[2] ?? m[3]).trim();

const addEntry = (current: Map<string, string> | null, line: string): void => {
	const entry = ENTRY.exec(line);
	if (current === null || entry === null) {
		throw new Error(`pnpm-workspace.yaml: unknown catalog line: ${line}`);
	}
	current.set(nameOf(entry), readValue(entry[4]));
};

/**
 * Parse the default `catalog:` block AND the named `catalogs:` blocks
 * (#2447) into `catalogName -> (dependency -> version)`; the default one is
 * keyed `''`. Any indentation width and trailing comments are accepted;
 * throws on any unknown shape.
 */
export const parseCatalogs = (workspaceYaml: string): Catalogs => {
	const catalogs: Catalogs = new Map();
	let current: Map<string, string> | null = null;
	let section: string | null = null;

	for (const rawLine of workspaceYaml.split('\n')) {
		const line = rawLine.trimEnd();
		const trimmed = line.trim();
		// Blank lines and comment lines (at any indent) never close a block.
		if (trimmed === '' || trimmed.startsWith('#')) {
			continue;
		}
		// Only a non-indented, non-comment line (a top-level key) closes a block.
		if (!/^\s/.test(line)) {
			section = TOP_KEY.exec(line)?.[1] ?? null;
			current = null;
			if (section === 'catalog') {
				current = new Map();
				catalogs.set('', current);
			}
			continue;
		}
		const header = section === 'catalogs' ? HEADER.exec(line) : null;
		if (header !== null) {
			current = new Map();
			catalogs.set(nameOf(header), current);
		} else if (section !== null) {
			addEntry(current, line);
		}
	}
	return catalogs;
};

/** The flat default `catalog:` block only. */
export const parseCatalog = (workspaceYaml: string): Map<string, string> =>
	parseCatalogs(workspaceYaml).get('') ?? new Map();
