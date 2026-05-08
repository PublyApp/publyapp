import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';

import { useCookieConsent } from './use-cookie-consent';

// ----------------------------------------------------------------------

type CategoryRowProps = {
	title: string;
	description: string;
	checked: boolean;
	disabled?: boolean;
	disabledReason?: string;
	onChange?: (value: boolean) => void;
};

const CategoryRow = ({
	title,
	description,
	checked,
	disabled,
	disabledReason,
	onChange,
}: CategoryRowProps) => {
	const switchEl = (
		<Switch
			checked={checked}
			disabled={disabled}
			onChange={(_, value) => {
				onChange?.(value);
			}}
			slotProps={{
				input: disabled
					? { 'aria-disabled': true, 'aria-label': title }
					: { 'aria-label': title },
			}}
		/>
	);

	return (
		<Box
			sx={{
				py: 2,
				borderBottom: '1px solid',
				borderColor: 'divider',
				'&:last-of-type': { borderBottom: 'none' },
			}}
		>
			<Stack
				direction="row"
				spacing={2}
				alignItems="flex-start"
				justifyContent="space-between"
			>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
						{title}
					</Typography>
					<Typography
						variant="body2"
						sx={{ color: 'text.secondary', mt: 0.5, lineHeight: 1.5 }}
					>
						{description}
					</Typography>
				</Box>
				<Box sx={{ flexShrink: 0 }}>
					<FormControlLabel
						control={
							disabled && disabledReason ? (
								<Tooltip title={disabledReason} placement="left" arrow>
									<span>{switchEl}</span>
								</Tooltip>
							) : (
								switchEl
							)
						}
						label=""
						labelPlacement="start"
						sx={{ m: 0 }}
					/>
				</Box>
			</Stack>
		</Box>
	);
};

// ----------------------------------------------------------------------

export const CookiePreferencesDialog = () => {
	const consent = useCookieConsent();

	return (
		<Dialog
			open={consent.dialogOpen}
			onClose={() => {
				consent.closePreferences();
			}}
			maxWidth="sm"
			fullWidth
			aria-labelledby="cookie-preferences-title"
		>
			<DialogTitle
				id="cookie-preferences-title"
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					pr: 1,
				}}
			>
				<span>Cookie preferences</span>
				<IconButton
					autoFocus
					aria-label="Close cookie preferences"
					onClick={() => {
						consent.closePreferences();
					}}
				>
					<Iconify icon="mingcute:close-line" width={20} />
				</IconButton>
			</DialogTitle>

			<DialogContent dividers>
				<CategoryRow
					title="Essential"
					description="Required for the site to function (sign-in, workspace context, color scheme)."
					checked
					disabled
					disabledReason="Required for the site to function."
				/>
				<CategoryRow
					title="Analytics"
					description="Helps us understand how the product is used so we can improve it."
					checked={consent.categories.analytics}
					onChange={(value) => {
						consent.setCategory('analytics', value);
					}}
				/>
				<CategoryRow
					title="Marketing"
					description="Personalized content and embedded social media (videos, posts)."
					checked={consent.categories.marketing}
					onChange={(value) => {
						consent.setCategory('marketing', value);
					}}
				/>
			</DialogContent>

			<DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
				<Button
					variant="text"
					onClick={() => {
						consent.rejectAll();
					}}
				>
					Reject all
				</Button>
				<Button
					variant="outlined"
					onClick={() => {
						consent.acceptAll();
					}}
				>
					Accept all
				</Button>
				<Button
					variant="contained"
					onClick={() => {
						consent.save();
					}}
				>
					Save preferences
				</Button>
			</DialogActions>
		</Dialog>
	);
};
