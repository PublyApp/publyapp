import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

import { MarketingFaqAccordion } from '#app/routes/marketing/_components/marketing-faq-accordion.tsx';
import { PRICING_FAQS } from '#app/routes/marketing/_data/pricing.ts';

export const PricingFaq = () => {
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

				<MarketingFaqAccordion items={PRICING_FAQS} />
			</Container>
		</Box>
	);
};
