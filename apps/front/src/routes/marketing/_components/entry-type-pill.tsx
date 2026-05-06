import Box from '@mui/material/Box';

// ----------------------------------------------------------------------

export type ChangelogEntryType =
	| 'feature'
	| 'improvement'
	| 'fix'
	| 'performance'
	| 'security'
	| 'breaking'
	| 'deprecation'
	| 'documentation';

// Visual contract per entry type. Backgrounds tap MUI semantic palette
// where it fits ('error' / 'info' / 'secondary' / 'primary'); 'breaking'
// uses a hardcoded amber (#D97706) added to the marketing-surface-
// conventions.md "approved hardcoded-color exceptions" list.
const ENTRY_TYPE_VISUALS: Record<
	ChangelogEntryType,
	{ bg: string; color: string; label: string }
> = {
	feature: { bg: 'primary.main', color: 'common.white', label: 'Feature' },
	improvement: { bg: 'info.lighter', color: 'info.dark', label: 'Improvement' },
	fix: { bg: 'background.neutral', color: 'text.primary', label: 'Fix' },
	performance: {
		bg: 'secondary.lighter',
		color: 'secondary.dark',
		label: 'Performance',
	},
	security: { bg: 'error.lighter', color: 'error.dark', label: 'Security' },
	// `#D97706` — approved hardcoded color (see marketing-surface-conventions).
	breaking: { bg: '#D97706', color: 'common.white', label: 'Breaking' },
	deprecation: {
		bg: 'text.disabled',
		color: 'common.white',
		label: 'Deprecation',
	},
	documentation: { bg: 'info.lighter', color: 'info.dark', label: 'Docs' },
};

type EntryTypePillProps = {
	type: ChangelogEntryType;
};

export const EntryTypePill = ({ type }: EntryTypePillProps) => {
	const v = ENTRY_TYPE_VISUALS[type];

	return (
		<Box
			component="span"
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				px: '8px',
				py: '2px',
				borderRadius: '6px',
				fontSize: 10,
				fontWeight: 700,
				letterSpacing: '0.05em',
				textTransform: 'uppercase',
				bgcolor: v.bg,
				color: v.color,
			}}
		>
			{v.label}
		</Box>
	);
};
