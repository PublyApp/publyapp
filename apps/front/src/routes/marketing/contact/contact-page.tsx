import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { ContentBand } from '#app/routes/marketing/_components/content-band.tsx';
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';
import {
	CONTACT_CHANNELS,
	SUPPORT_TIERS,
} from '#app/routes/marketing/_data/contact.ts';

import { ContactForm } from './_parts/contact-form.tsx';

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
		</>
	);
};

export default ContactPage;
