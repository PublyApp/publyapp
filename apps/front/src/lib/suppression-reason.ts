// W5-HARDEN: three independent conventions (`data-honesty-ignore`,
// `i18n-guard-ignore`, `design-system-ignore`) each re-implemented their own
// "does this suppression have a reason" check, and every copy accepted noise
// (`aaa`, `123`, `xxx`) as a "reason" — W5-VERIFY2 proved all three with the
// same three plants. One shared helper now backs all three call sites, so a
// future strengthening (or regression) of the bar lands once, not three
// times independently drifting.
//
// A reason-quality heuristic alone cannot fully close this hole: any bar a
// regex enforces, a careless author (human or AI) can clear by typing a
// plausible-looking sentence that still isn't an argued reason ("suppressed
// because of reasons"). The heuristic below catches the mechanical noise
// shapes (empty, punctuation-only, digits-only, a repeated character/word).
// The structural fix is `suppression-inventory.json` (see
// `diffSuppressionInventory` below): every suppression site — file,
// convention, and its exact reason text — must be checked in, so a NEW
// suppression cannot land silently. It has to appear in the diff, reason and
// all, where a reviewer actually sees it.

/** Strips whatever comment syntax the file allows (`//`, `/* *\/`, `{/* *\/}`,
 * `<!-- -->`) off the tail of a suppression comment's reason text, so a bare
 * `{/* data-honesty-ignore: *\/}` — whose only "reason" text is the comment's
 * own closing delimiters — can never read as a reasoned suppression. */
export const extractSuppressionReason = (rawReason: string): string =>
	rawReason.replace(/(\*\/\}|\*\/|\}|-->)\s*$/, '').trim();

// design-system-ignore's marker already consumes the rule id
// (`design-system-ignore: <ruleId> <reason>`), so a genuine, already-accepted
// real-world reason under that convention can be as short as two words
// (`collection-only mock`) — the rule id itself carries some of the
// identifying weight the other two conventions' reasons have to carry
// alone. MIN_REASON_ALNUM_CHARS and the length/repetition checks below are
// what keep that low word-count floor from becoming `aaa bbb`.
const MIN_REASON_WORDS = 2;
const MIN_REASON_ALNUM_CHARS = 12;

/**
 * A reason is substantive when it reads as an actual argued sentence, not
 * noise dressed up to clear a bar:
 *  - at least {@link MIN_REASON_WORDS} distinct word-like tokens that each
 *    contain a letter (rejects `123`/`456`, rejects a single word like `aaa`
 *    or `xxx`, rejects punctuation-only and zero-width/unicode-whitespace
 *    reasons which produce zero word tokens at all);
 *  - at least {@link MIN_REASON_ALNUM_CHARS} total letter/digit characters
 *    (rejects three throwaway one-letter "words" stitched together);
 *  - at least one word of 4+ characters (rejects `not aaa bbb`-shaped noise
 *    where every "word" is short filler);
 *  - not all words identical (rejects `aaa aaa aaa`-shaped repetition that
 *    would otherwise clear the two numeric bars above).
 * These numbers are deliberately low — this is a mechanical noise filter,
 * not a grammar checker. The real bar is `diffSuppressionInventory`: a
 * reason that clears this heuristic still has to be checked into the
 * committed inventory, in the diff, for a human to actually read.
 */
export const isSubstantiveSuppressionReason = (rawReason: string): boolean => {
	const reason = extractSuppressionReason(rawReason);
	const words = (reason.match(/[\p{L}\p{N}_-]+/gu) ?? []).filter((word) =>
		/\p{L}/u.test(word),
	);

	if (words.length < MIN_REASON_WORDS) {
		return false;
	}

	const alnumCount = (reason.match(/[\p{L}\p{N}]/gu) ?? []).length;
	if (alnumCount < MIN_REASON_ALNUM_CHARS) {
		return false;
	}

	if (!words.some((word) => word.length >= 4)) {
		return false;
	}

	const distinctWords = new Set(words.map((word) => word.toLowerCase()));
	if (distinctWords.size === 1) {
		return false;
	}

	return true;
};

export const SUPPRESSION_CONVENTIONS = [
	'data-honesty-ignore',
	'i18n-guard-ignore',
	'design-system-ignore',
] as const;

export type SuppressionConvention = (typeof SUPPRESSION_CONVENTIONS)[number];

export type SuppressionSite = {
	convention: SuppressionConvention;
	/** Repo-relative path (relative to `apps/front`), forward-slash separated. */
	file: string;
	/** The raw text after the convention prefix, delimiter-stripped. No line
	 * number — line numbers churn on unrelated edits and would make the
	 * inventory spuriously stale. */
	reason: string;
};

// A real suppression is always the FIRST content of a single-line comment
// (mirrors how every `isXSuppressed` reader in this codebase works: it reads
// exactly one line, `lines[lineNumber - 2]`). Anchoring on "marker is the
// first thing after the comment opener, at the start of the (trimmed) line"
// is what keeps this scan from matching three unrelated shapes that also
// contain the marker substring: a doc-comment *describing* the convention in
// prose (marker isn't the first token), a `const X = 'convention:'` string
// literal defining the convention itself (no comment opener at all), and a
// test fixture's string literal like `'{/* convention: ... */}'` (the line
// starts with a quote character, not the comment opener).
const COMMENT_OPENERS = ['//', '/*', '{/*', '<!--'];

/** Finds every occurrence of a real suppression-comment site in `source` and
 * extracts its (delimiter-stripped) reason text — independent of whether a
 * guard's own violation pattern matched nearby, so the inventory reflects
 * every suppression comment that exists, not just the ones currently paired
 * with a live violation. */
export const findSuppressionSitesInSource = (
	source: string,
	relativePath: string,
): SuppressionSite[] => {
	const sites: SuppressionSite[] = [];

	for (const rawLine of source.split('\n')) {
		const line = rawLine.trim();
		const opener = COMMENT_OPENERS.find((candidate) =>
			line.startsWith(candidate),
		);
		if (!opener) {
			continue;
		}
		const afterOpener = line.slice(opener.length).trimStart();

		for (const convention of SUPPRESSION_CONVENTIONS) {
			const marker = `${convention}:`;
			if (!afterOpener.startsWith(marker)) {
				continue;
			}
			sites.push({
				convention,
				file: relativePath,
				reason: extractSuppressionReason(afterOpener.slice(marker.length)),
			});
		}
	}

	return sites;
};

// W5-HARDEN2: the actual defect this round found — every live guard
// (`isInlineSuppressed` in check-design-system.mjs, `isI18nGuardSuppressed`,
// `isDataHonestySuppressed`) re-implemented its own "does the previous line
// carry a suppression marker" check as an unanchored `previous.indexOf(marker)`,
// which honours a marker embedded anywhere on the line — including after real
// executable code (`const x = true; // design-system-ignore: rule — reason`).
// Inventory discovery (`findSuppressionSitesInSource` above, used by both
// generate-suppression-inventory.mjs and the `*-inventory-drift`/committed-
// inventory checks below) only recognises a marker that is the first thing
// after a real comment opener on an otherwise-empty (trimmed) line. That
// disagreement meant a suppression could be honoured live while being
// completely invisible to the inventory that exists specifically to make
// every suppression visible in a diff — the CLI reported 0 violations with
// `checkSuppressionInventory: true` for a raw-colour literal that was, in
// fact, silenced.
//
// This is now the ONLY function any live guard may call to decide whether a
// line is suppressed — it reuses `findSuppressionSitesInSource`, the exact
// same parser the inventory uses, against just the one candidate line, so a
// shape either suppresses AND is inventoried, or suppresses NEITHER. There is
// no second, independent notion of "is this line suppressed" left in the
// codebase.
//
// `ruleId`, when given (design-system-ignore embeds the rule id inside the
// reason text itself: `design-system-ignore: <ruleId> <reason>`), must be the
// leading text of the site's reason; the remainder (after the rule id) is
// what gets the reason-quality check. Conventions with no embedded rule id
// (`i18n-guard-ignore`, `data-honesty-ignore`) omit it and the whole reason
// text is checked directly.
export const isPreviousLineSuppressed = (
	lines: string[],
	lineNumber: number,
	convention: SuppressionConvention,
	ruleId?: string,
): boolean => {
	const previous = lines[lineNumber - 2] ?? '';
	const site = findSuppressionSitesInSource(previous, '').find(
		(candidate) => candidate.convention === convention,
	);
	if (!site) {
		return false;
	}

	if (ruleId === undefined) {
		return isSubstantiveSuppressionReason(site.reason);
	}

	if (!site.reason.startsWith(ruleId)) {
		return false;
	}
	// F824-shell-F3: a bare `startsWith` let any text merely BEGINNING with the
	// real id absorb it — `no-raw-visual-colors` (real id + stray character)
	// silently suppressed `no-raw-visual-color`, certifying the line clean
	// under a rule name nobody defined. Require a word boundary after the id:
	// the next character must be absent (id == whole reason) or outside the
	// word/id alphabet (space, em dash, punctuation).
	const nextCharacter = site.reason[ruleId.length];
	if (nextCharacter !== undefined && /[\p{L}\p{N}_-]/u.test(nextCharacter)) {
		return false;
	}
	return isSubstantiveSuppressionReason(site.reason.slice(ruleId.length));
};

const siteKey = (site: SuppressionSite): string =>
	`${site.convention} ${site.file} ${site.reason}`;

// W6-GUARDS: round 6 (five independent lanes: shell F3, tenants F4, tests F1,
// ui F4, users-auth F9) found `Set`-based comparison is cardinality-blind — a
// file that already carries one inventoried suppression could carry a SECOND,
// uninventoried one (same convention/file/reason) without the diff noticing,
// because both `foundKeys`/`inventoryKeys` reduce to the same one-element
// `Set`. This is not hypothetical: the committed inventory already has three
// identical `i18n-guard-ignore` entries for `server-failure.ts`.
//
// The fix compares MULTISETS: every found site consumes one matching
// inventory occurrence (by key) if one remains, else it is undocumented;
// every inventory site consumes one matching found occurrence if one
// remains, else it is stale. Adding, removing, or rewording ANY single
// occurrence — even in a file that already has other occurrences sharing the
// same key — now changes the found/inventory counts for that key and is
// caught, without inventing a second notion of site identity (still just
// convention+file+reason, still backed by the one shared parser).
const countBySiteKey = (sites: SuppressionSite[]): Map<string, number> => {
	const counts = new Map<string, number>();
	for (const site of sites) {
		const key = siteKey(site);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
};

/**
 * Compares the suppression sites actually found in a scan against the
 * committed inventory. A suppression that exists in code but not in the
 * inventory (added or reworded without regenerating it) is `undocumented`;
 * an inventory entry no longer found in code (removed, or reworded) is
 * `stale`. Both must be empty for the guard to pass — this is the
 * structural half of the fix: a reason-quality heuristic can be fooled by a
 * plausible sentence, but it cannot make a NEW suppression invisible in the
 * diff, because the diff must also touch this file.
 */
type SuppressionInventoryDiff = {
	undocumented: SuppressionSite[];
	stale: SuppressionSite[];
};

export const diffSuppressionInventory = (
	found: SuppressionSite[],
	inventory: SuppressionSite[],
): SuppressionInventoryDiff => {
	const remainingInventory = countBySiteKey(inventory);
	const undocumented = found.filter((site) => {
		const key = siteKey(site);
		const remaining = remainingInventory.get(key) ?? 0;
		if (remaining <= 0) {
			return true;
		}
		remainingInventory.set(key, remaining - 1);
		return false;
	});

	const remainingFound = countBySiteKey(found);
	const stale = inventory.filter((site) => {
		const key = siteKey(site);
		const remaining = remainingFound.get(key) ?? 0;
		if (remaining <= 0) {
			return true;
		}
		remainingFound.set(key, remaining - 1);
		return false;
	});

	return { undocumented, stale };
};
