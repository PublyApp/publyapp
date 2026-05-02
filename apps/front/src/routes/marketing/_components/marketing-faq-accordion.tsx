import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
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
				transition: 'transform 300ms ease, color 300ms ease',
				transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
			}}
		/>
	);
};

const FaqRow = ({ item }: { item: MarketingFaqItem }) => {
	const [expanded, setExpanded] = useState(item.defaultOpen ?? false);

	return (
		<Accordion
			expanded={expanded}
			onChange={() => {
				return setExpanded(!expanded);
			}}
			disableGutters
			elevation={0}
			square
			sx={{
				bgcolor: 'background.paper',
				borderRadius: 2,
				boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
				border: '1px solid',
				borderColor: 'divider',
				overflow: 'hidden',
				'&:before': { display: 'none' },
				'&.Mui-expanded': { margin: 0, borderRadius: 2 },
			}}
		>
			<AccordionSummary
				expandIcon={<ExpandIcon expanded={expanded} />}
				sx={{
					px: 3,
					py: 1.5,
					'& .MuiAccordionSummary-content': { my: 1.5 },
					// Suppress MUI's default 180deg rotation on the wrapper —
					// the icon swap + own rotation handles the visual.
					'& .MuiAccordionSummary-expandIconWrapper': { transform: 'none' },
					'& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': {
						transform: 'none',
					},
				}}
			>
				<Typography
					component="h4"
					sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}
				>
					{item.question}
				</Typography>
			</AccordionSummary>
			<AccordionDetails sx={{ px: 3, pb: 3, pt: 0 }}>
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
			</AccordionDetails>
		</Accordion>
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
