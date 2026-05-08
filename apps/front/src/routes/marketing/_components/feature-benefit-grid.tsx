import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { MotionViewport } from '#app/components/animate/motion-viewport.tsx';
import {
	asHoverRoot,
	hoverLift,
} from '#app/components/animate/variants/hover.ts';
import { varFade } from '#app/components/animate/variants/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { MarketingEyebrow } from '#app/routes/marketing/_components/marketing-eyebrow.tsx';

// ----------------------------------------------------------------------

type FeatureBenefitGridItem = {
	id: string;
	title: string;
	body: string;
	icon: IconifyName;
};

type FeatureBenefitGridProps = {
	eyebrow: string;
	title: string;
	items: FeatureBenefitGridItem[];
};

// ----------------------------------------------------------------------

const BenefitCard = ({ item }: { item: FeatureBenefitGridItem }) => {
	const lift = hoverLift({ y: -4, scale: 1.01 });

	return (
		<Box
			component={m.div}
			{...asHoverRoot(lift)}
			sx={{
				p: 4,
				borderRadius: '20px',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				gap: 2,
			}}
		>
			<Box
				sx={{
					width: 48,
					height: 48,
					borderRadius: '12px',
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					bgcolor: 'primary.lighter',
					color: 'primary.main',
				}}
			>
				<Iconify icon={item.icon} width={24} />
			</Box>
			<Typography
				component="h3"
				sx={{
					fontSize: 18,
					fontWeight: 700,
					color: 'text.primary',
					m: 0,
				}}
			>
				{item.title}
			</Typography>
			<Typography
				sx={{
					fontSize: 14,
					color: 'text.secondary',
					lineHeight: 1.6,
				}}
			>
				{item.body}
			</Typography>
		</Box>
	);
};

// ----------------------------------------------------------------------

export const FeatureBenefitGrid = ({
	eyebrow,
	title,
	items,
}: FeatureBenefitGridProps) => {
	return (
		<Box
			component="section"
			sx={{ bgcolor: 'background.default', py: { xs: 8, md: 12 } }}
		>
			<Container maxWidth="lg" component={MotionViewport}>
				<Stack
					component={m.div}
					variants={varFade('inUp', { distance: 24 })}
					spacing={2}
					sx={{ mb: { xs: 5, md: 7 }, alignItems: 'flex-start' }}
				>
					<MarketingEyebrow label={eyebrow} />
					<Typography
						component="h2"
						sx={{
							fontSize: { xs: 28, md: 36 },
							fontWeight: 700,
							lineHeight: 1.15,
							letterSpacing: '-0.01em',
							color: 'text.primary',
							maxWidth: 640,
						}}
					>
						{title}
					</Typography>
				</Stack>

				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: '1fr',
							sm: 'repeat(2, 1fr)',
							lg: 'repeat(3, 1fr)',
						},
						gap: 3,
					}}
				>
					{items.map((item) => {
						return (
							<Box
								key={item.id}
								component={m.div}
								variants={varFade('inUp', { distance: 24 })}
							>
								<BenefitCard item={item} />
							</Box>
						);
					})}
				</Box>
			</Container>
		</Box>
	);
};
