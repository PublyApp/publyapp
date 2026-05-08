import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type { ShippedItem } from '#app/routes/marketing/_data/roadmap.ts';

// ----------------------------------------------------------------------

const formatDate = (iso: string): string => {
	const d = new Date(iso);
	return d
		.toLocaleDateString('en-US', {
			month: 'short',
			day: '2-digit',
			year: 'numeric',
		})
		.replace(',', '');
};

// ----------------------------------------------------------------------

type RoadmapShippedTimelineProps = {
	items: ShippedItem[];
};

export const RoadmapShippedTimeline = ({
	items,
}: RoadmapShippedTimelineProps) => {
	return (
		<Box sx={{ position: 'relative' }}>
			{/* Central dashed vertical line — only on md+. */}
			<Box
				aria-hidden="true"
				sx={{
					display: { xs: 'none', md: 'block' },
					position: 'absolute',
					top: 8,
					bottom: 8,
					left: '50%',
					width: '1px',
					transform: 'translateX(-50%)',
					backgroundImage: (theme) => {
						return `linear-gradient(to bottom, ${theme.vars.palette.divider} 50%, transparent 50%)`;
					},
					backgroundSize: '1px 12px',
				}}
			/>

			<Stack spacing={6}>
				{items.map((item, index) => {
					const isFirst = index === 0;
					// Alternate side on md+: even index → right, odd index → left.
					const sideRight = index % 2 === 0;

					return (
						<Box
							key={item.id}
							sx={{
								display: 'grid',
								gridTemplateColumns: { xs: '1fr', md: '1fr auto 1fr' },
								alignItems: 'center',
								columnGap: { md: 4 },
								rowGap: 2,
								position: 'relative',
							}}
						>
							{/* Left content — desktop only */}
							<Box
								sx={{
									display: { xs: 'none', md: 'block' },
									gridColumn: { md: '1 / 2' },
									pr: 4,
									textAlign: 'right',
									order: { md: sideRight ? 1 : 3 },
								}}
							>
								{sideRight ? (
									<Typography
										sx={{
											fontSize: 13,
											fontWeight: 600,
											color: 'text.secondary',
										}}
									>
										{formatDate(item.dateIso)}
									</Typography>
								) : (
									<EntryCard item={item} />
								)}
							</Box>

							{/* Center node dot */}
							<Box
								sx={{
									display: { xs: 'none', md: 'flex' },
									gridColumn: { md: '2 / 3' },
									order: { md: 2 },
									justifyContent: 'center',
									alignItems: 'center',
								}}
							>
								<Box
									aria-hidden="true"
									sx={{
										width: 14,
										height: 14,
										borderRadius: '50%',
										bgcolor: isFirst ? 'primary.main' : 'text.disabled',
										border: '4px solid',
										borderColor: 'background.default',
										boxShadow: '0 1px 2px rgba(17,24,39,0.06)',
									}}
								/>
							</Box>

							{/* Right content — desktop only */}
							<Box
								sx={{
									display: { xs: 'none', md: 'block' },
									gridColumn: { md: '3 / 4' },
									pl: 4,
									order: { md: sideRight ? 3 : 1 },
								}}
							>
								{sideRight ? (
									<EntryCard item={item} />
								) : (
									<Typography
										sx={{
											fontSize: 13,
											fontWeight: 600,
											color: 'text.secondary',
										}}
									>
										{formatDate(item.dateIso)}
									</Typography>
								)}
							</Box>

							{/* Mobile: stacked card with date inline */}
							<Box
								sx={{
									display: { xs: 'block', md: 'none' },
									gridColumn: '1 / -1',
								}}
							>
								<EntryCard item={item} showDate />
							</Box>
						</Box>
					);
				})}
			</Stack>
		</Box>
	);
};

// ----------------------------------------------------------------------

type EntryCardProps = {
	item: ShippedItem;
	showDate?: boolean;
};

const EntryCard = ({ item, showDate = false }: EntryCardProps) => {
	return (
		<Box
			sx={{
				p: 3,
				borderRadius: '20px',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				boxShadow: '0 1px 2px rgba(17,24,39,0.04)',
				textAlign: 'left',
			}}
		>
			{showDate ? (
				<Typography
					sx={{
						fontSize: 12,
						fontWeight: 700,
						color: 'primary.main',
						textTransform: 'uppercase',
						letterSpacing: '0.06em',
						mb: 1,
					}}
				>
					{formatDate(item.dateIso)}
				</Typography>
			) : null}
			<Typography
				component="h3"
				sx={{
					fontSize: 17,
					fontWeight: 700,
					color: 'text.primary',
					mb: 1,
					lineHeight: 1.3,
				}}
			>
				{item.title}
			</Typography>
			<Typography
				sx={{
					fontSize: 14,
					color: 'text.secondary',
					lineHeight: 1.55,
				}}
			>
				{item.description}
			</Typography>
		</Box>
	);
};
