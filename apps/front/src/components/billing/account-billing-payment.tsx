import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import type { CardProps } from '@mui/material/Card';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useBoolean } from 'minimal-shared/hooks';
import type { IPaymentCard } from '@/front/types/common';

import { Iconify } from '../iconify/iconify';

import { PaymentCardItem } from '../payment/payment-card-item';
import { PaymentNewCardForm } from '../payment/payment-new-card-form';

// ----------------------------------------------------------------------

type Props = CardProps & {
	cards: IPaymentCard[];
};

export function AccountBillingPayment({ cards, sx, ...other }: Props) {
	const openForm = useBoolean();

	return (
		<>
			<Card sx={[{ my: 3 }, ...(Array.isArray(sx) ? sx : [sx])]} {...other}>
				<CardHeader
					title="Payment method"
					action={
						<Button
							size="small"
							color="primary"
							startIcon={<Iconify icon="mingcute:add-line" />}
							onClick={openForm.onTrue}
						>
							New card
						</Button>
					}
				/>

				<Box
					sx={{
						p: 3,
						rowGap: 2.5,
						columnGap: 2,
						display: 'grid',
						gridTemplateColumns: { xs: 'repeat(1, 1fr)', md: 'repeat(2, 1fr)' },
					}}
				>
					{cards.map((card) => (
						<PaymentCardItem key={card.id} card={card} />
					))}
				</Box>
			</Card>

			<Dialog
				fullWidth
				maxWidth="xs"
				open={openForm.value}
				onClose={openForm.onFalse}
			>
				<DialogTitle> Add new card </DialogTitle>

				<DialogContent sx={{ overflow: 'unset' }}>
					<PaymentNewCardForm />
				</DialogContent>

				<DialogActions>
					<Button color="inherit" variant="outlined" onClick={openForm.onFalse}>
						Cancel
					</Button>

					<Button
						color="inherit"
						variant="contained"
						onClick={openForm.onFalse}
					>
						Add
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
}
