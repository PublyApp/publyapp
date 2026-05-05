import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Stack from '@mui/material/Stack';
import { useBoolean, usePopover } from 'minimal-shared/hooks';
import { useCallback, useState } from 'react';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import type { IAddressItem } from '#app/types/common.ts';

import { AddressItem, AddressNewForm } from '../address';
import { CustomPopover } from '../custom-popover/custom-popover';
import { Iconify } from '../iconify/iconify';

// ----------------------------------------------------------------------

type Props = {
	addressBook: IAddressItem[];
};

export function AccountBillingAddress({ addressBook }: Props) {
	const menuActions = usePopover();
	const newAddressForm = useBoolean();

	const [addressId, setAddressId] = useState('');

	const handleAddNewAddress = useCallback((address: IAddressItem) => {
		logger.info('ADDRESS', { address });
	}, []);

	const handleSelectedId = useCallback(
		(event: React.MouseEvent<HTMLElement>, id: string) => {
			menuActions.onOpen(event);
			setAddressId(id);
		},
		[menuActions],
	);

	const handleClose = useCallback(() => {
		menuActions.onClose();
		setAddressId('');
	}, [menuActions]);

	const renderMenuActions = () => (
		<CustomPopover
			open={menuActions.open}
			anchorEl={menuActions.anchorEl}
			onClose={handleClose}
		>
			<MenuList>
				<MenuItem
					onClick={() => {
						handleClose();
						logger.info('SET AS PRIMARY', { addressId });
					}}
				>
					<Iconify icon="eva:star-fill" />
					Set as primary
				</MenuItem>

				<MenuItem
					onClick={() => {
						handleClose();
						logger.info('EDIT', { addressId });
					}}
				>
					<Iconify icon="solar:pen-bold" />
					Edit
				</MenuItem>

				<MenuItem
					onClick={() => {
						handleClose();
						logger.info('DELETE', { addressId });
					}}
					sx={{ color: 'error.main' }}
				>
					<Iconify icon="solar:trash-bin-trash-bold" />
					Delete
				</MenuItem>
			</MenuList>
		</CustomPopover>
	);

	const renderNewAddressForm = () => (
		<AddressNewForm
			open={newAddressForm.value}
			onClose={newAddressForm.onFalse}
			onCreate={handleAddNewAddress}
		/>
	);

	return (
		<>
			<Card>
				<CardHeader
					title="Address book"
					action={
						<Button
							size="small"
							color="primary"
							startIcon={<Iconify width={16} icon="mingcute:add-line" />}
							onClick={newAddressForm.onTrue}
						>
							Address
						</Button>
					}
				/>

				<Stack spacing={2.5} sx={{ p: 3 }}>
					{addressBook.map((address) => (
						<AddressItem
							variant="outlined"
							key={address.id}
							address={address}
							action={
								<IconButton
									onClick={(event: React.MouseEvent<HTMLElement>) => {
										handleSelectedId(event, `${address.id}`);
									}}
									sx={{ position: 'absolute', top: 8, right: 8 }}
								>
									<Iconify icon="eva:more-vertical-fill" />
								</IconButton>
							}
							sx={{ p: 2.5, borderRadius: 1 }}
						/>
					))}
				</Stack>
			</Card>

			{renderMenuActions()}
			{renderNewAddressForm()}
		</>
	);
}
