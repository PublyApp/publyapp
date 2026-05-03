import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { MotionViewport, varFade } from '#app/components/animate/index.ts';
import {
	MarketingFaqAccordion,
	type MarketingFaqItem,
} from '#app/routes/marketing/_components/marketing-faq-accordion.tsx';

// ----------------------------------------------------------------------

const FAQS: MarketingFaqItem[] = [
	{
		question: 'How many social accounts can I connect?',
		answer:
			"Unlimited social profiles on the Scale plan, or up to 5 on Creator. Each connected profile counts once across PublyApp's queue, inbox, and analytics — no double-billing for cross-posting.",
	},
	{
		question: 'Does the AI caption writer use real brand data?',
		answer:
			'Yes, when you set up your workspace, you provide a brief brand guidelines document. Our AI uses this specifically to mirror your tone, vocabulary, and common emojis to ensure every post sounds authentically like you.',
		defaultOpen: true,
	},
	{
		question: 'Can I invite my team or clients to collaborate?',
		answer:
			'Yes — invite unlimited team members on Scale with role-based permissions for editors, approvers, and read-only clients. Every action is logged so you always know who scheduled, edited, or replied to what.',
	},
	{
		question: 'What happens if a social network API goes down?',
		answer:
			"We queue your scheduled posts and retry automatically when the network recovers. You'll get a notification with the affected post, and our system handles the re-publish without losing the time slot.",
	},
];

const SectionEyebrow = ({ label }: { label: string }) => {
	return (
		<Box
			sx={{
				display: 'inline-block',
				px: 1.5,
				py: 0.5,
				bgcolor: 'background.paper',
				borderRadius: '6px',
				boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
				border: '1px solid',
				borderColor: 'divider',
				mb: 2,
				fontSize: 12,
				fontWeight: 700,
				color: 'primary.main',
				letterSpacing: '0.1em',
				textTransform: 'uppercase',
			}}
		>
			{label}
		</Box>
	);
};

export const HomeFaq = () => {
	return (
		<Box
			component="section"
			id="faqs"
			sx={{
				py: { xs: 10, md: 12 },
				bgcolor: 'background.default',
			}}
		>
			<Container maxWidth="md" component={MotionViewport}>
				<Box sx={{ textAlign: 'center', mb: 8 }}>
					<m.div variants={varFade('inUp', { distance: 24 })}>
						<SectionEyebrow label="FAQ" />
					</m.div>

					<m.div variants={varFade('inUp', { distance: 24 })}>
						<Typography
							component="h2"
							sx={{
								fontSize: 36,
								fontWeight: 800,
								color: 'text.primary',
							}}
						>
							Frequently asked{' '}
							<Box component="span" sx={{ color: 'primary.main' }}>
								questions
							</Box>
						</Typography>
					</m.div>

					<m.div variants={varFade('inUp', { distance: 24 })}>
						<Typography sx={{ color: 'text.secondary', mt: 1 }}>
							Everything you need to know about getting started.
						</Typography>
					</m.div>
				</Box>

				<MarketingFaqAccordion items={FAQS} />
			</Container>
		</Box>
	);
};
