import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { varAlpha } from 'minimal-shared/utils';

import { MotionViewport } from '#app/components/animate/motion-viewport.tsx';
import { varFade } from '#app/components/animate/variants/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';

// ----------------------------------------------------------------------

type FeatureQuoteProps = {
	body: string;
	authorName: string;
	authorRole: string;
	authorAvatarUrl: string;
};

// ----------------------------------------------------------------------

export const FeatureQuote = ({
	body,
	authorName,
	authorRole,
	authorAvatarUrl,
}: FeatureQuoteProps) => {
	return (
		<Box
			component="section"
			sx={{ py: { xs: 8, md: 12 }, bgcolor: 'background.default' }}
		>
			<Container maxWidth="md" component={MotionViewport}>
				<Box
					component={m.div}
					variants={varFade('inUp', { distance: 24 })}
					sx={(theme) => ({
						position: 'relative',
						p: { xs: 5, md: 8 },
						borderRadius: '32px',
						bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.05),
						border: '1px solid',
						borderColor: varAlpha(theme.vars.palette.primary.mainChannel, 0.1),
						overflow: 'hidden',
					})}
				>
					<Iconify
						icon="ph:quotes-fill"
						width={80}
						sx={{
							position: 'absolute',
							top: 24,
							left: 24,
							color: 'primary.main',
							opacity: 0.18,
							pointerEvents: 'none',
						}}
					/>

					<Box sx={{ position: 'relative', zIndex: 1 }}>
						<Typography
							component="blockquote"
							sx={{
								fontSize: { xs: 18, md: 24 },
								fontWeight: 500,
								color: 'text.primary',
								lineHeight: 1.5,
								m: 0,
								mb: 4,
							}}
						>
							&ldquo;{body}&rdquo;
						</Typography>

						<Stack
							direction="row"
							spacing={2}
							alignItems="center"
							component="footer"
						>
							<Box
								component="img"
								src={authorAvatarUrl}
								alt={`${authorName}, ${authorRole}`}
								loading="lazy"
								sx={{
									width: 56,
									height: 56,
									borderRadius: '50%',
									objectFit: 'cover',
									bgcolor: 'background.neutral',
									border: '2px solid',
									borderColor: 'background.paper',
									boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
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
									{authorName}
								</Typography>
								<Typography
									sx={{
										fontSize: 13,
										color: 'text.secondary',
										mt: 0.25,
									}}
								>
									{authorRole}
								</Typography>
							</Box>
						</Stack>
					</Box>
				</Box>
			</Container>
		</Box>
	);
};
