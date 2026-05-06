import Box from '@mui/material/Box';
import { useEffect, useRef } from 'react';

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
	// Auto-scroll the active chip into view on mobile, where the row
	// scrolls horizontally instead of wrapping. Without this the active
	// year can be off-screen on a narrow viewport with many years.
	const activeChipRef = useRef<HTMLAnchorElement | null>(null);
	useEffect(() => {
		activeChipRef.current?.scrollIntoView({
			behavior: 'auto',
			inline: 'center',
			block: 'nearest',
		});
	}, [activeYear]);

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
		<Box
			role="navigation"
			aria-label="Changelog year navigation"
			sx={{
				display: 'flex',
				flexDirection: 'row',
				gap: 1,
				flexWrap: { xs: 'nowrap', md: 'wrap' },
				overflowX: { xs: 'auto', md: 'visible' },
				justifyContent: { xs: 'flex-start', md: 'center' },
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
				// Snap chips to center on mobile scroll for a tidy land.
				scrollSnapType: { xs: 'x mandatory', md: 'none' },
				// Hide the scrollbar visually while keeping the row scrollable.
				scrollbarWidth: 'none',
				'&::-webkit-scrollbar': { display: 'none' },
			}}
		>
			{years.map((year) => {
				const active = year === activeYear;
				return (
					<Box
						key={year}
						ref={active ? activeChipRef : undefined}
						component={RouterLink}
						href={`/changelog/${year}`}
						aria-current={active ? 'page' : undefined}
						onClick={handleChipClick}
						sx={{
							flex: '0 0 auto',
							scrollSnapAlign: 'center',
							display: 'inline-flex',
							alignItems: 'center',
							px: 2.25,
							py: '8px',
							borderRadius: '10px',
							fontSize: 13,
							fontWeight: 700,
							lineHeight: 1,
							letterSpacing: '0.02em',
							// Tabular figures so 2025 / 2026 / 2024 / etc. all align to
							// identical glyph widths — no shifting between chips.
							fontVariantNumeric: 'tabular-nums',
							textDecoration: 'none',
							border: '1px solid',
							borderColor: active ? 'primary.main' : 'divider',
							bgcolor: active ? 'primary.main' : 'background.paper',
							color: active ? 'common.white' : 'text.primary',
							boxShadow: active
								? '0 6px 16px 0 rgba(16,185,129,0.25)'
								: '0 1px 2px 0 rgba(0,0,0,0.04)',
							transition:
								'background-color 200ms ease, color 200ms ease, border-color 200ms ease',
							'&:hover': active ? undefined : { bgcolor: 'background.neutral' },
						}}
					>
						{year}
					</Box>
				);
			})}
		</Box>
	);
};
