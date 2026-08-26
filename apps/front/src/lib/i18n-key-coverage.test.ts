import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// chore/908 (TypeScript 7): the bare `typescript` package export now resolves
// to `./lib/version.cjs` (a version string only) — the classic Compiler API
// moved behind the explicitly `unstable` `typescript/unstable/ast` surface,
// which already renamed at least one function this file used
// (`isStringLiteralLike` -> `isStringLiteralLikeNode`) and carries no semver
// guarantee across a future TS bump. ts-morph vendors its own internal,
// version-pinned copy of the classic compiler (`@ts-morph/common`), fully
// decoupled from this repo's `typescript` devDependency, so this AST walk
// keeps the same stable API across TypeScript upgrades instead of needing a
// re-audit on every one.
import { ts } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import enResource from '~/i18n/locales/en';
import frResource from '~/i18n/locales/fr';
import type { SupportedNamespace } from '~/lib/i18n.namespaces';
import suppressionInventory from '~/lib/suppression-inventory.json';
import {
	diffSuppressionInventory,
	findSuppressionSitesInSource,
	isPreviousLineSuppressed,
	type SuppressionSite,
} from '~/lib/suppression-reason';

// Extracts every string-literal translation-function call and JSX i18n-key
// attribute under apps/front/src and asserts it resolves in both locale
// bundles — a missing key silently renders the raw key string as UI text
// (i18next's default missing-key behaviour), and no other check catches that.
const srcDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

// `SourceFile.parseDiagnostics` has always existed on the classic compiler's
// concrete SourceFile at runtime, but it is `@internal` and not part of the
// public `ts.SourceFile` type, so a plain untyped consumer (like
// check-design-system.mjs) can read it directly while this typechecked `.ts`
// file cannot without a cast. Isolated in one place instead of an inline
// `as`/`any` at every call site.
type SourceFileWithParseDiagnostics = ts.SourceFile & {
	parseDiagnostics: readonly ts.Diagnostic[];
};

const getParseDiagnostics = (
	sourceFile: ts.SourceFile,
): readonly ts.Diagnostic[] =>
	(sourceFile as SourceFileWithParseDiagnostics).parseDiagnostics;

const TEXT_EXTENSIONS = new Set(['.ts', '.tsx']);

const KEY_PATTERNS = [
	/\bt\(\s*(['"])([a-zA-Z0-9_.:-]+)\1/g,
	/\bi18nKey=(['"])([a-zA-Z0-9_.:-]+)\1/g,
];
const USE_TRANSLATION_PATTERN =
	/\buseTranslation\(\s*(?:\[\s*)?(['"])([a-zA-Z0-9_.-]+)\1/;

type UsageKey = { namespace: SupportedNamespace; key: string };

const resolveUsageKey = (
	rawKey: string,
	defaultNamespace: SupportedNamespace,
): UsageKey => {
	const separator = rawKey.indexOf(':');
	if (separator === -1) return { namespace: defaultNamespace, key: rawKey };
	return {
		namespace: rawKey.slice(0, separator) as SupportedNamespace,
		key: rawKey.slice(separator + 1),
	};
};

// Some modules resolve a translation key indirectly through a lookup object
// (e.g. `getInvitationStatusLabelKey` in list-helpers.ts) instead of passing
// a literal to `t()`. The patterns above can't see those — the literal never
// appears next to `t(`. This regex finds `*_KEY`/`*_KEYS` object-literal
// declarations and the block below extracts their string values as
// candidate keys, so a lookup table pointing at a bundle-less key still
// fails the coverage check. Limits: it only catches object-literal lookup
// tables (not e.g. arrays, switch statements, or ternaries) named with a
// `_KEY`/`_KEYS` suffix, and it only trusts values that look like multi-segment
// kebab-case i18n keys (3+ dash-separated segments) to avoid false-positiving
// on unrelated short kebab strings (e.g. React `key="sk-1"` list keys).
const KEY_MAP_DECLARATION_PATTERN =
	/\b[A-Z][A-Z0-9_]*_KEYS?\s*(?::[^={]+)?=\s*\{/g;
const KEBAB_I18N_KEY_CANDIDATE = /^[a-z][a-z0-9]*(-[a-z0-9]+){2,}$/;
// `:` is REQUIRED here: without it a namespace-qualified value
// (`auth:some-key`) matches NO quote-to-quote literal at all and silently
// drops out of lookup-table coverage instead of flowing through
// resolveUsageKey below. Pinned by the qualified-value regression test near
// the bottom of this file.
const STRING_LITERAL_PATTERN = /(['"])([a-zA-Z0-9_.:-]+)\1/g;

// r3-tests-F6: a scalar `*_KEY`/`*_KEYS` const (not an object-literal lookup
// map) is invisible to KEY_MAP_DECLARATION_PATTERN, since that pattern only
// matches a declaration ending in `= {`. This is the shape
// `export const SELECTION_LOCKED_TITLE_KEY = 'selection-locked-while-selecting';`
// takes — `t(SELECTION_LOCKED_TITLE_KEY)` call sites never put the literal
// next to `t(`, so KEY_PATTERNS misses it too. Requires the declaration
// itself starts with `const` (so a re-export or a mid-object property named
// similarly isn't misread as a fresh declaration). A `_KEY`-suffixed name
// isn't always an i18n key though (e.g. `$invitationId.tsx`'s
// `NOT_FOUND_TRANSLATION_KEY = 'malformed-id'` is a problem-status
// discriminant, never passed to `t()`) — reuses the same
// KEBAB_I18N_KEY_CANDIDATE multi-segment heuristic as the object-literal
// extractor above to keep short, ambiguous values like that out.
const SCALAR_KEY_DECLARATION_PATTERN =
	/\bconst\s+[A-Z][A-Z0-9_]*_KEYS?\s*(?::[^=\n]+)?=\s*(['"])([a-z][a-z0-9-]*)\1/g;

const extractKeyMapLiteralUsages = (
	source: string,
	relativePath: string,
	defaultNamespace: SupportedNamespace,
	usagesByKey: Map<string, string[]>,
): void => {
	for (const declMatch of source.matchAll(KEY_MAP_DECLARATION_PATTERN)) {
		const braceStart = declMatch.index + declMatch[0].length - 1;
		let depth = 0;
		let braceEnd = -1;

		for (let i = braceStart; i < source.length; i += 1) {
			if (source[i] === '{') {
				depth += 1;
			} else if (source[i] === '}') {
				depth -= 1;
				if (depth === 0) {
					braceEnd = i;
					break;
				}
			}
		}

		if (braceEnd === -1) {
			continue;
		}

		const block = source.slice(braceStart, braceEnd);
		for (const literalMatch of block.matchAll(STRING_LITERAL_PATTERN)) {
			// Skip quoted PROPERTY NAMES (`'existing-signed-out': {`) — they
			// are the table's own discriminators, not translation keys; only
			// values (right of the colon) are key candidates. Without this,
			// a 3+-segment kebab discriminator masquerades as a bundle-less
			// key and fails the resolution check below.
			const afterQuote = block.slice(
				(literalMatch.index ?? 0) + literalMatch[0].length,
			);
			if (/^\s*:/.test(afterQuote)) {
				continue;
			}
			// A value may be namespace-qualified (`auth:some-key`) — lookup
			// tables in modules without their own `useTranslation()` default
			// qualify every value so the guard can attribute them correctly
			// (see routes/_accept-invitation-i18n-keys.ts).
			const { namespace, key } = resolveUsageKey(
				literalMatch[2],
				defaultNamespace,
			);
			if (!KEBAB_I18N_KEY_CANDIDATE.test(key)) {
				continue;
			}

			const qualifiedKey = `${namespace}:${key}`;
			const usages = usagesByKey.get(qualifiedKey) ?? [];
			usages.push(relativePath);
			usagesByKey.set(qualifiedKey, usages);
		}
	}
};

const extractScalarKeyDeclarations = (
	source: string,
	relativePath: string,
	defaultNamespace: SupportedNamespace,
	usagesByKey: Map<string, string[]>,
): void => {
	for (const match of source.matchAll(SCALAR_KEY_DECLARATION_PATTERN)) {
		const { namespace, key } = resolveUsageKey(match[2], defaultNamespace);
		if (!KEBAB_I18N_KEY_CANDIDATE.test(key)) {
			continue;
		}

		const qualifiedKey = `${namespace}:${key}`;
		const usages = usagesByKey.get(qualifiedKey) ?? [];
		usages.push(relativePath);
		usagesByKey.set(qualifiedKey, usages);
	}
};

const collectFiles = async (dir: string): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const absolutePath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(absolutePath)));
			continue;
		}

		if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
			files.push(absolutePath);
		}
	}

	return files;
};

type SourceFile = {
	absolutePath: string;
	relativePath: string;
	source: string;
};

// The full `src` tree is ~300 files; walking + reading it is the expensive
// part of every test below, and several tests need it independently. Under
// vitest's file-level parallelism, re-walking it 4x per run (as this file
// used to) meaningfully starves other workers' CPU/IO budget in the full
// suite — see W6-FLAKE. Cached once per test-file process since the tree
// doesn't change mid-run.
let cachedSourceFiles: Promise<SourceFile[]> | null = null;

const getSourceFiles = (dir: string): Promise<SourceFile[]> => {
	cachedSourceFiles ??= collectFiles(dir).then((files) =>
		Promise.all(
			files.map(async (absolutePath) => ({
				absolutePath,
				relativePath: path.relative(dir, absolutePath),
				source: await readFile(absolutePath, 'utf8'),
			})),
		),
	);
	return cachedSourceFiles;
};

// Same caching rationale as `cachedSourceFiles` above: multiple tests in this
// file call `extractI18nKeyUsages(srcDir)` independently, and it now also
// runs a full AST parse (`extractLabelKeyPropertyUsages`) per file — worth
// paying once per process, not once per test, since the source tree doesn't
// change mid-run.
let cachedUsagesByKey: Promise<Map<string, string[]>> | null = null;

const collectI18nKeyUsages = async (
	dir: string,
): Promise<Map<string, string[]>> => {
	const files = await getSourceFiles(dir);
	const usagesByKey = new Map<string, string[]>();

	for (const { relativePath, source } of files) {
		if (
			relativePath.endsWith('.test.ts') ||
			relativePath.endsWith('.test.tsx')
		) {
			continue;
		}

		const defaultNamespace = (source.match(USE_TRANSLATION_PATTERN)?.[2] ??
			'common') as SupportedNamespace;

		for (const pattern of KEY_PATTERNS) {
			for (const match of source.matchAll(pattern)) {
				const { namespace, key } = resolveUsageKey(match[2], defaultNamespace);
				const qualifiedKey = `${namespace}:${key}`;
				const usages = usagesByKey.get(qualifiedKey) ?? [];
				usages.push(relativePath);
				usagesByKey.set(qualifiedKey, usages);
			}
		}

		extractKeyMapLiteralUsages(
			source,
			relativePath,
			defaultNamespace,
			usagesByKey,
		);
		extractScalarKeyDeclarations(
			source,
			relativePath,
			defaultNamespace,
			usagesByKey,
		);
		extractLabelKeyPropertyUsages(source, relativePath, usagesByKey);
	}

	return usagesByKey;
};

export const extractI18nKeyUsages = async (
	dir: string,
): Promise<Map<string, string[]>> => {
	cachedUsagesByKey ??= collectI18nKeyUsages(dir);

	return cachedUsagesByKey;
};

// i18next resolves a plural key (`t('assigned-count', { count })`) against
// `<key>_one` / `<key>_other` in the bundle, not the bare key — a literal
// lookup would false-positive on every plural key in the codebase.
const resolvesInBundle = (key: string, bundle: Record<string, unknown>) =>
	key in bundle || `${key}_one` in bundle || `${key}_other` in bundle;

// A bare string literal never touches `t()`, so the coverage test above is
// structurally blind to it — this catches the class of defect that let it
// (r3-shell-F2). Language self-names (LOCALE_LABELS-style
// 'English'/'Français') are the one legitimate never-translated case: a
// language's own name isn't localized.
const LOCALE_SELF_NAME_ALLOWLIST = new Set(['English', 'Français']);

// W5-PROOF: the brand wordmark is never localized (same convention as
// `<Image>`'s brand-wordmark exception in the content-imagery rule) and, once
// isCopyLikeLiteral below drops the internal-whitespace requirement, a bare
// "PublyApp" in JSX text/alt would otherwise read as an untranslated string.
const NEVER_TRANSLATED_LITERAL_ALLOWLIST = new Set(['PublyApp']);

// W5-PROOF: URL/email/bare-domain example values are common, legitimate
// `placeholder`/`alt` content (`placeholder="user@example.com"`,
// `placeholder="https://example.com"`, a `publyapp.com/<slug>` preview
// fragment) — none of them are copy needing translation, but they are
// exactly the single-word-with-a-dot shape isCopyLikeLiteral's relaxed,
// no-whitespace check would otherwise catch now that testId-style
// exemption no longer comes for free from the whitespace requirement.
//
// W5-HARDEN (W5-VERIFY2): the previous pattern only anchored the START of
// the string (`^https?:\/\/`), so a trailing prefix match exempted the
// WHOLE literal — `aria-label="https://example.com Delete account"` rode
// behind the URL and vanished. Every alternative is now anchored at BOTH
// ends (`^...$`, and `\S+`/`\S*` instead of an open-ended tail) so the
// exemption only applies when the entire trimmed value IS a URL/email/
// domain-path and nothing else — real copy can never hide behind it again.
const URL_EMAIL_OR_DOMAIN_PATTERN =
	/^(?:https?:\/\/\S+|[\w.-]+@[\w.-]+\.\w+|[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*)$/i;

// r5-tests-F2: the round-4/round-3 detector was a closed regex grammar — a
// fixed native-tag allowlist for JSX text (`span|p|h1-6|button|label|dt|dd|
// td|th|li`, one line only) and a fixed attribute-name allowlist
// (`aria-label|placeholder|title`). `<Button>Delete account</Button>` (a
// custom component, not in the tag list), `<p>\nDelete account\n</p>`
// (multiline text, excluded by the `[^<{}\n]` character class),
// `description="Delete account"` (an attribute name outside the fixed
// three), and `{'Delete account'}` (a bare JSX expression child, no
// attribute at all) all produced zero findings under the old grammar. This
// rewrite walks the real TypeScript/JSX AST instead of re-deriving one shape
// at a time from regex: every `JsxText` child of every element (native or
// custom, any tag, any line count) and every JSX attribute's string/ternary
// value are visited structurally, so no tag name or attribute name needs to
// be enumerated up front. `t(...)`-wrapped or already-computed values (an
// identifier, a call expression, a template literal with interpolation)
// never match — only a literal or a two-literal ternary sitting directly in
// copy position does.
const isProseLikeLiteral = (value: string): boolean => {
	const trimmed = value.trim();
	if (trimmed.length < 2 || LOCALE_SELF_NAME_ALLOWLIST.has(trimmed)) {
		return false;
	}
	if (!/[a-z]/.test(trimmed)) {
		// Requires at least one LOWERCASE letter, so all-caps technical
		// constants/enum values (`'POST'`, `'UTC'`, `'ACTIVE'`) and
		// symbol/digit-only strings don't false-positive — real UI copy is
		// never all-caps in this codebase's i18n bundles. r5-shell-F2: this
		// deliberately does NOT also require an initial capital letter — the
		// round-5 finding's exact evasion, `code="500 — Server Error"`, starts
		// with a digit, and a leading-capital requirement made it invisible.
		return false;
	}
	// Requires internal whitespace — a real sentence/phrase reads as multiple
	// words. This is deliberately NOT "long enough" as a fallback: kebab-case
	// identifiers, slugs, and URLs (`staff-tenant-user-details-empty`,
	// `https://example.com`) are frequently long, lowercase, and
	// letter-only, and a length-only fallback flagged all of them. Requiring
	// a space excludes every one of those (no CSS-identifier/URL/email
	// spelling in this codebase contains a literal space) while still
	// catching any multi-word phrase, however it's capitalized.
	return /\s/.test(trimmed);
};

// W5-PROOF: the internal-whitespace requirement above exists to keep
// kebab-case testIds and URL/email placeholders out of the ambiguous
// positions (bare string literals, `??`/`||` fallbacks, parameter defaults),
// but it made single-word real copy ("Delete", "Save", "Suspendre")
// completely invisible everywhere it appears — including positions that are
// BY DEFINITION user-visible copy, not ambiguous at all. For those positions
// (JSX text content, and the ALWAYS_COPY_ATTRIBUTE_NAMES attributes/props
// below) any non-empty, letter-containing, non-all-caps literal is a
// finding — no word-count requirement — since there is no wiring/testId use
// case competing for those positions the way there is for a bare literal or
// a `??` fallback.
// W5-HARDEN2: the kebab-key exemption below must NOT apply to a definite
// assistive/DOM-copy position (JSX attribute, DOM property write,
// setAttribute, insertAdjacentText, ...) — `aria-label="delete-selected-users"`
// is real, rendered assistive copy that happens to look kebab-shaped, not an
// i18n key reference (a key reference is always passed to `t()`, never
// rendered as a literal attribute value). The exemption exists ONLY to
// protect the one shape it was found for: an object-literal LOOKUP TABLE
// whose values are themselves i18n keys resolved by `t()` elsewhere (see the
// call site below). `allowKeyLookupExemption` defaults to false so every
// other caller — every JSX attribute and DOM-sink call site — evaluates a
// kebab-shaped literal as real copy, same as any other value.
const isCopyLikeLiteral = (
	value: string,
	allowKeyLookupExemption = false,
): boolean => {
	const trimmed = value.trim();
	// Namespace-qualified key values (`auth:some-long-key`) are exempted on
	// their key part — same rationale as the bare-kebab case below.
	const trimmedKeyPart = trimmed.replace(/^[a-z][a-z0-9]*:/, '');
	if (
		trimmed.length < 2 ||
		LOCALE_SELF_NAME_ALLOWLIST.has(trimmed) ||
		NEVER_TRANSLATED_LITERAL_ALLOWLIST.has(trimmed) ||
		URL_EMAIL_OR_DOMAIN_PATTERN.test(trimmed) ||
		(allowKeyLookupExemption &&
			(KEBAB_I18N_KEY_CANDIDATE.test(trimmedKeyPart) ||
				KEBAB_I18N_KEY_CANDIDATE.test(trimmed)))
	) {
		return false;
	}
	// Same all-caps technical-constant exemption as isProseLikeLiteral
	// ('POST', 'UTC', 'ACTIVE') — deliberately no whitespace requirement.
	return /[a-z]/.test(trimmed);
};

// W5-HARDEN: widening ALWAYS_COPY-style detection to a `subtitle:` object
// property (see COPY_LIKE_ATTRIBUTE_NAME_PATTERN) surfaced a real false
// positive — a `Record<Branch, { headline; subtitle }>` lookup table whose
// values are i18n KEYS (`accept-invitation-brand-subtitle-new-user`), passed
// to `t()` elsewhere, exactly like KEY_MAP_DECLARATION_PATTERN's extraction
// above already treats multi-segment kebab-case values as candidate keys, not
// copy. Real UI copy in this codebase is never all-lowercase-and-hyphens with
// 3+ segments, so this is a safe, general exemption for an object-literal
// property VALUE specifically — never for a JSX attribute or DOM-sink literal
// (see isCopyLikeLiteral's `allowKeyLookupExemption` above).
const isCopyLikeObjectPropertyValue = (value: string): boolean =>
	isCopyLikeLiteral(value, true);

// r5-tests-F2: attribute names that are structurally never user-visible copy
// (styling/wiring/enum-valued props) are exempted regardless of how
// prose-like their string value looks, so `variant="Outline"`-shaped typos
// in enum props don't become permanent false positives the suite has to
// suppress one-by-one. Everything else — including component-specific copy
// props this list has never heard of (`description`, `helperText`,
// `emptyText`, ...) — is evaluated as a copy candidate.
const NEVER_COPY_ATTRIBUTE_NAMES = new Set([
	'className',
	'id',
	'key',
	'ref',
	'name',
	'type',
	'role',
	'variant',
	'size',
	'as',
	'to',
	'href',
	'path',
	'icon',
	'color',
	'align',
	'side',
	'sideOffset',
	'direction',
	'orientation',
	'value',
	'defaultValue',
	'min',
	'max',
	'step',
	'pattern',
	'autoComplete',
	'rel',
	'target',
	'method',
	'htmlFor',
	'style',
	'src',
	'srcSet',
	'sizes',
	'width',
	'height',
	'viewBox',
	'fill',
	'stroke',
	'xmlns',
	'data-testid',
	'data-rail-item',
	'data-slot',
]);

// #330 detail-skeleton: component-specific styling props ending in
// `ClassName` (`tileClassName`, `rowClassName`, `headingClassName`) are
// structurally never user-visible copy — same family as `className`
// itself (r5-tests-F2), just names the exact-name set above has never
// heard of. Their Tailwind values are multi-word ("size-14 rounded-[10px]"),
// so isProseLikeLiteral's internal-whitespace requirement does not save
// them: they must be exempted by name, before value inspection. A
// user-visible-copy prop would never be named `*ClassName`.
const NEVER_COPY_ATTRIBUTE_NAME_PATTERN = /ClassName$/;

// W5-PROOF: attribute/prop names that are BY DEFINITION user-visible copy
// wherever they appear — a single word here ("Delete", "Cancel") is exactly
// as much a fabricated-English-copy problem as a full sentence, so these are
// checked with isCopyLikeLiteral (no internal-whitespace requirement)
// instead of the conservative isProseLikeLiteral used for ambiguous
// positions.
// W5-HARDEN2: `action` added — a component's `action="Delete"` prop is the
// same single-word-copy shape as `label`/`title` (a verb-label for a
// button/menu-item), and single-word copy in it was invisible: `action`
// doesn't end in any COPY_LIKE_ATTRIBUTE_NAME_PATTERN suffix, so it fell back
// to isProseLikeLiteral's internal-whitespace requirement, which single-word
// copy never has.
const ALWAYS_COPY_ATTRIBUTE_NAMES = new Set([
	'aria-label',
	'aria-description',
	'placeholder',
	'title',
	'label',
	'description',
	'alt',
	'action',
]);

// W5-HARDEN (W5-VERIFY2): `<Widget emptyText="Empty" tooltip="Delete" />`
// sailed through — `emptyText`/`tooltip` aren't in ALWAYS_COPY_ATTRIBUTE_NAMES,
// so they fell back to isProseLikeLiteral's internal-whitespace requirement
// and single-word copy in those props was invisible. A hand-typed name list
// can never keep up with every copy-bearing prop this codebase's components
// will ever invent, so this is a naming-convention pattern instead: any
// attribute/prop name ending in one of these copy-suggesting suffixes is
// treated as a definite-copy position (isCopyLikeLiteral, no whitespace
// requirement), the same way ALWAYS_COPY_ATTRIBUTE_NAMES already is. Names in
// NEVER_COPY_ATTRIBUTE_NAMES are still checked first and win regardless
// (e.g. a hypothetical `errorColor` prop would match `color`'s exemption
// before it reached this pattern — NEVER_COPY_ATTRIBUTE_NAMES is an exact-name
// set, not suffix-based, so that particular clash doesn't arise today).
const COPY_LIKE_ATTRIBUTE_NAME_PATTERN =
	/(?:text|label|title|description|message|tooltip|caption|heading|subtitle|hint|placeholder|prompt|summary|content|copy|error|warning|empty)$/i;

const isDefiniteCopyPositionName = (name: string): boolean =>
	ALWAYS_COPY_ATTRIBUTE_NAMES.has(name) ||
	COPY_LIKE_ATTRIBUTE_NAME_PATTERN.test(name);

// W5-HARDEN: widening the object-literal-property check surfaced real false
// positives — `title`/`content`/`description` are also the field names of
// two unrelated, genuinely non-copy shapes that already exist throughout
// this codebase: an RFC 7807-style problem-details object (`{ status,
// responseStatusCode, title: 'Unauthorized', detail }`, per
// docs/guides/architecture-details.md's error-response convention — the
// actual user-facing text is produced by `t()` keyed off `.translationKey`
// elsewhere, same rationale as this file's `i18n-guard-ignore` convention),
// and a `<meta>`/SEO descriptor (`{ name: 'viewport', content: '...' }`,
// `{ property: 'og:title', content: title }`, a TanStack Router `head()`
// result with `title`/`meta`/`links` siblings).
//
// W5-HARDEN2: the original version keyed this off ANY single sibling from one
// flat set — an ordinary UI view-model carrying a `status` enum alongside
// real `title`/`description` copy (a toast, a banner) collided with the
// problem-details signature on that one ambiguous key and had its genuine
// copy silently exempted. This now identifies the two shapes it was meant to
// by what actually discriminates them structurally, not by any one
// coincidental name:
//  - a `<meta>`/SEO/TanStack `head()` descriptor always carries `content`
//    (the `{ name, content }` / `{ property, content }` pair) or one of the
//    route-`head()`-only keys (`meta`, `links`, `canonical`, `sitemap`,
//    `robots`, `charSet`) — none of which a real UI copy object ever uses;
//  - an RFC 7807 problem-details object always carries AT LEAST TWO of its
//    signature fields together (`status` alone is exactly the ambiguous
//    single-key collision that caused the false negative; `status` PLUS
//    `responseStatusCode`/`httpStatus`/`translationKey`/`detail` together is
//    the real, recognizable shape).
// W6-GUARDS (tests F4): `content` used to be a member of
// META_DESCRIPTOR_MARKER_KEYS on its own, so ANY object carrying a `content`
// property — including an ordinary confirmation/toast view-model shaped
// `{ title: 'Delete account', content: 'This cannot be undone' }` — was
// exempted wholesale. A real `<meta>`/SEO descriptor always pairs `content`
// with `name` or `property` (`{ name: 'viewport', content }`,
// `{ property: 'og:title', content }`); those route-`head()`-only keys
// (`meta`, `links`, `canonical`, `sitemap`, `robots`, `charSet`) are still
// sufficient alone — no ordinary UI copy object in this codebase uses them.
const ROUTE_HEAD_ONLY_MARKER_KEYS = new Set([
	'meta',
	'links',
	'canonical',
	'sitemap',
	'robots',
	'charSet',
]);
const META_TAG_PAIR_KEYS = new Set(['name', 'property']);

// W6-GUARDS (tests F4): the same over-broad shape applied to problem-details
// recognition — "any two of five generic-sounding names" let an ordinary
// `{ status: 'warning', detail: 'Try again later' }` banner collide with the
// RFC 7807 signature on two names ordinary UI copy plausibly reuses. A real
// AppProblemDetails payload (docs/guides/architecture-details.md) always
// carries `status` AND `detail` together, AND at least one API-contract-only
// discriminator field an ordinary UI view-model has no reason to name.
const PROBLEM_DETAILS_CORE_KEYS = new Set(['status', 'detail']);
const PROBLEM_DETAILS_DISCRIMINATOR_KEYS = new Set([
	'responseStatusCode',
	'httpStatus',
	'translationKey',
]);

const isMetaOrProblemDetailsDescriptor = (node: ts.Node): boolean => {
	if (!ts.isObjectLiteralExpression(node)) {
		return false;
	}

	const siblingNames = new Set(
		node.properties
			.map((property) =>
				property.name &&
				(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
					? property.name.text
					: undefined,
			)
			.filter((name): name is string => name !== undefined),
	);

	const hasRouteHeadOnlyMarker = [...ROUTE_HEAD_ONLY_MARKER_KEYS].some((key) =>
		siblingNames.has(key),
	);
	const hasMetaTagPair =
		siblingNames.has('content') &&
		[...META_TAG_PAIR_KEYS].some((key) => siblingNames.has(key));
	const hasProblemDetailsSignature =
		[...PROBLEM_DETAILS_CORE_KEYS].every((key) => siblingNames.has(key)) &&
		[...PROBLEM_DETAILS_DISCRIMINATOR_KEYS].some((key) =>
			siblingNames.has(key),
		);

	return hasRouteHeadOnlyMarker || hasMetaTagPair || hasProblemDetailsSignature;
};

// W5-HARDEN: imperative DOM property writes that land copy on-screen exactly
// like the JSX attributes above do, just through a different API
// (`element.title = 'Delete'` instead of `<span title="Delete" />`).
// W5-HARDEN2: `innerHTML` added — `element.innerHTML = 'Delete account'` is
// the same direct copy-on-screen write as `.textContent`/`.innerText`, just
// through the HTML-parsing sink instead of the text sink.
const COPY_LIKE_DOM_PROPERTY_NAMES = new Set([
	'title',
	'textContent',
	'innerText',
	'innerHTML',
]);

// W5-HARDEN2: the direct DOM text-insertion call APIs that
// COPY_LIKE_DOM_PROPERTY_NAMES/setAttribute above don't cover — each renders
// its argument as visible page copy exactly like a property write does, just
// through a call instead of an assignment:
//  - `el.insertAdjacentText(position, text)` — `text` (2nd arg) is copy;
//  - `el.append(text)` / `el.prepend(text)` — restricted to exactly ONE
//    argument, since `FormData.append(name, value)` and
//    `URLSearchParams.append(name, value)` share the method name but always
//    take two arguments, and their values are data, not rendered copy;
//  - `document.createTextNode(text)` — `text` (1st arg) becomes a rendered
//    text node wherever the returned node is later inserted (e.g.
//    `el.appendChild(document.createTextNode('Delete account'))` — the
//    visitor's own recursion into call arguments finds this nested call
//    without any special-casing of `appendChild` itself).
const COPY_LIKE_SINGLE_ARG_DOM_CALL_NAMES = new Set([
	'createTextNode',
	'append',
	'prepend',
]);

// An opt-out comment on the line directly above the offending line, mirroring
// check-design-system.mjs's `design-system-ignore` convention — requires a
// reason so the suppression has to be argued, not just added. Reserved for
// genuine non-presentation strings (e.g. an internal Error payload field
// that is never rendered raw — the actual user-facing copy is produced by
// `t()` keyed off `.status`/`.translationKey` elsewhere).
// W5-HARDEN2: this used to be its own `previous.indexOf(marker)` scan, which
// (unlike inventory discovery) honoured a marker embedded anywhere on the
// previous line — including after real code. It now defers entirely to
// `isPreviousLineSuppressed`, the single shared parser also used by
// `findSuppressionSitesInSource`/the inventory diff below, so this guard and
// the inventory can never again disagree about what counts as a suppression
// site. See suppression-reason.ts for the full rationale.
const isI18nGuardSuppressed = (lines: string[], lineNumber: number): boolean =>
	isPreviousLineSuppressed(lines, lineNumber, 'i18n-guard-ignore');

// Eligible findings: a bare string literal; a ternary whose both branches are
// string literals (the `cond ? 'A' : 'B'` shape `t()` calls never sit next
// to); a template literal WITH interpolation, checked span-by-span (W6-GUARDS
// — see below); or a `+` string-concatenation chain, checked operand-by-
// operand (W6-GUARDS). Anything else — a bare identifier, a `t(...)` call, a
// ternary with a non-literal branch — is presumed already i18n-aware or
// non-copy, and is left alone.
//
// W6-GUARDS (round-6: shell F5, tests F3, tests F4 — three independent
// lanes): the previous version bailed out of BOTH shapes entirely — its own
// comment said "a template literal with interpolation is presumed already
// i18n-aware" — so `` `Delete ${count} users` `` and `'Delete ' + name` were
// invisible at every one of the seven advertised sinks (JSX children,
// attributes, object properties, DOM assignments, setAttribute,
// insertAdjacentText, single-arg DOM calls), because they all funnel through
// this one collector. Real interpolated copy IS still safe to leave alone —
// but only when it carries NO static prose text at all (e.g.
// `` `${translatedGreeting} ${translatedName}` ``, where every span between interpolations is
// empty/whitespace). The fix inspects exactly that: the STATIC text spans of
// a template literal (the parts NOT inside `${...}`), and the string-literal
// OPERANDS of a `+` chain, independent of what the interpolated/non-literal
// parts are.
/** Collects only the literal text fragments of a `+`-concatenation chain
 * (skipping non-literal operands like an interpolated identifier), in
 * left-to-right order, so they can be joined back into the text a reader
 * would actually see rendered — `'Delete ' + name` -> `['Delete ']`, joined
 * to `'Delete '`, preserving the trailing space that makes it read as a
 * sentence fragment once combined with its neighbour. */
const collectStringLiteralOperands = (expression: ts.Expression): string[] => {
	if (ts.isStringLiteralLike(expression)) {
		return [expression.text];
	}
	if (
		ts.isBinaryExpression(expression) &&
		expression.operatorToken.kind === ts.SyntaxKind.PlusToken
	) {
		return [
			...collectStringLiteralOperands(expression.left),
			...collectStringLiteralOperands(expression.right),
		];
	}
	return [];
};

const collectProseLiteralValues = (
	expression: ts.Expression,
	isCopy: (value: string) => boolean = isProseLikeLiteral,
): string[] => {
	if (ts.isStringLiteralLike(expression)) {
		return isCopy(expression.text) ? [expression.text] : [];
	}

	if (ts.isConditionalExpression(expression)) {
		const whenTrue = collectProseLiteralValues(expression.whenTrue, isCopy);
		const whenFalse = collectProseLiteralValues(expression.whenFalse, isCopy);
		if (
			ts.isStringLiteralLike(expression.whenTrue) &&
			ts.isStringLiteralLike(expression.whenFalse) &&
			(whenTrue.length > 0 || whenFalse.length > 0)
		) {
			return [...whenTrue, ...whenFalse];
		}
	}

	// W6-GUARDS: a template literal's individual static spans, checked in
	// isolation, are frequently single words that don't clear a conservative
	// isCopy's internal-whitespace bar even when the sentence they form once
	// joined around the interpolation obviously does (`` `Delete ${count}
	// users` `` -> spans "Delete " / " users", each one word alone). Joining
	// the static spans back into the text a reader actually sees (with the
	// interpolated part omitted, since its rendered value is dynamic) fixes
	// this without weakening isCopy itself.
	if (ts.isTemplateExpression(expression)) {
		const staticSpans = [
			expression.head.text,
			...expression.templateSpans.map((span) => span.literal.text),
		];
		const combinedText = staticSpans.join(' ').trim();
		return isCopy(combinedText) ? [combinedText] : [];
	}

	if (
		ts.isBinaryExpression(expression) &&
		expression.operatorToken.kind === ts.SyntaxKind.PlusToken
	) {
		const individual = [
			...collectProseLiteralValues(expression.left, isCopy),
			...collectProseLiteralValues(expression.right, isCopy),
		];
		if (individual.length > 0) {
			return individual;
		}
		// Same rationale as the template-literal branch: a concatenation's
		// literal fragments can each be single words that only read as a
		// sentence once combined (`'Delete ' + name`).
		const combinedText = collectStringLiteralOperands(expression)
			.join('')
			.trim();
		return isCopy(combinedText) ? [combinedText] : [];
	}

	return [];
};

// chore/908 follow-up (adversarial review IMPORTANT finding): a walk over a
// source the bundled parser cannot finish must never silently read as "found
// nothing". Planting a hardcoded JSX literal after syntax the bundled parser
// can't finish (e.g. an unterminated template literal) let the literal get
// swallowed into the recovery tree — the suite stayed green for the wrong
// reason, the exact silent-partial-tree failure this migration exists to
// prevent. ts-morph's vendored compiler only stabilizes the API surface
// across TypeScript upgrades (see the import-site comment above); it does not
// make that parser understand syntax it cannot finish parsing, so any parse
// diagnostic must fail every AST-based guard loudly, naming the file, instead
// of silently walking whatever tree recovery produced. Shared by
// `findHardcodedUiLiterals` and `extractLabelKeyPropertyUsages` so the two
// AST walks in this file can never diverge on script-kind selection or
// parse-failure handling.
//
// W6-FLAKE (#827): this file's whole-tree sweeps used to re-parse every
// production file once per walker (`extractLabelKeyPropertyUsages` inside the
// cached `extractI18nKeyUsages`, plus the `findHardcodedUiLiterals` sweep) —
// 2x full-tree AST parse bursts per run in this worker, wasted CPU that under
// external contention starved render workers past testing-library's findBy*
// budget. The per-(source, path) memoization below collapses those repeats to
// one parse per distinct input; `parseCallCountForTestObservation` exists so
// the suite can pin that behaviour.
let parseCallCount = 0;

const parseCallCountForTestObservation = (): number => parseCallCount;

// W6-FLAKE (#827): the per-(source, path) tree cache. Keyed on `relativePath`
// AND validated against the exact source text before reuse, so a fixture that
// reuses a real file's path with different content (or two fixtures sharing a
// `canary.tsx` name with different sources) always triggers a fresh parse —
// a stale tree can never be served. Only successfully parsed (zero
// diagnostics) trees are cached; a parse that threw is not remembered.
const parsedSourceCache = new Map<
	string,
	{ source: string; sourceFile: ts.SourceFile }
>();

const createParsedSourceFile = (
	source: string,
	relativePath: string,
	guardName: string,
): ts.SourceFile => {
	const cached = parsedSourceCache.get(relativePath);
	if (cached && cached.source === source) {
		return cached.sourceFile;
	}

	const sourceFile = ts.createSourceFile(
		relativePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		relativePath.endsWith('.tsx') || !relativePath.endsWith('.ts')
			? ts.ScriptKind.TSX
			: ts.ScriptKind.TS,
	);
	parseCallCount += 1;

	const parseDiagnostics = getParseDiagnostics(sourceFile);
	if (parseDiagnostics.length > 0) {
		const messages = parseDiagnostics
			.map((diagnostic) =>
				ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
			)
			.join('; ');
		throw new Error(
			`${guardName} could not parse ${relativePath} — ` +
				`refusing to scan a partial/recovered syntax tree: ${messages}`,
		);
	}

	parsedSourceCache.set(relativePath, { source, sourceFile });

	return sourceFile;
};

const LABEL_KEY_PROPERTY_NAME = 'labelKey';

/**
 * Breadcrumb (and nav-item) declarations hold their translation key as
 * `labelKey: '...'`, resolved later through `t(item.labelKey)` at a
 * completely different call site (`app-shell.tsx`) — a shape neither
 * KEY_PATTERNS (`t(...)`/`i18nKey=...`) nor the `*_KEY(S)` lookup-table
 * extractors above ever matched. The reviewer pointed a real production
 * breadcrumb's `labelKey` at one of the five deleted generic-wording keys and
 * the coverage test still passed (#973 BLOCKER finding #2).
 *
 * Walks the real AST — not a regex over raw text — specifically so this
 * can't gain the same comment/`.d.ts` blind spot KEY_PATTERNS already has: a
 * `labelKey: '...'` mentioned in a comment is not a syntax node at all, and a
 * `.d.ts`/interface member `labelKey: string` is a `PropertySignature`, never
 * a `PropertyAssignment`, so neither can masquerade as a real usage here. A
 * dynamic value (a template literal with interpolation, an identifier) is
 * skipped — there is no static key to check.
 */
const extractLabelKeyPropertyUsages = (
	source: string,
	relativePath: string,
	usagesByKey: Map<string, string[]>,
): void => {
	const sourceFile = createParsedSourceFile(
		source,
		relativePath,
		'i18n labelKey coverage guard',
	);

	const visit = (node: ts.Node): void => {
		if (
			ts.isPropertyAssignment(node) &&
			((ts.isIdentifier(node.name) &&
				node.name.text === LABEL_KEY_PROPERTY_NAME) ||
				(ts.isStringLiteral(node.name) &&
					node.name.text === LABEL_KEY_PROPERTY_NAME)) &&
			ts.isStringLiteralLike(node.initializer)
		) {
			// Unqualified `labelKey` values resolve against the 'common'
			// namespace regardless of the DECLARING file's own
			// `useTranslation()` default — the actual `t()` call lives in
			// app-shell.tsx (`useTranslation('common')`), not the route file
			// that declares the crumb.
			const { namespace, key } = resolveUsageKey(
				node.initializer.text,
				'common',
			);
			const qualifiedKey = `${namespace}:${key}`;
			const usages = usagesByKey.get(qualifiedKey) ?? [];
			usages.push(relativePath);
			usagesByKey.set(qualifiedKey, usages);
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
};

const findHardcodedUiLiterals = (
	source: string,
	relativePath: string,
): string[] => {
	const findings: string[] = [];
	const lines = source.split('\n');

	const sourceFile = createParsedSourceFile(
		source,
		relativePath,
		'i18n hardcoded-literal guard',
	);

	const lineOf = (pos: number): number =>
		sourceFile.getLineAndCharacterOfPosition(pos).line + 1;

	const report = (node: ts.Node, text: string): void => {
		const lineNumber = lineOf(node.getStart(sourceFile));
		if (isI18nGuardSuppressed(lines, lineNumber)) {
			return;
		}
		findings.push(`${relativePath}:${lineNumber}: ${text}`);
	};

	const visit = (node: ts.Node): void => {
		if (ts.isJsxText(node)) {
			const text = node.text.replace(/\s+/g, ' ').trim();
			if (text.length > 0 && /[a-zA-Z]/.test(text) && isCopyLikeLiteral(text)) {
				report(node, `JSX text "${text}"`);
			}
		} else if (
			ts.isJsxExpression(node) &&
			node.expression &&
			!ts.isJsxAttribute(node.parent)
		) {
			// A JSX attribute's `={...}` value is handled below via
			// JsxAttribute so it can see the attribute name; this branch only
			// fires for a bare expression sitting directly in element/fragment
			// content (`{'Delete account'}`).
			for (const value of collectProseLiteralValues(node.expression)) {
				report(node, `JSX expression child {${JSON.stringify(value)}}`);
			}
		} else if (ts.isJsxAttribute(node)) {
			const attrName = node.name.getText(sourceFile);
			if (
				!NEVER_COPY_ATTRIBUTE_NAMES.has(attrName) &&
				!NEVER_COPY_ATTRIBUTE_NAME_PATTERN.test(attrName)
			) {
				const isCopy = isDefiniteCopyPositionName(attrName)
					? isCopyLikeLiteral
					: isProseLikeLiteral;
				const initializer = node.initializer;
				if (initializer && ts.isStringLiteral(initializer)) {
					if (isCopy(initializer.text)) {
						report(node, `${attrName}="${initializer.text}"`);
					}
				} else if (
					initializer &&
					ts.isJsxExpression(initializer) &&
					initializer.expression
				) {
					for (const value of collectProseLiteralValues(
						initializer.expression,
						isCopy,
					)) {
						report(node, `${attrName}={"${value}"}`);
					}
				}
			}
		} else if (
			ts.isPropertyAssignment(node) &&
			(ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
			!node.name.text.startsWith('--') &&
			// W5-HARDEN (W5-VERIFY2): `{ title: 'Delete' }` sailed through — only
			// an object-literal property literally named `label` was checked.
			// Widened to the same definite-copy name set JSX attributes use
			// (`title`, `description`, `tooltip`, `emptyText`, ...), so a plain
			// object-literal toast/column/option config is covered the same way
			// a component prop is, not just the one hand-picked key.
			isDefiniteCopyPositionName(node.name.text) &&
			!isMetaOrProblemDetailsDescriptor(node.parent)
		) {
			for (const value of collectProseLiteralValues(
				node.initializer,
				isCopyLikeObjectPropertyValue,
			)) {
				report(node, `${node.name.text}: "${value}"`);
			}
		} else if (
			// W5-HARDEN (W5-VERIFY2): `element.title = 'Delete'` and
			// `element.setAttribute('aria-label', 'Cancel')` are imperative DOM
			// writes — entirely outside the JSX-attribute/object-literal shapes
			// above. `element.title =`/`.textContent =`/`.innerText =` assigns a
			// copy-bearing DOM property directly; `setAttribute` with a
			// definite-copy attribute name (`aria-label`, `title`, ...) does the
			// same through a different API. Both are covered here instead of
			// only the declarative shapes.
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			ts.isPropertyAccessExpression(node.left) &&
			COPY_LIKE_DOM_PROPERTY_NAMES.has(node.left.name.text)
		) {
			for (const value of collectProseLiteralValues(
				node.right,
				isCopyLikeLiteral,
			)) {
				report(node, `${node.left.name.text} = "${value}"`);
			}
		} else if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.name.text === 'setAttribute' &&
			node.arguments.length >= 2 &&
			ts.isStringLiteralLike(node.arguments[0]) &&
			isDefiniteCopyPositionName(node.arguments[0].text)
		) {
			const attrName = node.arguments[0].text;
			for (const value of collectProseLiteralValues(
				node.arguments[1],
				isCopyLikeLiteral,
			)) {
				report(node, `setAttribute("${attrName}", "${value}")`);
			}
		} else if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.name.text === 'insertAdjacentText' &&
			node.arguments.length >= 2
		) {
			for (const value of collectProseLiteralValues(
				node.arguments[1],
				isCopyLikeLiteral,
			)) {
				report(node, `insertAdjacentText(..., "${value}")`);
			}
		} else if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			COPY_LIKE_SINGLE_ARG_DOM_CALL_NAMES.has(node.expression.name.text) &&
			node.arguments.length === 1
		) {
			const calleeName = node.expression.name.text;
			for (const value of collectProseLiteralValues(
				node.arguments[0],
				isCopyLikeLiteral,
			)) {
				report(node, `${calleeName}("${value}")`);
			}
		} else if (
			(ts.isBinaryExpression(node) &&
				(node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
					node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) ||
			ts.isParameter(node)
		) {
			// `??`/`||` fallback feeding a display string, and a destructured
			// parameter's default value (`placeholder = 'Select…'`) — both
			// r4-shell-F2 shapes, now handled by the same literal/ternary
			// collector instead of their own bespoke regex.
			let candidate: ts.Expression | undefined;
			if (ts.isParameter(node)) {
				candidate = node.initializer;
			} else if (ts.isBinaryExpression(node)) {
				candidate = node.right;
			}
			if (candidate) {
				for (const value of collectProseLiteralValues(candidate)) {
					report(node, `"${value}"`);
				}
			}
		} else if (
			ts.isVariableDeclaration(node) &&
			node.initializer &&
			ts.isConditionalExpression(node.initializer)
		) {
			// `const label = cond ? 'A' : 'B'` — a ternary assigned straight
			// to a variable, never passed to `t()` at the assignment site.
			for (const value of collectProseLiteralValues(node.initializer)) {
				report(node, `"${value}"`);
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);

	return findings;
};

describe('i18n key coverage', () => {
	test('attributes unqualified and explicitly qualified keys to their namespaces', () => {
		expect(resolveUsageKey('sign-in', 'auth')).toEqual({
			namespace: 'auth',
			key: 'sign-in',
		});
		expect(resolveUsageKey('common:retry', 'auth')).toEqual({
			namespace: 'common',
			key: 'retry',
		});
	});

	// r4-tests-F1: the review's exact planted example against the pre-fix
	// detector reported "planted hardcoded UI matches: 0" — a plain JSX text
	// node and an unbraced string attribute were both invisible. This canary
	// fails if that class of blindness ever regresses.
	test('findHardcodedUiLiterals catches plain JSX text and an unbraced string attribute (r4-tests-F1 canary)', () => {
		const findings = findHardcodedUiLiterals(
			// chore/908 follow-up: adjacent top-level JSX elements need an
			// explicit `;` between them — without it the parser reports "JSX
			// expressions must have one parent element", which now fails this
			// guard loudly instead of silently walking a recovered tree.
			'<p>Password reset sent</p>;<button aria-label="Delete account">Delete account</button>;',
			'canary.tsx',
		);

		expect(findings).toContainEqual(
			expect.stringContaining('Password reset sent'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('aria-label="Delete account"'),
		);
	});

	// r5-tests-F2: four evasions different in shape from the round-4 canary
	// above — a custom (non-native) component tag, JSX text wrapped across
	// multiple lines, a copy-bearing attribute name outside the old
	// aria-label/placeholder/title allowlist, and a bare string literal sitting
	// directly as a JSX expression child with no attribute at all. The old
	// regex grammar found none of these; each is planted here, proven caught,
	// and this canary now guards the class instead of the one cited example.
	test('findHardcodedUiLiterals catches a custom component tag, multiline JSX text, an arbitrary copy prop, and a bare expression child (r5-tests-F2 canary)', () => {
		const findings = findHardcodedUiLiterals(
			// chore/908 follow-up: each top-level JSX statement needs its own
			// trailing `;` — a bare newline between adjacent JSX elements still
			// reads as "JSX expressions must have one parent element" to the
			// parser, which now fails this guard loudly instead of silently
			// walking a recovered tree.
			[
				'<Button>Delete account</Button>;',
				'<p>\n\tPassword reset sent\n</p>;',
				'<Empty description="No invitations yet" />;',
				"<span>{'Delete account'}</span>;",
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toContainEqual(expect.stringContaining('Delete account'));
		expect(findings).toContainEqual(
			expect.stringContaining('Password reset sent'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('description="No invitations yet"'),
		);
		expect(
			findings.some((finding) => finding.includes('JSX expression child')),
		).toBe(true);
	});

	// r5-shell-F2: the exact live regression this canary must never miss again
	// — a numeric-leading `code="500 — Server Error"` prop was invisible to
	// the round-4 detector's "must start with an uppercase letter" heuristic.
	test('findHardcodedUiLiterals catches a numeric-leading component prop (r5-shell-F2 canary)', () => {
		const findings = findHardcodedUiLiterals(
			'<AppErrorView code="500 — Server Error" />',
			'canary.tsx',
		);

		expect(findings).toContainEqual(
			expect.stringContaining('code="500 — Server Error"'),
		);
	});

	// W5-PROOF: isProseLikeLiteral's internal-whitespace requirement made any
	// single-word piece of real UI copy invisible everywhere — a large share
	// of real button/aria copy. Each of these single-word shapes must now be
	// caught in the definite-copy positions (JSX text, aria-label, title,
	// placeholder).
	test('findHardcodedUiLiterals catches single-word copy in aria-label, title, JSX text, and placeholder (W5-PROOF canary)', () => {
		const findings = findHardcodedUiLiterals(
			[
				'<button aria-label="Delete">X</button>;',
				'<span title="Cancel">X</span>;',
				'<Button>Delete</Button>;',
				'<input placeholder="Save" />;',
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toContainEqual(
			expect.stringContaining('aria-label="Delete"'),
		);
		expect(findings).toContainEqual(expect.stringContaining('title="Cancel"'));
		expect(findings).toContainEqual(
			expect.stringContaining('JSX text "Delete"'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('placeholder="Save"'),
		);
	});

	test('findHardcodedUiLiterals ignores CSS custom properties but flags ordinary titles', () => {
		const findings = findHardcodedUiLiterals(
			"const toast = { '--normal-text': 'var(--publy-foreground)', title: 'Delete account' };",
			'canary.tsx',
		);

		expect(findings).not.toContainEqual(
			expect.stringContaining('--normal-text'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('title: "Delete account"'),
		);
	});

	// W5-PROOF: the relaxed no-whitespace-required check for definite-copy
	// positions must not turn real, legitimate single-word technical values in
	// those SAME positions into false positives — a testId-shaped value, a
	// URL/email placeholder example, and the brand wordmark.
	test('findHardcodedUiLiterals does not flag testIds, URL/email placeholder examples, or the brand wordmark (W5-PROOF canary)', () => {
		const findings = findHardcodedUiLiterals(
			[
				'<button data-testid="delete-account-button">{t(\'delete\')}</button>;',
				'<input placeholder="user@example.com" />;',
				'<input placeholder="https://example.com" />;',
				'<img alt="PublyApp" />;',
				'<span>PublyApp</span>;',
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toEqual([]);
	});

	test('findHardcodedUiLiterals does not flag structural/enum props, t() calls, or the locale self-name allowlist', () => {
		const findings = findHardcodedUiLiterals(
			[
				'<Button variant="Outline" type="Submit" className="MyClass">{t(\'submit\')}</Button>;',
				"<span aria-label={t('submit')}>{t('submit')}</span>;",
				"const label = locale === 'fr' ? 'Français' : 'English';",
				// #330: component-specific styling props (`tileClassName`,
				// `rowClassName`) carry Tailwind values whose multi-word shape is
				// prose-like to the heuristic but are never user-visible copy.
				'<Skeleton rowClassName="h-9 w-full" />;',
				'<EntityHeader tileClassName="size-14 rounded-[10px]" />;',
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toEqual([]);
	});

	// W5-VERIFY2: all four of these evaded the pre-hardening detector — the
	// URL exemption was prefix-only, `emptyText`/`tooltip` weren't on the
	// hand-typed always-copy list, imperative DOM writes were outside the
	// AST visitor entirely, and only a `label:` object property was checked.
	test('findHardcodedUiLiterals catches copy trailing a URL, an arbitrary copy prop, imperative DOM writes, and a non-label object property (W5-VERIFY2 canary)', () => {
		const findings = findHardcodedUiLiterals(
			[
				'<button aria-label="https://example.com Delete account" />;',
				'<Widget emptyText="Empty" tooltip="Delete" />;',
				"element.title = 'Delete';",
				"element.setAttribute('aria-label', 'Cancel');",
				"export const verifyToastCopy = { title: 'Delete' };",
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toContainEqual(
			expect.stringContaining('https://example.com Delete account'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('emptyText="Empty"'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('tooltip="Delete"'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('title = "Delete"'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('setAttribute("aria-label", "Cancel")'),
		);
		expect(findings).toContainEqual(expect.stringContaining('title: "Delete"'));
	});

	// The URL/email exemption must still hold when the value IS purely a
	// URL/email/domain-path and nothing trails it — the anchoring fix must
	// not turn every legitimate placeholder into a false positive.
	test('findHardcodedUiLiterals still exempts a bare URL/email placeholder after the anchoring fix', () => {
		const findings = findHardcodedUiLiterals(
			[
				'<input placeholder="https://example.com" />;',
				'<input placeholder="user@example.com" />;',
				'<input placeholder="publyapp.com/free-trial" />;',
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toEqual([]);
	});

	// W5-HARDEN2 (W5-VERIFY3B report): the exact fixture the report planted —
	// a single-word component prop (`action`), assistive copy that happens to
	// be kebab-shaped (`aria-label`), and four direct DOM insertion sinks
	// (`innerHTML`, `insertAdjacentText`, `append`, `createTextNode` via
	// `appendChild`) — all sailed through undetected before this fix.
	test('findHardcodedUiLiterals catches a single-word unknown-prop action, kebab-shaped assistive copy, and direct DOM insertion sinks (W5-HARDEN2 canary)', () => {
		const findings = findHardcodedUiLiterals(
			[
				'const Widget = (_props: { action: string }) => null;',
				'const actionCopy = <Widget action="Delete" />;',
				'const assistiveCopy = <button aria-label="delete-selected-users" />;',
				"element.innerHTML = 'Delete account';",
				"element.insertAdjacentText('beforeend', 'Delete account');",
				"document.body.append('Delete account');",
				"document.body.appendChild(document.createTextNode('Delete account'));",
				'void actionCopy;',
				'void assistiveCopy;',
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toContainEqual(expect.stringContaining('action="Delete"'));
		expect(findings).toContainEqual(
			expect.stringContaining('aria-label="delete-selected-users"'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('innerHTML = "Delete account"'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('insertAdjacentText(..., "Delete account")'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('append("Delete account")'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('createTextNode("Delete account")'),
		);
	});

	// W5-HARDEN2: a normal UI view-model carrying a `status` enum ALONGSIDE
	// real title/description copy (a toast/banner) must not have that copy
	// exempted just because it also has a `status` key — the tightened
	// problem-details signature requires 2+ marker keys together, and `status`
	// alone is deliberately not enough. A genuine RFC 7807 problem-details
	// object (2+ markers) and a genuine <meta>/head() descriptor (a `content`
	// sibling) must still be exempted.
	test('findHardcodedUiLiterals flags an ordinary status+title+description UI object, but still exempts real problem-details and meta descriptors (W5-HARDEN2 canary)', () => {
		const findings = findHardcodedUiLiterals(
			[
				"export const bannerCopy = { status: 'warning', title: 'Delete account', description: 'Try again later' };",
				"export const problemDetails = { status: 401, responseStatusCode: 401, title: 'Unauthorized', detail: 'x' };",
				"export const metaDescriptor = { name: 'viewport', content: 'Delete account' };",
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toContainEqual(
			expect.stringContaining('title: "Delete account"'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('description: "Try again later"'),
		);
		expect(findings.some((finding) => finding.includes('Unauthorized'))).toBe(
			false,
		);
		expect(findings.some((finding) => finding.includes('metaDescriptor'))).toBe(
			false,
		);
	});

	// The kebab-key exemption must still protect the one shape it exists for —
	// an object-literal lookup TABLE whose values are i18n keys — even though
	// it no longer applies to JSX attributes/DOM sinks.
	test('findHardcodedUiLiterals still exempts a kebab-shaped i18n-key lookup table value in an object property (regression guard)', () => {
		const findings = findHardcodedUiLiterals(
			"const labels: Record<string, { subtitle: string }> = { a: { subtitle: 'accept-invitation-brand-subtitle-new-user' } };",
			'canary.tsx',
		);

		expect(findings).toEqual([]);
	});

	// FormData/URLSearchParams also expose a 2-argument `.append(name, value)`
	// method — the single-argument restriction on COPY_LIKE_SINGLE_ARG_DOM_CALL_NAMES
	// must not flag it as a DOM text-insertion sink.
	test('findHardcodedUiLiterals does not flag a 2-argument FormData/URLSearchParams-shaped .append() call', () => {
		const findings = findHardcodedUiLiterals(
			"formData.append('accountStatus', 'Delete account requested');",
			'canary.tsx',
		);

		expect(findings).toEqual([]);
	});

	// W6-GUARDS (shell F5 / tests F3): interpolated JSX children and attributes
	// were exempted entirely before this fix — different sink shapes than any
	// prior evasion (a template-literal JSX child, a template-literal
	// definite-copy attribute).
	test('findHardcodedUiLiterals catches interpolated template-literal copy at JSX children and attribute sinks (W6-GUARDS canary)', () => {
		const findings = findHardcodedUiLiterals(
			[
				'const count = 3;',
				'const name = "Jane";',
				'const child = <button>{`Delete ${count} users`}</button>;',
				'const attr = <button aria-label={`Delete ${name}`} />;',
				'void child;',
				'void attr;',
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toContainEqual(
			expect.stringContaining('JSX expression child {"Delete   users"}'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('aria-label={"Delete"}'),
		);
	});

	// W6-GUARDS (shell F5 / tests F3): string concatenation is a different
	// syntax shape from interpolation — a `+` chain, not a template literal —
	// and was equally exempted before this fix.
	test('findHardcodedUiLiterals catches string-concatenation copy at a definite-copy attribute sink (W6-GUARDS canary)', () => {
		const findings = findHardcodedUiLiterals(
			[
				'const name = "Jane";',
				"const attr = <button aria-label={'Delete ' + name} />;",
				'void attr;',
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toContainEqual(
			expect.stringContaining('aria-label={"Delete '),
		);
	});

	// W6-GUARDS (shell F5 / tests F3): a real interpolated usage that carries
	// NO static prose text at all (every span between interpolations is
	// empty/whitespace) must stay exempt — this is the shape the finding's own
	// "safe today" example described, and the fix must not turn it into a
	// false positive.
	test('findHardcodedUiLiterals still exempts an interpolation with no static prose text (regression guard)', () => {
		const findings = findHardcodedUiLiterals(
			[
				'const translatedGreeting = "Bonjour";',
				'const translatedName = "Jane";',
				'const child = <span>{`${translatedGreeting} ${translatedName}`}</span>;',
				'void child;',
			].join('\n'),
			'canary.tsx',
		);

		expect(findings).toEqual([]);
	});

	// W6-GUARDS (tests F4): `content` used to exempt ANY sibling object purely
	// by its own presence — an ordinary confirmation/toast view-model shaped
	// exactly like the finding's cited evasion.
	test('findHardcodedUiLiterals flags an ordinary title+content UI object that is not a real <meta> descriptor (W6-GUARDS canary)', () => {
		const findings = findHardcodedUiLiterals(
			"export const confirmCopy = { title: 'Delete account', content: 'This cannot be undone' };",
			'canary.tsx',
		);

		expect(findings).toContainEqual(
			expect.stringContaining('title: "Delete account"'),
		);
		expect(findings).toContainEqual(
			expect.stringContaining('content: "This cannot be undone"'),
		);
	});

	// W6-GUARDS (tests F4): a genuine `<meta>`/SEO descriptor (`content` paired
	// with `name`/`property`) must stay exempt — the fix narrows the marker,
	// it must not remove the real shape it protects.
	test('findHardcodedUiLiterals still exempts a real <meta>/SEO content+property pair (regression guard)', () => {
		const findings = findHardcodedUiLiterals(
			"export const ogTitle = { property: 'og:title', content: 'Delete account' };",
			'canary.tsx',
		);

		expect(findings).toEqual([]);
	});

	// W6-GUARDS (tests F4): an ordinary banner reusing exactly two
	// problem-shaped names (`status` + `detail`), with no API-contract-only
	// discriminator field, is real UI copy and must not collide with the RFC
	// 7807 signature.
	test('findHardcodedUiLiterals flags an ordinary status+detail banner that is not a real problem-details payload (W6-GUARDS canary)', () => {
		const findings = findHardcodedUiLiterals(
			"export const banner = { status: 'warning', detail: 'x', description: 'Try again later' };",
			'canary.tsx',
		);

		expect(findings).toContainEqual(
			expect.stringContaining('description: "Try again later"'),
		);
	});

	test('every t()/i18nKey literal resolves in its namespace in both locales', async () => {
		const usages = await extractI18nKeyUsages(srcDir);
		const missingEn: string[] = [];
		const missingFr: string[] = [];
		for (const [qualifiedKey, locations] of usages) {
			const [namespace, ...parts] = qualifiedKey.split(':');
			const key = parts.join(':');
			if (!resolvesInBundle(key, enResource[namespace as SupportedNamespace])) {
				missingEn.push(`${qualifiedKey} (${locations.join(', ')})`);
			}
			if (!resolvesInBundle(key, frResource[namespace as SupportedNamespace])) {
				missingFr.push(`${qualifiedKey} (${locations.join(', ')})`);
			}
		}
		expect(missingEn, 'keys missing from English namespace bundles').toEqual(
			[],
		);
		expect(missingFr, 'keys missing from French namespace bundles').toEqual([]);
	});

	// Namespace-qualified lookup-table values (`auth:some-key`) must be
	// extracted AND attributed to their declared namespace. This pins
	// STRING_LITERAL_PATTERN's `:` inclusion: without it a qualified value
	// matches NO quote-to-quote literal at all and silently drops out of
	// coverage instead of failing resolution (found by a red-proof canary
	// while reviewing #1267 — the guard passed vacuously).
	test('extractI18nKeyUsages attributes namespace-qualified KEYS-map values to their namespace', async () => {
		const usages = await extractI18nKeyUsages(srcDir);

		const headlineLocations =
			usages.get('auth:accept-invitation-brand-headline-mismatch') ?? [];
		expect(headlineLocations).toContain(
			'routes/_accept-invitation-i18n-keys.ts',
		);

		const ctaLocations =
			usages.get('auth:auth-invitation-log-out-and-sign-in') ?? [];
		expect(ctaLocations).toContain('routes/_accept-invitation-i18n-keys.ts');
	});

	// r3-tests-F6: a canary for the scalar-`*_KEY` extractor itself going
	// blind (e.g. a future refactor of SCALAR_KEY_DECLARATION_PATTERN that
	// stops matching real declarations) — without this, the extractor could
	// silently stop seeing data-table.tsx's `SELECTION_LOCKED_TITLE_KEY` and
	// the coverage test above would pass for the wrong reason (0 usages
	// found, not 0 missing keys).
	test('the scalar-*_KEY extractor still sees the r3-tests-F6 canary key', async () => {
		const usagesByKey = await extractI18nKeyUsages(srcDir);

		expect(usagesByKey.has('common:selection-locked-while-selecting')).toBe(
			true,
		);
	});

	// #973 BLOCKER finding #2: breadcrumb (and nav-item) declarations hold
	// their translation key as `labelKey: '...'`, resolved later through
	// `t(item.labelKey)` at a different call site entirely — a shape neither
	// KEY_PATTERNS nor the `*_KEY(S)` lookup-table extractors above ever
	// matched. Unit-tests the extractor in isolation against a small fixture
	// (same style as the findHardcodedUiLiterals canaries), independent of
	// what real route files currently declare.
	test('extractLabelKeyPropertyUsages sees breadcrumb-style labelKey literals, qualified and unqualified (#973 BLOCKER labelKey-coverage canary)', () => {
		const usagesByKey = new Map<string, string[]>();
		extractLabelKeyPropertyUsages(
			[
				"export const crumbs = () => [{ kind: 'label', labelKey: 'nav-tenants', to: '/staff/tenants' },",
				"{ kind: 'label', labelKey: 'staff-users:settings' }];",
			].join('\n'),
			'canary.tsx',
			usagesByKey,
		);

		expect(usagesByKey.has('common:nav-tenants')).toBe(true);
		expect(usagesByKey.has('staff-users:settings')).toBe(true);
	});

	// A `labelKey` value is only ever the property name that actually feeds
	// `t(item.labelKey)` (see app-shell.tsx) — an unrelated field that merely
	// happens to be spelled `labelKey` inside a `.d.ts`/interface member
	// (`labelKey: string;`, a `PropertySignature`, never a
	// `PropertyAssignment`) must not be read as a usage.
	test('extractLabelKeyPropertyUsages ignores a labelKey type/interface member, and a dynamic (non-literal) labelKey value', () => {
		const usagesByKey = new Map<string, string[]>();
		extractLabelKeyPropertyUsages(
			[
				'export type NavItem = { labelKey: string };',
				"const name = 'x';",
				'export const dynamic = { labelKey: `profile-icon-${name}` };',
			].join('\n'),
			'canary.ts',
			usagesByKey,
		);

		expect(usagesByKey.size).toBe(0);
	});

	// The exact BLOCKER escape, proven at the unit level: a real production
	// crumb's `labelKey` pointing at a key absent from both locale bundles
	// must be BOTH (a) recorded as a usage and (b) genuinely missing from the
	// bundle — together, that is exactly what makes the integration test
	// above ('every t()/i18nKey literal resolves...') fail for a labelKey
	// escape, the same way it already fails for a bare `t('...')` escape.
	// Self-contained (an inline fixture, not a real deleted key) so this
	// guard never depends on which keys the repo happens to have removed.
	test('a labelKey referencing a key absent from both locale bundles is recorded as a usage and genuinely unresolved (#973 BLOCKER regression guard)', () => {
		const usagesByKey = new Map<string, string[]>();
		extractLabelKeyPropertyUsages(
			"export const crumbs = () => [{ kind: 'label', labelKey: 'definitely-not-a-real-nav-key-973' }];",
			'canary.tsx',
			usagesByKey,
		);

		expect(usagesByKey.has('common:definitely-not-a-real-nav-key-973')).toBe(
			true,
		);
		expect(
			resolvesInBundle('definitely-not-a-real-nav-key-973', enResource.common),
		).toBe(false);
		expect(
			resolvesInBundle('definitely-not-a-real-nav-key-973', frResource.common),
		).toBe(false);
	});

	// Integration canary (same rationale as the scalar-*_KEY one above): proves
	// the extractor is actually wired into `extractI18nKeyUsages` and reaches
	// a real production breadcrumb declaration
	// (`nav-tenants`, `src/routes/authed/staff/tenants/$tenantId.tsx`), not
	// just the unit fixtures above.
	test('extractI18nKeyUsages sees a real production breadcrumb labelKey declaration (#973 BLOCKER labelKey-coverage integration canary)', async () => {
		const usagesByKey = await extractI18nKeyUsages(srcDir);

		expect(usagesByKey.has('common:nav-tenants')).toBe(true);
	});

	// Adversarial review IMPORTANT finding regression: a source the bundled
	// parser cannot finish parsing must never read as "found nothing". Before
	// this fix, planting a hardcoded JSX literal after an unterminated
	// template literal let the JSX get swallowed into the recovery tree and
	// the suite stayed green for the wrong reason — this canary proves the
	// guard now throws instead, naming the file.
	test('findHardcodedUiLiterals fails loudly, naming the file, when the bundled parser cannot finish parsing (parse-diagnostic canary)', () => {
		const unparseable = [
			'const broken = `unterminated template literal',
			'<p>Delete account</p>;',
		].join('\n');

		expect(() =>
			findHardcodedUiLiterals(unparseable, 'canary-unparseable.tsx'),
		).toThrow(/canary-unparseable\.tsx/);
	});

	// Regression guard for the script-kind selection above. This fixture has to
	// be grammar-discriminating or it guards nothing: a plain object literal
	// parses identically as TS and TSX, so it would stay green even if script
	// kind regressed to always-TSX. The leading `<T>` generic arrow is the
	// discriminating part — valid, unambiguous TypeScript in a real .ts file,
	// but an unclosed JSX tag under TSX grammar. A regression therefore either
	// throws on the parse diagnostics or recovers into a partial tree that no
	// longer contains the literal below. Both fail this test.
	test('findHardcodedUiLiterals catches a hardcoded literal in a .ts (non-JSX) production shape', () => {
		const findings = findHardcodedUiLiterals(
			[
				'const identity = <T>(value: T): T => value;',
				"export const confirmCopy = { title: 'Delete account' };",
				'void identity;',
			].join('\n'),
			'lib/some-file.ts',
		);

		expect(findings).toContainEqual(
			expect.stringContaining('title: "Delete account"'),
		);
	});

	test('no hardcoded English UI literal escapes t() (r3-shell-F2)', async () => {
		const files = await getSourceFiles(srcDir);
		const findings: string[] = [];

		for (const { absolutePath, relativePath, source } of files) {
			if (
				absolutePath.endsWith('.test.ts') ||
				absolutePath.endsWith('.test.tsx')
			) {
				continue;
			}

			findings.push(...findHardcodedUiLiterals(source, relativePath));
		}

		expect(findings, 'hardcoded English literals bypassing t()').toEqual([]);
	});

	// W6-FLAKE (#827) canary: the two whole-tree sweeps in this file
	// (`findHardcodedUiLiterals` here, `extractLabelKeyPropertyUsages` inside
	// `extractI18nKeyUsages`) must share one AST parse per distinct
	// (source, path) input instead of re-parsing the same production file per
	// walker. Re-parsing was pure wasted CPU that starved render workers under
	// external load (see vitest.config.ts's W6-FLAKE notes). The memoized
	// helper returns the SAME tree object for a repeated identical input, so
	// this pins sharing without touching any detection logic.
	test('the two whole-tree sweeps share one AST parse per distinct input (W6-FLAKE parse-sharing canary)', () => {
		const fixtureSource = [
			'export const confirmCopy = { title: "Delete account" };',
			'void confirmCopy;',
		].join('\n');

		const firstPass = findHardcodedUiLiterals(fixtureSource, 'canary.tsx');
		expect(firstPass).toContainEqual(
			expect.stringContaining('title: "Delete account"'),
		);
		const secondPass = findHardcodedUiLiterals(fixtureSource, 'canary.tsx');
		expect(secondPass).toContainEqual(
			expect.stringContaining('title: "Delete account"'),
		);

		const parsesAfterRepeat = parseCallCountForTestObservation();
		extractLabelKeyPropertyUsages(
			fixtureSource,
			'canary.tsx',
			new Map<string, string[]>(),
		);
		const labelKeyParses =
			parseCallCountForTestObservation() - parsesAfterRepeat;

		expect(
			labelKeyParses,
			'a third walk over an already-parsed (source, path) must reuse the memoized tree, not re-parse it',
		).toBe(0);
	});
});

describe('i18n-guard-ignore suppression requires a substantive reason', () => {
	// `isI18nGuardSuppressed` only inspects the line directly above the
	// offending line, so each fixture below is a two-line `lines` array.
	const notSuppressed = (previousLine: string) =>
		expect(isI18nGuardSuppressed([previousLine, "'Delete'"], 2)).toBe(false);

	test('rejects an empty JSX comment marker (`*/}` is not a reason)', () => {
		notSuppressed('{/* i18n-guard-ignore: */}');
	});

	test('rejects an empty line-comment marker', () => {
		notSuppressed('// i18n-guard-ignore:');
	});

	test('rejects an empty block-comment marker with trailing whitespace', () => {
		notSuppressed('/* i18n-guard-ignore:   */');
	});

	test('rejects a single-character non-reason', () => {
		notSuppressed('{/* i18n-guard-ignore: . */}');
	});

	test('rejects an empty JSX comment marker with trailing spaces', () => {
		notSuppressed('{/* i18n-guard-ignore: */}   ');
	});

	test('accepts a genuine reasoned suppression', () => {
		expect(
			isI18nGuardSuppressed(
				[
					'{/* i18n-guard-ignore: internal error payload field, never rendered raw */}',
					"'Delete'",
				],
				2,
			),
		).toBe(true);
	});

	// W5-VERIFY2 planted `{/* i18n-guard-ignore: 123 */}` and it suppressed the
	// violation. Same shared bar as data-honesty-ignore — see
	// suppression-reason.ts.
	test('rejects a digit-only noise reason', () => {
		notSuppressed('{/* i18n-guard-ignore: 123 456 789 */}');
	});

	test('rejects a repeated-character noise word', () => {
		notSuppressed('{/* i18n-guard-ignore: xxx */}');
	});

	test('rejects a punctuation-only noise reason', () => {
		notSuppressed('{/* i18n-guard-ignore: !!! --- ??? */}');
	});
});

describe('i18n-guard-ignore suppression sites match the committed inventory', () => {
	// W5-HARDEN: same structural backstop as the data-honesty-ignore
	// inventory check — every real suppression site under src/ must be
	// checked into suppression-inventory.json.
	test('every i18n-guard-ignore site under src is documented, and no inventory entry is stale', async () => {
		const files = await getSourceFiles(srcDir);
		const found: SuppressionSite[] = [];

		for (const { absolutePath, source } of files) {
			const relativePath = `src/${path.relative(srcDir, absolutePath).split(path.sep).join('/')}`;
			found.push(
				...findSuppressionSitesInSource(source, relativePath).filter(
					(site) => site.convention === 'i18n-guard-ignore',
				),
			);
		}

		const relevantInventory = (
			suppressionInventory as SuppressionSite[]
		).filter((site) => site.convention === 'i18n-guard-ignore');

		const { undocumented, stale } = diffSuppressionInventory(
			found,
			relevantInventory,
		);

		expect(undocumented, 'undocumented suppression sites').toEqual([]);
		expect(stale, 'stale inventory entries').toEqual([]);
	});
});
