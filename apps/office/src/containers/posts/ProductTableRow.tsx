import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import type { GridCellParams } from '@mui/x-data-grid';
import _ from 'lodash';

import Label from '@devist/ui-react/components/Label';

import { fDate, fTime } from '@/ui-react/utils/date.utils';
import { fCurrency } from '@/ui-react/utils/number.utils';

// import { fCurrency } from 'src/utils/format-number';
// import { fDate, fTime } from 'src/utils/format-time';

// ----------------------------------------------------------------------

type ParamsProps = {
	params: GridCellParams;
};

export const RenderCellPrice = ({ params }: ParamsProps) => {
	return <>{fCurrency(params.row.price)}</>;
};

export const RenderCellPublish = ({ params }: ParamsProps) => {
	return (
		<Label variant="soft" color={(params.row.publish === 'published' && 'info') || 'default'}>
			{params.row.publish}
		</Label>
	);
};

export const RenderCellCreatedAt = ({ params }: ParamsProps) => {
	return (
		<ListItemText
			primary={fDate(params.row.createdAt)}
			secondary={fTime(params.row.createdAt)}
			primaryTypographyProps={{ typography: 'body2', noWrap: true }}
			secondaryTypographyProps={{
				mt: 0.5,
				component: 'span',
				typography: 'caption',
			}}
		/>
	);
};

export const RenderCellStock = ({ params }: ParamsProps) => {
	return (
		<Stack sx={{ typography: 'caption', color: 'text.secondary' }}>
			<LinearProgress
				value={(params.row.available * 100) / params.row.quantity}
				variant="determinate"
				color={
					(params.row.inventoryType === 'out of stock' && 'error') ||
					(params.row.inventoryType === 'low stock' && 'warning') ||
					'success'
				}
				sx={{ mb: 1, height: 6, maxWidth: 80 }}
			/>
			{!!params.row.available && params.row.available} {params.row.inventoryType}
		</Stack>
	);
};

export const RenderCellProduct = ({ params }: ParamsProps) => {
	return (
		<Stack direction="row" alignItems="center" sx={{ py: 2, width: 1 }}>
			<Avatar
				alt={params.row.title}
				src={params.row.coverUrl}
				variant="rounded"
				sx={{ width: 64, height: 64, mr: 2 }}
			/>

			<ListItemText
				disableTypography
				primary={
					// eslint-disable-next-line jsx-a11y/anchor-is-valid
					<Link noWrap color="inherit" variant="subtitle2" onClick={params.row.onViewRow} sx={{ cursor: 'pointer' }}>
						{params.row.title}
					</Link>
				}
				secondary={
					<Box component="div" sx={{ typography: 'body2', color: 'text.disabled' }}>
						{_.join(params.row.tags, ', ') || '-'}
					</Box>
				}
				sx={{ display: 'flex', flexDirection: 'column' }}
			/>
		</Stack>
	);
};
