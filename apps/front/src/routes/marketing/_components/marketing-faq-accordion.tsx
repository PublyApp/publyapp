import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
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
			animate={{
				scale: expanded ? 1.015 : 1,
				y: expanded ? -2 : 0,
			}}
			whileHover={!expanded ? { scale: 1.005, y: -1 } : undefined}
			// High-stiffness, low-mass spring → snappy pop with slight overshoot.
			// Earlier values (700/30/0.4) felt sleepy; previous fps drops came
			// from a `layout` prop + nested motion subtrees, not from spring config.
			transition={{
				type: 'spring',
				stiffness: 1200,
				damping: 20,
				mass: 0.25,
			}}
			sx={{
				bgcolor: 'background.paper',
				borderRadius: 2,
				boxShadow: expanded
					? '0 12px 28px -10px rgba(17,24,39,0.12), 0 2px 6px -2px rgba(17,24,39,0.06)'
					: '0 1px 2px 0 rgba(0,0,0,0.05)',
				border: '1px solid',
				borderColor: 'divider',
				overflow: 'hidden',
				transition: 'box-shadow 180ms ease',
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
					whileTap={{ scale: 0.85 }}
					// Whip-fast rotation — slightly under-damped on purpose so the
					// icon flick reads as the "trigger" of the body open/close.
					transition={{
						type: 'spring',
						stiffness: 1500,
						damping: 14,
						mass: 0.22,
					}}
					sx={{ display: 'inline-flex', flexShrink: 0 }}
				>
					<ExpandIcon expanded={expanded} />
				</Box>
			</Box>

			{/*
				Body uses MUI Collapse (real height animation) instead of a
				framer-motion scaleY container. scaleY distorted text mid-transition
				and didn't reserve real height in the surrounding stack. Asymmetric
				timeout — opening uses an overshoot easing for a playful pop, closing
				uses standard ease-in-out so it feels decisive rather than bouncy.
			*/}
			<Collapse
				in={expanded}
				timeout={{ enter: 160, exit: 120 }}
				easing={{
					enter: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
					exit: 'cubic-bezier(0.4, 0, 0.6, 1)',
				}}
				unmountOnExit
			>
				<Box sx={{ px: 3, pb: 3 }}>
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
			</Collapse>
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
