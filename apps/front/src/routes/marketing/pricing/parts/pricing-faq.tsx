import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { PRICING_FAQS } from '#app/routes/marketing/_data/pricing.ts';

const ExpandIcon = ({ expanded }: { expanded: boolean }) => {
	return (
		<Iconify
			icon={(expanded ? 'ph:x-bold' : 'ph:plus-bold') as never}
			width={18}
			sx={{
				color: 'text.disabled',
				transition: 'transform 300ms ease',
				transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
			}}
		/>
	);
};

export const PricingFaq = () => {
	const [activeIndex, setActiveIndex] = useState<number | null>(null);

	const handleToggle = (index: number) => {
		return () => {
			return setActiveIndex(activeIndex === index ? null : index);
		};
	};

	return (
		<Box component="section" sx={{ py: { xs: 12, md: 12 } }}>
			<Container maxWidth="sm" sx={{ maxWidth: { sm: 760 } }}>
				<Typography
					component="h2"
					sx={{
						fontSize: { xs: 28, md: 30 },
						fontWeight: 700,
						textAlign: 'center',
						mb: 4,
					}}
				>
					Frequently asked questions
				</Typography>

				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
					{PRICING_FAQS.map((item, index) => {
						const expanded = activeIndex === index;
						return (
							<Accordion
								key={item.question}
								expanded={expanded}
								onChange={handleToggle(index)}
								disableGutters
								elevation={0}
								square={false}
								sx={{
									borderRadius: '16px',
									overflow: 'hidden',
									bgcolor: 'grey.50',
									border: '1px solid',
									borderColor: 'divider',
									boxShadow: '0 2px 10px -4px rgba(0,0,0,0.03)',
									'&:before': { display: 'none' },
									'&.Mui-expanded': { margin: 0 },
								}}
							>
								<AccordionSummary
									expandIcon={<ExpandIcon expanded={expanded} />}
									sx={{
										px: 3,
										py: 2,
										bgcolor: 'grey.100',
										minHeight: 0,
										'& .MuiAccordionSummary-content': { my: 0 },
										'& .MuiAccordionSummary-expandIconWrapper': {
											transform: 'none',
										},
										'& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': {
											transform: 'none',
										},
									}}
								>
									<Typography
										sx={{
											fontSize: 16,
											fontWeight: 500,
											color: 'text.primary',
										}}
									>
										{item.question}
									</Typography>
								</AccordionSummary>
								<AccordionDetails sx={{ px: 3, pt: 1, pb: 3 }}>
									<Typography
										sx={{
											fontSize: 14,
											color: 'text.secondary',
											lineHeight: 1.7,
										}}
									>
										{item.answer}
									</Typography>
								</AccordionDetails>
							</Accordion>
						);
					})}
				</Box>
			</Container>
		</Box>
	);
};
