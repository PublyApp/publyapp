// @mui
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import useBoolean from '@/ui-react/hooks/useBoolean';

// hooks
// import { useBoolean } from 'src/hooks/use-boolean';

// ----------------------------------------------------------------------

const FormDialog = () => {
	const dialog = useBoolean();

	return (
		<div>
			<Button variant="outlined" color="warning" onClick={dialog.setTrue}>
				Form Dialogs
			</Button>

			<Dialog open={dialog.value} onClose={dialog.setFalse}>
				<DialogTitle>Subscribe</DialogTitle>

				<DialogContent>
					<Typography sx={{ mb: 3 }}>
						To subscribe to this website, please enter your email address here. We will send updates occasionally.
					</Typography>

					<TextField autoFocus fullWidth type="email" margin="dense" variant="outlined" label="Email Address" />
				</DialogContent>

				<DialogActions>
					<Button onClick={dialog.setFalse} variant="outlined" color="inherit">
						Cancel
					</Button>
					<Button onClick={dialog.setFalse} variant="contained">
						Subscribe
					</Button>
				</DialogActions>
			</Dialog>
		</div>
	);
};

export default FormDialog;
