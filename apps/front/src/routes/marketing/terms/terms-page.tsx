import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { LegalDocPage } from '#app/routes/marketing/_components/legal-doc-page.tsx';
import {
	TERMS_LAST_UPDATED,
	TERMS_SECTION_IDS,
	TERMS_TOC,
} from '#app/routes/marketing/_data/legal-terms.ts';

// ----------------------------------------------------------------------

const TermsPage = () => {
	return (
		<LegalDocPage
			eyebrow="Legal"
			title="Terms of Use"
			lastUpdated={TERMS_LAST_UPDATED}
			toc={TERMS_TOC}
		>
			<Stack spacing={6}>
				{/* 1. Acceptance of Terms */}
				<Box component="section">
					<Typography
						component="h2"
						id={TERMS_SECTION_IDS.acceptance}
						sx={{
							fontSize: { xs: 22, md: 26 },
							fontWeight: 700,
							color: 'text.primary',
							mb: 2,
						}}
					>
						1. Acceptance of Terms
					</Typography>
					<Stack spacing={2}>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							These Terms of Use ("Terms") govern your access to and use of the
							PublyApp platform, website, and related services (collectively,
							the "Service"). By accessing or using the Service in any manner,
							you agree to be bound by these Terms and our Privacy Policy. If
							you do not agree to these Terms, you may not access or use the
							Service.
						</Typography>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							If you are accessing or using the Service on behalf of a company,
							organization, or other legal entity, you represent and warrant
							that you have the authority to bind that entity to these Terms. In
							such cases, "you" and "your" will refer to that entity.
						</Typography>
					</Stack>
				</Box>

				{/* 2. Account Registration */}
				<Box component="section">
					<Typography
						component="h2"
						id={TERMS_SECTION_IDS.accountRegistration}
						sx={{
							fontSize: { xs: 22, md: 26 },
							fontWeight: 700,
							color: 'text.primary',
							mb: 2,
						}}
					>
						2. Account Registration
					</Typography>
					<Stack spacing={2}>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							To fully utilize the Service, you must register for an account.
							You agree to provide accurate, current, and complete information
							during the registration process and to update such information to
							keep it accurate, current, and complete.
						</Typography>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							You are responsible for safeguarding your password and for all
							activities that occur under your account. You agree not to
							disclose your password to any third party. You must notify
							PublyApp immediately upon becoming aware of any breach of security
							or unauthorized use of your account.
						</Typography>
						<Box
							component="ul"
							sx={{ pl: 3, color: 'text.secondary', '& li': { mb: 1 } }}
						>
							<Box component="li" sx={{ fontSize: 15, lineHeight: 1.75 }}>
								Accounts registered by "bots" or other automated methods are not
								permitted.
							</Box>
							<Box component="li" sx={{ fontSize: 15, lineHeight: 1.75 }}>
								You must provide your legal full name, a valid email address,
								and any other information requested in order to complete the
								signup process.
							</Box>
							<Box component="li" sx={{ fontSize: 15, lineHeight: 1.75 }}>
								Your login may only be used by one person. A single login shared
								by multiple people is not permitted.
							</Box>
						</Box>
					</Stack>
				</Box>

				{/* 3. Acceptable Use */}
				<Box component="section">
					<Typography
						component="h2"
						id={TERMS_SECTION_IDS.acceptableUse}
						sx={{
							fontSize: { xs: 22, md: 26 },
							fontWeight: 700,
							color: 'text.primary',
							mb: 2,
						}}
					>
						3. Acceptable Use
					</Typography>
					<Stack spacing={2}>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							You agree not to engage in any of the following prohibited
							activities while using the Service. Violation of any of these
							terms may result in the immediate termination of your account and
							potential legal action.
						</Typography>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							You may not use the Service for any illegal or unauthorized
							purpose. You must not, in the use of the Service, violate any laws
							in your jurisdiction (including but not limited to copyright or
							trademark laws).
						</Typography>
						<Box
							component="ol"
							sx={{ pl: 3, color: 'text.secondary', '& li': { mb: 1 } }}
						>
							<Box component="li" sx={{ fontSize: 15, lineHeight: 1.75 }}>
								Transmitting structured data that contains software viruses or
								any other computer code designed to interrupt, destroy, or limit
								platform functionality.
							</Box>
							<Box component="li" sx={{ fontSize: 15, lineHeight: 1.75 }}>
								Interfering with or disrupting the integrity or performance of
								the Service or third-party data contained therein.
							</Box>
							<Box component="li" sx={{ fontSize: 15, lineHeight: 1.75 }}>
								Attempting to decipher, decompile, reverse engineer or otherwise
								discover the source code of any software making up the Service.
							</Box>
							<Box component="li" sx={{ fontSize: 15, lineHeight: 1.75 }}>
								Using the Service to send unsolicited commercial communications
								or spam.
							</Box>
						</Box>
					</Stack>
				</Box>

				{/* 4. Subscription and Billing */}
				<Box component="section">
					<Typography
						component="h2"
						id={TERMS_SECTION_IDS.billing}
						sx={{
							fontSize: { xs: 22, md: 26 },
							fontWeight: 700,
							color: 'text.primary',
							mb: 2,
						}}
					>
						4. Subscription and Billing
					</Typography>
					<Stack spacing={2}>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							Certain parts of the Service are billed on a subscription basis
							("Subscriptions"). You will be billed in advance on a recurring
							and periodic basis ("Billing Cycle"). Billing cycles are set
							either on a monthly or annual basis, depending on the type of
							subscription plan you select when purchasing a Subscription.
						</Typography>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							At the end of each Billing Cycle, your Subscription will
							automatically renew under exactly the same conditions unless you
							cancel it or PublyApp cancels it. You may cancel your Subscription
							renewal either through your online account management page or by
							contacting PublyApp customer support.
						</Typography>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							A valid payment method, including credit card, is required to
							process the payment for your Subscription. By submitting such
							payment information, you automatically authorize PublyApp to
							charge all Subscription fees incurred through your account to any
							such payment instruments.
						</Typography>
					</Stack>
				</Box>

				{/* 5. Intellectual Property */}
				<Box component="section">
					<Typography
						component="h2"
						id={TERMS_SECTION_IDS.intellectualProperty}
						sx={{
							fontSize: { xs: 22, md: 26 },
							fontWeight: 700,
							color: 'text.primary',
							mb: 2,
						}}
					>
						5. Intellectual Property
					</Typography>
					<Stack spacing={2}>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							The Service and its original content (excluding Content provided
							by users), features, and functionality are and will remain the
							exclusive property of PublyApp and its licensors. The Service is
							protected by copyright, trademark, and other laws of both the
							United States and foreign countries.
						</Typography>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							Our trademarks and trade dress may not be used in connection with
							any product or service without the prior written consent of
							PublyApp. You agree not to modify, create derivative works of,
							decompile, or otherwise attempt to extract source code from us,
							unless you are expressly permitted to do so under an open source
							license.
						</Typography>
					</Stack>
				</Box>

				{/* 6. User Content */}
				<Box component="section">
					<Typography
						component="h2"
						id={TERMS_SECTION_IDS.userContent}
						sx={{
							fontSize: { xs: 22, md: 26 },
							fontWeight: 700,
							color: 'text.primary',
							mb: 2,
						}}
					>
						6. User Content
					</Typography>
					<Stack spacing={2}>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							Our Service allows you to post, link, store, share and otherwise
							make available certain information, text, graphics, videos, or
							other material ("Content"). You are responsible for the Content
							that you post to the Service, including its legality, reliability,
							and appropriateness.
						</Typography>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							By posting Content to the Service, you grant us the right and
							license to use, modify, publicly perform, publicly display,
							reproduce, and distribute such Content on and through the Service.
							You retain any and all of your rights to any Content you submit,
							post or display on or through the Service and you are responsible
							for protecting those rights.
						</Typography>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							PublyApp has the right, but not the obligation, to monitor and
							edit all Content provided by users. We reserve the right to remove
							Content that violates these terms or is otherwise objectionable in
							our sole discretion.
						</Typography>
					</Stack>
				</Box>

				{/* 7. Termination */}
				<Box component="section">
					<Typography
						component="h2"
						id={TERMS_SECTION_IDS.termination}
						sx={{
							fontSize: { xs: 22, md: 26 },
							fontWeight: 700,
							color: 'text.primary',
							mb: 2,
						}}
					>
						7. Termination
					</Typography>
					<Stack spacing={2}>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							We may terminate or suspend your account immediately, without
							prior notice or liability, for any reason whatsoever, including
							without limitation if you breach the Terms. Upon termination, your
							right to use the Service will immediately cease.
						</Typography>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							If you wish to terminate your account, you may simply discontinue
							using the Service or delete your account through the settings
							dashboard. All provisions of the Terms which by their nature
							should survive termination shall survive termination, including,
							without limitation, ownership provisions, warranty disclaimers,
							indemnity and limitations of liability.
						</Typography>
					</Stack>
				</Box>

				{/* 8. Disclaimers and Limitations */}
				<Box component="section">
					<Typography
						component="h2"
						id={TERMS_SECTION_IDS.disclaimers}
						sx={{
							fontSize: { xs: 22, md: 26 },
							fontWeight: 700,
							color: 'text.primary',
							mb: 2,
						}}
					>
						8. Disclaimers and Limitations
					</Typography>
					<Stack spacing={2}>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							Your use of the Service is at your sole risk. The Service is
							provided on an{' '}
							<Box component="strong" sx={{ color: 'text.primary' }}>
								"AS IS"
							</Box>{' '}
							and{' '}
							<Box component="strong" sx={{ color: 'text.primary' }}>
								"AS AVAILABLE"
							</Box>{' '}
							basis. The Service is provided without warranties of any kind,
							whether express or implied, including, but not limited to, implied
							warranties of merchantability, fitness for a particular purpose,
							non-infringement or course of performance.
						</Typography>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							In no event shall PublyApp, nor its directors, employees,
							partners, agents, suppliers, or affiliates, be liable for any
							indirect, incidental, special, consequential or punitive damages,
							including without limitation, loss of profits, data, use,
							goodwill, or other intangible losses, resulting from (i) your
							access to or use of or inability to access or use the Service;
							(ii) any conduct or content of any third party on the Service.
						</Typography>
					</Stack>
				</Box>

				{/* 9. Changes to Terms */}
				<Box component="section">
					<Typography
						component="h2"
						id={TERMS_SECTION_IDS.changes}
						sx={{
							fontSize: { xs: 22, md: 26 },
							fontWeight: 700,
							color: 'text.primary',
							mb: 2,
						}}
					>
						9. Changes to Terms
					</Typography>
					<Stack spacing={2}>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							We reserve the right, at our sole discretion, to modify or replace
							these Terms at any time. If a revision is material we will try to
							provide at least 30 days notice prior to any new terms taking
							effect. What constitutes a material change will be determined at
							our sole discretion.
						</Typography>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							By continuing to access or use our Service after those revisions
							become effective, you agree to be bound by the revised terms. If
							you do not agree to the new terms, please stop using the Service.
						</Typography>
					</Stack>
				</Box>

				{/* 10. Contact */}
				<Box component="section">
					<Typography
						component="h2"
						id={TERMS_SECTION_IDS.contact}
						sx={{
							fontSize: { xs: 22, md: 26 },
							fontWeight: 700,
							color: 'text.primary',
							mb: 2,
						}}
					>
						10. Contact
					</Typography>
					<Stack spacing={2}>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							If you have any questions about these Terms, please contact our
							legal team. Formal notices regarding legal compliance or dispute
							resolution must be sent in writing via certified mail to our
							corporate headquarters, with a digital copy provided
							simultaneously to our compliance email.
						</Typography>
						<Typography
							sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.75 }}
						>
							General inquiries regarding account status, acceptable use
							policies, or policy clarification can be routed through standard
							customer support channels available within your administrative
							dashboard.
						</Typography>
					</Stack>
				</Box>
			</Stack>
		</LegalDocPage>
	);
};

export default TermsPage;
