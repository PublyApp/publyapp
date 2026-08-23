/**
 * Allowlist of every legitimate --publy-foreground-subtle consumer.
 *
 * Key is selector / class fragment — NOT file:line — so moving code does
 * not break the guard but adding a new site does. Each entry carries a
 * reason proving it is NOT standalone body text (placeholder, decorative
 * icon, eyebrow/label/helper, or inline metadata).
 *
 * The guard in subtle-foreground-body-guard.test.ts reads the REAL source
 * files (app.css plus src TSX files) and fails when a subtle consumer is found
 * outside this list whose context is body-size standalone text.
 */

export type SubtleAllowlistEntry = {
	selector: string;
	kind: 'placeholder' | 'icon' | 'eyebrow' | 'helper' | 'inline-meta' | 'label';
	reason: string;
	/** Optional file hint for TSX sites that share a generic class fragment. */
	file?: string;
};

export const SUBTLE_FOREGROUND_ALLOWLIST: readonly SubtleAllowlistEntry[] = [
	{
		selector: '.app-shell-search-icon',
		kind: 'icon',
		reason:
			'Decorative 14px magnifier inside the secondary panel search field, not readable text.',
	},
	{
		selector: '.app-shell-search-input::placeholder',
		kind: 'placeholder',
		reason:
			'Input placeholder — deliberately de-emphasised, never standalone body copy.',
	},
	{
		selector: '.app-shell-secondary-nav-count',
		kind: 'label',
		reason: '11px count badge in the secondary nav — small label, not body.',
	},
	{
		selector: '.publy-type-helper',
		kind: 'helper',
		reason: '12px helper text pinned to subtle intentionally (conventions.md).',
	},
	{
		selector: '.publy-form-action-bar-status',
		kind: 'helper',
		reason: '12px form action bar status line — helper, not body.',
	},
	{
		selector: '.publy-field-helper',
		kind: 'helper',
		reason:
			'12px field helper pinned to subtle intentionally (conventions.md).',
	},
	{
		selector: '.publy-type-eyebrow',
		kind: 'eyebrow',
		reason:
			'11px uppercase eyebrow label pinned to subtle intentionally (conventions.md).',
	},
	{
		selector: '.publy-tenant-identity-meta-prefix',
		kind: 'inline-meta',
		reason:
			'Inline separator prefix inside a 13px metadata row — accompanies readable content, not standalone.',
	},
	{
		selector: '.publy-stat-card-secondary',
		kind: 'label',
		reason:
			'11px secondary stat row — small metadata label under the stat value, not body.',
	},
	{
		selector: '.publy-search-icon',
		kind: 'icon',
		reason: 'Decorative 15px search icon in the table toolbar, not text.',
	},
	{
		selector: ".publy-search-wrapper [data-slot='input']::placeholder",
		kind: 'placeholder',
		reason: 'Table search input placeholder — same role as shell placeholder.',
	},
	{
		selector: ".publy-data-table [data-slot='table-header-icon']",
		kind: 'icon',
		reason: '14px sort/filter header icon inside the table header, not text.',
	},
	{
		selector: ".publy-data-table [data-slot='table-sort-icon']",
		kind: 'icon',
		reason: '12px sort direction icon inside the table header, not text.',
	},
	// TSX sites — keyed by file + class fragment so a move within the file does not break.
	{
		selector: 'text-[11px] text-[var(--publy-foreground-subtle)]',
		kind: 'label',
		reason:
			'11px permission count badge inside PermGroup header — small label.',
		file: 'src/routes/authed/staff/profiles/$profileId/_permission-matrix.tsx',
	},
	{
		selector: 'font-normal text-[var(--publy-foreground-subtle)]',
		kind: 'inline-meta',
		reason:
			'Inline "Members · count" suffix accompanying the 14px card title — inline metadata, not standalone paragraph.',
		file: 'src/routes/authed/staff/profiles/$profileId.tsx',
	},
] as const;
