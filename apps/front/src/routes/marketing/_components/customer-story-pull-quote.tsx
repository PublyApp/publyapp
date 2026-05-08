import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { MotionViewport } from '#app/components/animate/motion-viewport.tsx';
import { varFade } from '#app/components/animate/variants/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { Image } from '#app/components/image/image.tsx';
import {
	customerStoryQuoteAvatar,
	type CustomerStoryQuote,
} from '#app/routes/marketing/_data/customer-stories.ts';

// ----------------------------------------------------------------------

// Pull quote card with a giant translucent quote-mark glyph in the
// background — direct port of the canvas idiom. Sized to drop between
// narrative blocks; the consumer (`CustomerStoryNarrative`) controls
// vertical spacing.

// ----------------------------------------------------------------------

type CustomerStoryPullQuoteProps = {
	quote: CustomerStoryQuote;
};

export const CustomerStoryPullQuote = ({
	quote,
}: CustomerStoryPullQuoteProps) => {
	const avatarUrl = customerStoryQuoteAvatar(quote.authorPhotoSlug);

	return (
		<Box component={MotionViewport} sx={{ my: { xs: 6, md: 8 } }}>
			<Box
				component={m.div}
				variants={varFade('inUp', { distance: 24 })}
				sx={{
					position: 'relative',
					p: { xs: 4, md: 5 },
					borderRadius: '24px',
					bgcolor: 'background.paper',
					border: '1px solid',
					borderColor: 'divider',
					boxShadow: '0 1px 2px rgba(17,24,39,0.04)',
					overflow: 'hidden',
				}}
			>
				{/* Background quote glyph — purely decorative */}
				<Box
					aria-hidden="true"
					sx={{
						position: 'absolute',
						top: -12,
						left: -8,
						pointerEvents: 'none',
						transform: 'rotate(-6deg)',
						color: 'primary.main',
						opacity: 0.1,
					}}
				>
					<Iconify icon="ph:quotes-fill" width={120} />
				</Box>

				<Stack spacing={4} sx={{ position: 'relative' }}>
					<Typography
						component="blockquote"
						sx={{
							m: 0,
							fontSize: { xs: 18, md: 22 },
							fontWeight: 500,
							color: 'text.primary',
							lineHeight: 1.45,
							fontStyle: 'italic',
						}}
					>
						&ldquo;{quote.body}&rdquo;
					</Typography>

					<Stack direction="row" spacing={2} alignItems="center">
						<Image
							src={avatarUrl}
							alt={quote.authorName}
							ratio="1/1"
							sx={{
								width: 56,
								flexShrink: 0,
								borderRadius: '50%',
								overflow: 'hidden',
								border: '2px solid',
								borderColor: 'background.paper',
								boxShadow: '0 2px 8px rgba(17,24,39,0.08)',
							}}
						/>
						<Box>
							<Typography
								sx={{
									fontSize: 15,
									fontWeight: 700,
									color: 'text.primary',
								}}
							>
								{quote.authorName}
							</Typography>
							<Typography
								sx={{
									fontSize: 13,
									color: 'text.secondary',
								}}
							>
								{quote.authorRole}
							</Typography>
						</Box>
					</Stack>
				</Stack>
			</Box>
		</Box>
	);
};
