import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AnimatePresence, m } from 'framer-motion';
import { varAlpha } from 'minimal-shared/utils';
import { useState } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';

// ----------------------------------------------------------------------

export type MarketingFaqItem = {
	question: string;
	answer: string;
	defaultOpen?: boolean;
};

type MarketingFaqAccordionProps = {
	items: MarketingFaqItem[];
};

const ExpandIcon = ({ expanded }: { expanded: boolean }) => {
	return (
		<Iconify
			icon={expanded ? 'ph:x-bold' : 'ph:plus-bold'}
			width={16}
			sx={{
				color: expanded ? 'primary.main' : 'text.disabled',
				transition: 'color 300ms ease',
			}}
		/>
	);
};

const FaqRow = ({ item }: { item: MarketingFaqItem }) => {
	const [expanded, setExpanded] = useState(item.defaultOpen ?? false);

	return (
		<Box
			component={m.div}
			layout
			animate={{
				scale: expanded ? 1.015 : 1,
				y: expanded ? -2 : 0,
			}}
			whileHover={!expanded ? { scale: 1.005, y: -1 } : undefined}
			transition={{
				type: 'spring',
				stiffness: 420,
				damping: 26,
				mass: 0.5,
			}}
			sx={(theme) => ({
				bgcolor: 'background.paper',
				borderRadius: 2,
				boxShadow: expanded
					? `0 18px 36px -12px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.2)}, 0 4px 12px -4px rgba(0,0,0,0.06)`
					: '0 1px 2px 0 rgba(0,0,0,0.05)',
				border: '1px solid',
				borderColor: expanded ? 'primary.main' : 'divider',
				overflow: 'hidden',
				transition: 'box-shadow 320ms ease, border-color 320ms ease',
			})}
		>
			{/* Question button */}
			<Box
				component="button"
				type="button"
				aria-expanded={expanded}
				onClick={() => {
					return setExpanded(!expanded);
				}}
				sx={{
					width: '100%',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 2,
					px: 3,
					py: 2,
					border: 'none',
					background: 'transparent',
					cursor: 'pointer',
					textAlign: 'left',
					color: 'text.primary',
				}}
			>
				<Typography component="span" sx={{ fontSize: 14, fontWeight: 600 }}>
					{item.question}
				</Typography>
				<Box
					component={m.div}
					animate={{ rotate: expanded ? 90 : 0, scale: expanded ? 1 : 1 }}
					whileTap={{ scale: 0.85 }}
					transition={{
						type: 'spring',
						stiffness: 600,
						damping: 18,
						mass: 0.5,
					}}
					sx={{ display: 'inline-flex', flexShrink: 0 }}
				>
					<ExpandIcon expanded={expanded} />
				</Box>
			</Box>

			{/* Animated body */}
			<AnimatePresence initial={false}>
				{expanded && (
					<Box
						component={m.div}
						key="content"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{
							height: {
								type: 'spring',
								stiffness: 420,
								damping: 32,
								mass: 0.6,
							},
							opacity: { duration: 0.12, delay: 0.04 },
						}}
						sx={{ overflow: 'hidden' }}
					>
						<Box
							component={m.div}
							initial={{ y: -12, opacity: 0, scale: 0.98 }}
							animate={{ y: 0, opacity: 1, scale: 1 }}
							exit={{ y: -8, opacity: 0 }}
							transition={{
								y: {
									type: 'spring',
									stiffness: 480,
									damping: 28,
									mass: 0.5,
									delay: 0.05,
								},
								opacity: { duration: 0.18, delay: 0.06 },
								scale: {
									type: 'spring',
									stiffness: 500,
									damping: 30,
									delay: 0.05,
								},
							}}
							sx={{ px: 3, pt: 0, pb: 3, transformOrigin: 'top left' }}
						>
							<Typography
								sx={{
									fontSize: 14,
									color: 'text.secondary',
									lineHeight: 1.7,
									pr: 4,
								}}
							>
								{item.answer}
							</Typography>
						</Box>
					</Box>
				)}
			</AnimatePresence>
		</Box>
	);
};

export const MarketingFaqAccordion = ({
	items,
}: MarketingFaqAccordionProps) => {
	return (
		<Stack spacing={2}>
			{items.map((item) => {
				return <FaqRow key={item.question} item={item} />;
			})}
		</Stack>
	);
};
