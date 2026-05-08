import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { buildSeoMeta } from '#app/lib/seo/meta.ts';
import { ContentBand } from '#app/routes/marketing/_components/content-band.tsx';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';
import {
	CONTACT_CHANNELS,
	CONTACT_FAQS,
	SUPPORT_TIERS,
} from '#app/routes/marketing/_data/contact.ts';

import type { Route } from './+types/contact-page';
import { ContactForm } from './_parts/contact-form.tsx';

export const meta = ({ location }: Route.MetaArgs) => {
	return buildSeoMeta({
		title: 'Contact — PublyApp',
		description:
			'Get in touch with the PublyApp team. Sales, support, and partnerships — usually under 4 hours.',
		pathname: location.pathname,
	});
};

// ----------------------------------------------------------------------

const DirectContactsCard = () => {
	return (
		<Box
			sx={{
				p: { xs: 3, md: 4 },
				borderRadius: '20px',
				bgcolor: 'background.neutral',
				border: '1px solid',
				borderColor: 'divider',
			}}
		>
			<Typography
				sx={{
					fontSize: 16,
					fontWeight: 700,
					color: 'text.primary',
					mb: 3,
				}}
			>
				Direct contacts
			</Typography>
			<Stack spacing={2.5}>
				{CONTACT_CHANNELS.map((channel) => {
					return (
						<Box
							key={channel.id}
							sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
						>
							<Box
								sx={{
									width: 40,
									height: 40,
									borderRadius: '50%',
									bgcolor: 'background.paper',
									border: '1px solid',
									borderColor: 'divider',
									color: 'primary.main',
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									flexShrink: 0,
								}}
							>
								<Iconify icon={channel.icon} width={20} />
							</Box>
							<Stack spacing={0.25}>
								<Typography
									sx={{
										fontSize: 13,
										color: 'text.secondary',
										fontWeight: 500,
									}}
								>
									{channel.label}
								</Typography>
								<Box
									component="a"
									href={`mailto:${channel.email}`}
									sx={{
										fontSize: 14,
										fontWeight: 600,
										color: 'text.primary',
										textDecoration: 'none',
										borderRadius: '2px',
										'&:hover': { color: 'primary.main' },
										'&:focus-visible': {
											outline: '2px solid',
											outlineColor: 'primary.main',
											outlineOffset: '2px',
										},
									}}
								>
									{channel.email}
								</Box>
							</Stack>
						</Box>
					);
				})}
			</Stack>
		</Box>
	);
};

// ----------------------------------------------------------------------

const ResponseTimeCard = () => {
	return (
		<Box
			sx={{
				p: { xs: 3, md: 4 },
				borderRadius: '20px',
				bgcolor: 'background.neutral',
				border: '1px solid',
				borderColor: 'divider',
			}}
		>
			<Typography
				sx={{
					fontSize: 16,
					fontWeight: 700,
					color: 'text.primary',
					mb: 3,
				}}
			>
				Response time SLA
			</Typography>
			<Stack spacing={1.5}>
				{SUPPORT_TIERS.map((tier) => {
					return (
						<Box
							key={tier.id}
							sx={{
								display: 'flex',
								justifyContent: 'space-between',
								alignItems: 'center',
								py: 1,
								borderBottom: '1px solid',
								borderColor: 'divider',
								'&:last-of-type': { borderBottom: 'none' },
							}}
						>
							<Stack spacing={0.25}>
								<Typography
									sx={{
										fontSize: 14,
										fontWeight: 600,
										color: 'text.primary',
									}}
								>
									{tier.tier}
								</Typography>
								<Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
									{tier.channel}
								</Typography>
							</Stack>
							<Typography
								sx={{
									fontSize: 13,
									fontWeight: 700,
									color: 'primary.main',
								}}
							>
								{tier.responseTime}
							</Typography>
						</Box>
					);
				})}
			</Stack>
		</Box>
	);
};

// ----------------------------------------------------------------------

const ContactInfoPanel = () => {
	return (
		<Stack spacing={3}>
			<DirectContactsCard />
			<ResponseTimeCard />
		</Stack>
	);
};

// ----------------------------------------------------------------------

const ContactPage = () => {
	return (
		<>
			<MarketingHero
				eyebrow="Contact"
				eyebrowIcon="ph:envelope-bold"
				title="Get in touch"
				subhead="We respond fast — usually within a few hours during business days. How can our team help you grow today?"
			/>

			<ContentBand title="Send us a message">
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', md: '1.2fr 0.8fr' },
						gap: { xs: 4, md: 6 },
						alignItems: 'flex-start',
					}}
				>
					<ContactForm />
					<ContactInfoPanel />
				</Box>
			</ContentBand>

			<ContentBand title="Quick answers">
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
						gap: { xs: 2, md: 3 },
					}}
				>
					{CONTACT_FAQS.map((faq) => {
						return (
							<Box
								key={faq.id}
								sx={{
									p: { xs: 3, md: 4 },
									borderRadius: '20px',
									bgcolor: 'background.paper',
									border: '1px solid',
									borderColor: 'divider',
								}}
							>
								<Typography
									sx={{
										fontSize: 16,
										fontWeight: 700,
										color: 'text.primary',
										mb: 1.5,
									}}
								>
									{faq.question}
								</Typography>
								<Typography
									sx={{
										fontSize: 14,
										color: 'text.secondary',
										lineHeight: 1.6,
									}}
								>
									{faq.answer}
								</Typography>
							</Box>
						);
					})}
				</Box>
			</ContentBand>

			<CtaBand
				eyebrowLabel="Or skip the form"
				title="Just start a trial"
				subhead="Most of our questions get answered by experiencing the product firsthand."
				ctaLabel="Start for Free"
				ctaHref={FRONT_PATH_NAMES.auth.signup}
				microcopy="14-day free trial. No credit card required."
			/>
		</>
	);
};

export default ContactPage;
