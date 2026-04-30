import IconButton, { type IconButtonProps } from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import { m } from 'framer-motion';
import { usePopover } from 'minimal-shared/hooks';
import { useCallback } from 'react';

import type { AppLocale } from '@org/shared-ts/lib/i18n/resources';

import {
	transitionTap,
	varHover,
	varTap,
} from '#app/components/animate/index.ts';
import { CustomPopover } from '#app/components/custom-popover/index.ts';
import type { CustomPopoverProps } from '#app/components/custom-popover/types.ts';
import { FlagIcon } from '#app/components/flag-icon/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

// ----------------------------------------------------------------------

export type LanguagePopoverProps = IconButtonProps & {
	data?: {
		value: string;
		label: string;
		countryCode: string;
	}[];
	popoverSlotProps?: CustomPopoverProps['slotProps'];
};

const EMPTY_LANGUAGE_OPTIONS: NonNullable<LanguagePopoverProps['data']> = [];

export const LanguagePopover = ({
	data = EMPTY_LANGUAGE_OPTIONS,
	popoverSlotProps,
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

			<CustomPopover
				open={open}
				anchorEl={anchorEl}
				onClose={onClose}
				slotProps={popoverSlotProps}
			>
				<MenuList sx={{ width: 160 }}>
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
		</>
	);
};
