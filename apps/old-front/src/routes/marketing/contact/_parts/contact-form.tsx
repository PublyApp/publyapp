import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Field, Form } from '#app/components/hook-form/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import {
	CONTACT_EMAIL,
	CONTACT_TOPICS,
	type ContactTopic,
} from '#app/routes/marketing/_data/contact.ts';

// ----------------------------------------------------------------------

const ContactFormSchema = z.object({
	name: z.string().min(1, 'Required').max(120),
	email: z.string().email('Invalid email address'),
	topic: z.enum([
		'general',
		'sales',
		'support',
		'press',
	] as const satisfies readonly ContactTopic['value'][]),
	message: z
		.string()
		.min(20, 'Tell us a bit more (at least 20 characters)')
		.max(2000),
});

type ContactFormValues = z.infer<typeof ContactFormSchema>;

// ----------------------------------------------------------------------

const buildMailtoUrl = (values: ContactFormValues): string => {
	const subject = encodeURIComponent(`[${values.topic}] ${values.name}`);
	const body = encodeURIComponent(
		`From: ${values.name} <${values.email}>\n\n${values.message}`,
	);
	return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
};

// ----------------------------------------------------------------------

export const ContactForm = () => {
	const methods = useForm<ContactFormValues>({
		resolver: zodResolver(ContactFormSchema),
		defaultValues: {
			name: '',
			email: '',
			topic: 'general',
			message: '',
		},
	});

	const handleSubmit = methods.handleSubmit((values) => {
		window.location.href = buildMailtoUrl(values);
	});

	return (
		<Box
			sx={{
				p: { xs: 3, md: 5 },
				borderRadius: '20px',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
			}}
		>
			<Form methods={methods} onSubmit={handleSubmit}>
				<Stack spacing={2.5}>
					<Field.Text
						name="name"
						label="Your name"
						slotProps={{ inputLabel: { shrink: true } }}
					/>
					<Field.Text
						name="email"
						label="Email address"
						type="email"
						slotProps={{ inputLabel: { shrink: true } }}
					/>
					<Field.Select
						name="topic"
						label="Topic"
						slotProps={{ inputLabel: { shrink: true } }}
					>
						{CONTACT_TOPICS.map((topic) => {
							return (
								<MenuItem key={topic.value} value={topic.value}>
									{topic.label}
								</MenuItem>
							);
						})}
					</Field.Select>
					<Field.Text
						name="message"
						label="Message"
						multiline
						minRows={5}
						maxRows={10}
						slotProps={{ inputLabel: { shrink: true } }}
					/>
					<Stack spacing={1.5} alignItems="center" sx={{ pt: 1 }}>
						<Button
							type="submit"
							variant="contained"
							sx={{
								py: 1.75,
								px: 4,
								borderRadius: 2,
								fontWeight: 700,
								fontSize: 15,
								alignSelf: 'stretch',
							}}
						>
							Send message
						</Button>
						<Box
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 0.75,
							}}
						>
							<Iconify
								icon="ph:clock-bold"
								width={14}
								sx={{ color: 'primary.main' }}
							/>
							<Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
								We'll respond within 4 business hours
							</Typography>
						</Box>
					</Stack>
				</Stack>
			</Form>
		</Box>
	);
};
