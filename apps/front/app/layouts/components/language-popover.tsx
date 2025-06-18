import { useCallback } from 'react';

import IconButton, { type IconButtonProps } from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import { m } from 'framer-motion';
import { usePopover } from 'minimal-shared/hooks';

import { transitionTap, varHover, varTap } from '@/front/components/animate';
import { CustomPopover } from '@/front/components/custom-popover';
import { FlagIcon } from '@/front/components/flag-icon';
import { useTranslate } from '@/front/hooks/use-translate';
import type { AppLocale } from '@/shared/lib/i18n/resources';

// ----------------------------------------------------------------------

export type LanguagePopoverProps = IconButtonProps & {
	data?: {
		value: string;
		label: string;
		countryCode: string;
	}[];
};

export const LanguagePopover = ({
	data = [],
	sx,
	...other
}: LanguagePopoverProps) => {
	const { open, anchorEl, onClose, onOpen } = usePopover();

	const { onChangeLang, currentLang } = useTranslate();

	const handleChangeLang = useCallback(
		(newLang: AppLocale) => {
			onChangeLang(newLang);
			onClose();
		},
		[onChangeLang, onClose],
	);

	const renderMenuList = () => {
		return (
			<CustomPopover open={open} anchorEl={anchorEl} onClose={onClose}>
				<MenuList sx={{ width: 160, minHeight: 72 }}>
					{data?.map((option) => {
						return (
							<MenuItem
								key={option.value}
								selected={option.value === currentLang.value}
								onClick={() => {
									return handleChangeLang(option.value as AppLocale);
								}}
							>
								<FlagIcon code={option.countryCode} />
								{option.label}
							</MenuItem>
						);
					})}
				</MenuList>
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
				aria-label="Languages button"
				onClick={onOpen}
				sx={[
					(theme) => {
						return {
							p: 0,
							width: 40,
							height: 40,
							...(open && { bgcolor: theme.vars.palette.action.selected }),
						};
					},
					...(Array.isArray(sx) ? sx : [sx]),
				]}
				{...other}
			>
				<FlagIcon code={currentLang.countryCode} />
			</IconButton>

			{renderMenuList()}
		</>
	);
};
