import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';

// ----------------------------------------------------------------------

export const ChangelogSubscribeBand = () => {
	return (
		<Box
			sx={{
				mt: { xs: 6, md: 10 },
				p: { xs: 4, md: 5 },
				borderRadius: '20px',
				border: '1px solid',
				borderColor: 'divider',
				bgcolor: 'background.neutral',
			}}
		>
			<Stack
				direction={{ xs: 'column', md: 'row' }}
				alignItems={{ xs: 'flex-start', md: 'center' }}
				justifyContent="space-between"
				spacing={{ xs: 3, md: 5 }}
			>
				<Stack
					direction={{ xs: 'column', sm: 'row' }}
					alignItems={{ xs: 'flex-start', sm: 'center' }}
					spacing={2}
					sx={{ flex: 1 }}
				>
					<Box
						sx={{
							width: 48,
							height: 48,
							borderRadius: '50%',
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							bgcolor: 'background.paper',
							color: 'primary.main',
							border: '1px solid',
							borderColor: 'divider',
							flexShrink: 0,
						}}
					>
						<Iconify icon="ph:envelope-bold" width={20} />
					</Box>
					<Box>
						<Typography
							component="p"
							sx={{ fontSize: 18, fontWeight: 700, color: 'text.primary' }}
						>
							Get the changelog in your inbox
						</Typography>
						<Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
							One email per release. Zero marketing fluff.
						</Typography>
					</Box>
				</Stack>

				<Box
					component="form"
					onSubmit={(e: React.FormEvent) => {
						e.preventDefault();
					}}
					sx={{
						display: 'flex',
						gap: 1,
						width: { xs: '100%', md: 'auto' },
						minWidth: { md: 360 },
					}}
				>
					<Box
						component="input"
						type="email"
						placeholder="you@company.com"
						aria-label="Email address"
						required
						sx={{
							flex: 1,
							py: 1.25,
							px: 1.75,
							fontSize: 14,
							borderRadius: '12px',
							border: '1px solid',
							borderColor: 'divider',
							bgcolor: 'background.paper',
							color: 'text.primary',
							outline: 'none',
							transition: 'border-color 200ms ease, box-shadow 200ms ease',
							'&:focus': {
								borderColor: 'primary.main',
								boxShadow: '0 0 0 3px rgba(16,185,129,0.15)',
							},
						}}
					/>
					<Box
						component="button"
						type="submit"
						sx={{
							py: 1.25,
							px: 2.5,
							fontSize: 14,
							fontWeight: 700,
							borderRadius: '12px',
							border: 'none',
							cursor: 'pointer',
							bgcolor: 'text.primary',
							color: 'background.paper',
							transition: 'opacity 200ms ease',
							'&:hover': { opacity: 0.85 },
						}}
					>
						Subscribe
					</Box>
				</Box>
			</Stack>
		</Box>
	);
};
