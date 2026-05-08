import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { varFade } from '#app/components/animate/variants/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { Image } from '#app/components/image/image.tsx';
import type { ComparisonTestimonial } from '#app/routes/marketing/_data/comparisons.ts';

// ----------------------------------------------------------------------

type ComparisonTestimonialCardProps = {
	testimonial: ComparisonTestimonial;
	badgeLabel: string;
};

// ----------------------------------------------------------------------

const RatingRow = ({ rating }: { rating: 1 | 2 | 3 | 4 | 5 }) => {
	const stars = Array.from({ length: rating }, (_, i) => {
		return i;
	});
	return (
		<Stack direction="row" spacing={0.25} sx={{ mb: 3 }}>
			{stars.map((i) => {
				return (
					<Iconify
						key={i}
						icon="ph:star-fill"
						width={16}
						sx={{ color: 'warning.main' }}
					/>
				);
			})}
		</Stack>
	);
};

// ----------------------------------------------------------------------

export const ComparisonTestimonialCard = ({
	testimonial,
	badgeLabel,
}: ComparisonTestimonialCardProps) => {
	return (
		<Box
			component={m.div}
			variants={varFade('inUp', { distance: 24 })}
			sx={{
				position: 'relative',
				p: { xs: 3, md: 4 },
				borderRadius: '20px',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				boxShadow: '0 1px 2px 0 rgba(17,24,39,0.04)',
				overflow: 'visible',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<Iconify
				icon="ph:quotes-fill"
				width={48}
				sx={{
					position: 'absolute',
					top: 24,
					right: 24,
					color: 'text.disabled',
					opacity: 0.18,
					pointerEvents: 'none',
				}}
			/>

			<RatingRow rating={testimonial.rating} />

			<Typography
				component="blockquote"
				sx={{
					fontSize: 15,
					fontWeight: 500,
					color: 'text.primary',
					lineHeight: 1.65,
					m: 0,
					mb: 4,
					flex: 1,
					position: 'relative',
					zIndex: 1,
				}}
			>
				&ldquo;{testimonial.quote}&rdquo;
			</Typography>

			<Box
				sx={{
					height: '1px',
					bgcolor: 'divider',
					width: '100%',
					mb: 3,
				}}
			/>

			<Stack direction="row" spacing={2} alignItems="center">
				<Box
					sx={{
						width: 48,
						height: 48,
						borderRadius: '50%',
						overflow: 'hidden',
						flexShrink: 0,
						bgcolor: 'background.neutral',
					}}
				>
					<Image
						src={testimonial.authorAvatarUrl}
						alt={testimonial.authorName}
						ratio="1/1"
					/>
				</Box>
				<Box>
					<Typography
						sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}
					>
						{testimonial.authorName}
					</Typography>
					<Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
						{testimonial.authorRole}
					</Typography>
				</Box>
			</Stack>

			<Box
				sx={{
					position: 'absolute',
					bottom: -12,
					right: 24,
					bgcolor: 'grey.800',
					color: 'common.white',
					fontSize: 10,
					fontWeight: 700,
					textTransform: 'uppercase',
					letterSpacing: '0.12em',
					px: 1.5,
					py: 0.5,
					borderRadius: 999,
					boxShadow: '0 4px 8px -2px rgba(17,24,39,0.18)',
				}}
			>
				{badgeLabel}
			</Box>
		</Box>
	);
};
