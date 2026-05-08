import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { CustomerStory } from '#app/routes/marketing/_data/customer-stories.ts';

// ----------------------------------------------------------------------

// Sticky "About {customer}" sidebar card. On `lg+` it sticks below the
// topbar; on smaller breakpoints it drops below the narrative (the
// outer narrative grid handles ordering — this component only owns the
// card's own visual treatment).

// ----------------------------------------------------------------------

type CustomerStoryAboutAsideProps = {
	customerName: string;
	customerWordmark: string;
	about: CustomerStory['about'];
};

export const CustomerStoryAboutAside = ({
	customerName,
	customerWordmark,
	about,
}: CustomerStoryAboutAsideProps) => {
	return (
		<Box
			sx={{
				p: { xs: 3, md: 4 },
				borderRadius: '20px',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				boxShadow: '0 1px 2px rgba(17,24,39,0.04)',
			}}
		>
			<Box
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: 64,
					height: 64,
					mb: 3,
					borderRadius: '12px',
					bgcolor: 'background.default',
					border: '1px solid',
					borderColor: 'divider',
				}}
			>
				<Typography
					sx={{
						fontSize: 18,
						fontWeight: 700,
						color: 'text.primary',
						letterSpacing: '-0.04em',
					}}
				>
					{customerWordmark}
				</Typography>
			</Box>

			<Typography
				component="h4"
				sx={{
					fontSize: 18,
					fontWeight: 700,
					color: 'text.primary',
					mb: 1.5,
				}}
			>
				About {customerName}
			</Typography>

			<Typography
				sx={{
					fontSize: 14,
					color: 'text.secondary',
					lineHeight: 1.6,
					mb: 3,
				}}
			>
				{about.summary}
			</Typography>

			<Stack spacing={0}>
				{about.facts.map((fact) => {
					return (
						<Stack
							key={fact.label}
							direction="row"
							alignItems="center"
							justifyContent="space-between"
							spacing={2}
							sx={{
								py: 1.5,
								borderTop: '1px solid',
								borderTopColor: 'divider',
							}}
						>
							<Stack
								direction="row"
								spacing={1}
								alignItems="center"
								sx={{ color: 'text.secondary' }}
							>
								<Iconify icon={fact.iconName} width={16} />
								<Typography sx={{ fontSize: 13 }}>{fact.label}</Typography>
							</Stack>
							<Typography
								sx={{
									fontSize: 13,
									fontWeight: 600,
									color: 'text.primary',
								}}
							>
								{fact.value}
							</Typography>
						</Stack>
					);
				})}

				<Box
					sx={{
						pt: 2,
						mt: 0.5,
						borderTop: '1px solid',
						borderTopColor: 'divider',
					}}
				>
					<Stack
						direction="row"
						spacing={1}
						alignItems="center"
						sx={{ color: 'text.secondary', mb: 1.5 }}
					>
						<Iconify icon="ph:lightning-fill" width={16} />
						<Typography sx={{ fontSize: 13 }}>Integrated tools</Typography>
					</Stack>
					<Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
						{about.integratedTools.map((tool) => {
							return (
								<Box
									key={tool}
									sx={{
										px: 1.25,
										py: 0.5,
										borderRadius: '6px',
										bgcolor: 'background.default',
										border: '1px solid',
										borderColor: 'divider',
										fontSize: 12,
										fontWeight: 500,
										color: 'text.primary',
									}}
								>
									{tool}
								</Box>
							);
						})}
					</Stack>
				</Box>
			</Stack>
		</Box>
	);
};
