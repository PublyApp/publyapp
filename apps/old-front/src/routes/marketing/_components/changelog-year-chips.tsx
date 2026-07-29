import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';

import { RouterLink } from '#app/components/router-link.tsx';

// ----------------------------------------------------------------------

type ChangelogYearChipsProps = {
	years: number[]; // available years, sorted desc
	activeYear: number;
	// Visually flag a duplicate placement (e.g. bottom of timeline) so we
	// can give it a top divider without affecting the primary placement.
	variant?: 'top' | 'bottom';
};

export const ChangelogYearChips = ({
	years,
	activeYear,
	variant = 'top',
}: ChangelogYearChipsProps) => {
	// Bottom-chip clicks happen far below the viewport top — without an
	// explicit reset the new year's page would render with the user
	// scrolled deep into the previous year's entries. Always pull them
	// back to the hero so the year switch feels intentional.
	const handleChipClick = () => {
		window.scrollTo({ top: 0, behavior: 'auto' });
	};

	// Only one year worth navigating between → render nothing. Saves a
	// noisy single-pill row when the catalogue is small.
	if (years.length <= 1) {
		return null;
	}

	return (
		<Tabs
			value={activeYear}
			variant="scrollable"
			scrollButtons="auto"
			allowScrollButtonsMobile
			role="navigation"
			aria-label="Changelog year navigation"
			// Hide MUI's default underline indicator — the pill background
			// fills the active-state role instead.
			slotProps={{ indicator: { sx: { display: 'none' } } }}
			sx={{
				// Override the Tabs container's default 48px minHeight; pills
				// are smaller than stock Material tabs.
				minHeight: 0,
				px: 2,
				...(variant === 'top'
					? { mb: { xs: 6, md: 8 } }
					: {
							mt: { xs: 4, md: 6 },
							mb: { xs: 2, md: 4 },
							pt: { xs: 4, md: 5 },
							borderTop: '1px dashed',
							borderTopColor: 'divider',
						}),
				'& .MuiTabs-flexContainer': {
					gap: 1,
					// `safe center` is the trick here: center when content fits,
					// fall back to flex-start when it overflows. Plain `center`
					// pushes overflow into negative offsets that scrollLeft
					// can't reach, leaving leftmost chips visually trapped
					// behind the scroll-arrow boundary.
					justifyContent: 'safe center',
				},
				'& .MuiTabScrollButton-root': {
					width: 32,
					color: 'text.secondary',
					'&.Mui-disabled': { opacity: 0 },
				},
			}}
		>
			{years.map((year) => {
				return (
					<Tab
						key={year}
						value={year}
						label={year}
						component={RouterLink}
						href={`/changelog/${year}`}
						onClick={handleChipClick}
						disableRipple
						sx={{
							flex: '0 0 auto',
							// Reset MUI Tab defaults that fight pill styling.
							minHeight: 0,
							minWidth: 0,
							textTransform: 'none',
							p: 0,
							// Pill body — mirrors the pre-Tabs version.
							px: 2.25,
							py: '8px',
							borderRadius: '10px',
							fontSize: 13,
							fontWeight: 700,
							lineHeight: 1,
							letterSpacing: '0.02em',
							// Tabular figures so 2025 / 2026 / 2024 / etc. all align
							// to identical glyph widths — no shifting between chips.
							fontVariantNumeric: 'tabular-nums',
							textDecoration: 'none',
							border: '1px solid',
							borderColor: 'divider',
							bgcolor: 'background.paper',
							color: 'text.primary',
							boxShadow: '0 1px 2px 0 rgba(0,0,0,0.04)',
							transition:
								'background-color 200ms ease, color 200ms ease, border-color 200ms ease',
							'&:hover': { bgcolor: 'background.neutral' },
							'&.Mui-selected': {
								borderColor: 'primary.main',
								bgcolor: 'primary.main',
								color: 'common.white',
								boxShadow: '0 6px 16px 0 rgba(16,185,129,0.25)',
								'&:hover': { bgcolor: 'primary.main' },
							},
							'&.Mui-focusVisible': {
								outline: '2px solid',
								outlineColor: 'primary.main',
								outlineOffset: 2,
							},
						}}
					/>
				);
			})}
		</Tabs>
	);
};
