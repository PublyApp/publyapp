import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';

import { RouterLink } from '#app/components/router-link.tsx';

// ----------------------------------------------------------------------

type ChangelogYearChipsProps = {
	years: number[]; // available years, sorted desc
	activeYear: number;
};

export const ChangelogYearChips = ({
	years,
	activeYear,
}: ChangelogYearChipsProps) => {
	// Only one year worth navigating between → render nothing. Saves a
	// noisy single-pill row when the catalogue is small.
	if (years.length <= 1) {
		return null;
	}

	return (
		<Stack
			direction="row"
			spacing={1}
			justifyContent="center"
			sx={{ flexWrap: 'wrap', mb: { xs: 6, md: 8 }, px: 2 }}
			role="navigation"
			aria-label="Changelog year navigation"
		>
			{years.map((year) => {
				const active = year === activeYear;
				return (
					<Box
						key={year}
						component={RouterLink}
						href={`/changelog/${year}`}
						aria-current={active ? 'page' : undefined}
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							px: 2,
							py: '6px',
							borderRadius: '10px',
							fontSize: 12,
							fontWeight: 600,
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
		</Stack>
	);
};
