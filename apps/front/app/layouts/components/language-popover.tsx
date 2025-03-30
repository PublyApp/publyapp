import { useCallback } from 'react';

import IconButton, { type IconButtonProps } from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import { m } from 'framer-motion';
import { usePopover } from 'minimal-shared/hooks';
import { transitionTap, varHover, varTap } from 'src/components/animate';
import { CustomPopover } from 'src/components/custom-popover';
import { FlagIcon } from 'src/components/flag-icon';
import { useTranslate, type LanguageValue } from 'src/locales';

// ----------------------------------------------------------------------

export type LanguagePopoverProps = IconButtonProps & {
	data?: {
		value: string;
		label: string;
		countryCode: string;
	}[];
};

export function LanguagePopover({ data = [], sx, ...other }: LanguagePopoverProps) {
	const { open, anchorEl, onClose, onOpen } = usePopover();

	const { onChangeLang, currentLang } = useTranslate();

	const handleChangeLang = useCallback(
		(newLang: LanguageValue) => {
			onChangeLang(newLang);
			onClose();
		},
		[onChangeLang, onClose],
	);

	const renderMenuList = () => (
		<CustomPopover open={open} anchorEl={anchorEl} onClose={onClose}>
			<MenuList sx={{ width: 160, minHeight: 72 }}>
				{data?.map((option) => (
					<MenuItem
						key={option.value}
						selected={option.value === currentLang.value}
						onClick={() => handleChangeLang(option.value as LanguageValue)}
					>
						<FlagIcon code={option.countryCode} />
						{option.label}
					</MenuItem>
				))}
			</MenuList>
		</CustomPopover>
	);

	return (
		<>
			<IconButton
				component={m.button}
				whileTap={varTap(0.96)}
				whileHover={varHover(1.04)}
				transition={transitionTap()}
				aria-label="Languages button"
				onClick={onOpen}
				sx={[
					(theme) => ({
						p: 0,
						width: 40,
						height: 40,
						...(open && { bgcolor: theme.vars.palette.action.selected }),
					}),
					...(Array.isArray(sx) ? sx : [sx]),
				]}
				{...other}
			>
				<FlagIcon code={currentLang.countryCode} />
			</IconButton>

			{renderMenuList()}
		</>
	);
}
