import Avatar from '@mui/material/Avatar';
import Badge, { type BadgeProps } from '@mui/material/Badge';
import IconButton, { type IconButtonProps } from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { usePopover } from 'minimal-shared/hooks';

import { transitionTap, varHover, varTap } from '@/front/components/animate';
import { CustomPopover } from '@/front/components/custom-popover';
import { Iconify } from '@/front/components/iconify/iconify';
import { Scrollbar } from '@/front/components/scrollbar';
import { fToNow } from '@/front/utils/format-time';

// ----------------------------------------------------------------------

export type ContactsPopoverProps = IconButtonProps & {
	data?: {
		id: string;
		role: string;
		name: string;
		email: string;
		status: string;
		address: string;
		avatarUrl: string;
		phoneNumber: string;
		lastActivity: string;
	}[];
};

export const ContactsPopover = ({
	data = [],
	sx,
	...other
}: ContactsPopoverProps) => {
	const { open, anchorEl, onClose, onOpen } = usePopover();

	const renderMenuList = () => {
		return (
			<CustomPopover
				open={open}
				anchorEl={anchorEl}
				onClose={onClose}
				slotProps={{ arrow: { offset: 20 } }}
			>
				<Typography variant="h6" sx={{ p: 1.5 }}>
					Contacts <span>({data.length})</span>
				</Typography>

				<Scrollbar sx={{ height: 320, width: 320 }}>
					<MenuList>
						{data.map((contact) => {
							return (
								<MenuItem key={contact.id} sx={{ p: 1 }}>
									<Badge
										variant={contact.status as BadgeProps['variant']}
										badgeContent=""
									>
										<Avatar alt={contact.name} src={contact.avatarUrl} />
									</Badge>

									<ListItemText
										primary={contact.name}
										secondary={
											contact.status === 'offline'
												? fToNow(contact.lastActivity)
												: ''
										}
										slotProps={{
											secondary: {
												sx: { typography: 'caption', color: 'text.disabled' },
											},
										}}
									/>
								</MenuItem>
							);
						})}
					</MenuList>
				</Scrollbar>
			</CustomPopover>
		);
	};

	return (
		<>
			<IconButton
				component={m.button}
				whileTap={varTap(0.96)}
				whileHover={varHover(1.04)}
				transition={transitionTap()}
				aria-label="Contacts button"
				onClick={onOpen}
				sx={[
					(theme) => {
						return {
							...(open && { bgcolor: theme.vars.palette.action.selected }),
						};
					},
					...(Array.isArray(sx) ? sx : [sx]),
				]}
				{...other}
			>
				<Iconify icon="solar:users-group-rounded-bold-duotone" width={24} />
			</IconButton>

			{renderMenuList()}
		</>
	);
};
