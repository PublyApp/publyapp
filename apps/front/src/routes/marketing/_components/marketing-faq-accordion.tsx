import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AnimatePresence, m } from 'framer-motion';
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
			sx={{
				bgcolor: 'background.paper',
				borderRadius: 2,
				boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
				border: '1px solid',
				borderColor: 'divider',
				overflow: 'hidden',
			}}
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
					animate={{ rotate: expanded ? 90 : 0 }}
					transition={{ type: 'spring', stiffness: 300, damping: 22 }}
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
							height: { type: 'spring', stiffness: 220, damping: 28 },
							opacity: { duration: 0.18, delay: 0.08 },
						}}
						sx={{ overflow: 'hidden' }}
					>
						<Box
							component={m.div}
							initial={{ y: -6 }}
							animate={{ y: 0 }}
							exit={{ y: -6 }}
							transition={{ type: 'spring', stiffness: 220, damping: 28 }}
							sx={{ px: 3, pt: 0, pb: 3 }}
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
