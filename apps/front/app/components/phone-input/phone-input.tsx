import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import { inputBaseClasses } from '@mui/material/InputBase';
import type { TextFieldProps } from '@mui/material/TextField';
import TextField from '@mui/material/TextField';
import { startTransition, useCallback, useEffect, useState } from 'react';
import { parsePhoneNumber } from 'react-phone-number-input';
import type { Country, Value } from 'react-phone-number-input/input';
import PhoneNumberInput from 'react-phone-number-input/input';

import { countries } from '@/front/assets/data/countries';
import { Iconify } from '@/front/components/iconify';

import { CountryListPopover } from './list-popover';
import type { PhoneInputProps } from './types';

// ----------------------------------------------------------------------

export function PhoneInput({
	sx,
	size,
	value,
	label,
	onChange,
	placeholder,
	disableSelect,
	variant = 'outlined',
	country: inputCountryCode,
	...other
}: PhoneInputProps) {
	const defaultCountryCode = getCountryCode(value, inputCountryCode);

	const [searchCountry, setSearchCountry] = useState('');
	const [selectedCountry, setSelectedCountry] = useState(defaultCountryCode);

	// const hasLabel = !!label;

	const cleanValue = value.replace(/[\s-]+/g, '');

	const handleClear = useCallback(() => {
		onChange('' as Value);
	}, [onChange]);

	useEffect(() => {
		if (!selectedCountry) {
			setSelectedCountry(defaultCountryCode);
		}
	}, [defaultCountryCode, selectedCountry]);

	const handleClickCountry = (inputValue: Country) => {
		startTransition(() => {
			setSelectedCountry(inputValue);
		});
	};

	const handleSearchCountry = (inputValue: string) => {
		setSearchCountry(inputValue);
	};

	return (
		<Box
			sx={[
				() => ({
					'--popover-button-mr': '12px',
					'--popover-button-height': '22px',
					'--popover-button-width': variant === 'standard' ? '48px' : '60px',
					position: 'relative',
					...(!disableSelect && {
						[`& .${inputBaseClasses.input}`]: {
							pl: 'calc(var(--popover-button-width) + var(--popover-button-mr))',
						},
					}),
				}),
				...(Array.isArray(sx) ? sx : [sx]),
			]}
		>
			{!disableSelect && (
				<CountryListPopover
					countries={countries}
					searchCountry={searchCountry}
					countryCode={selectedCountry}
					onClickCountry={handleClickCountry}
					onSearchCountry={handleSearchCountry}
					sx={{
						pl: variant === 'standard' ? 0 : 1.5,
						top: 0,
						bottom: 0,
						my: 'auto',
						height: 'fit-content',
					}}
				/>
			)}

			<PhoneNumberInput
				size={size}
				label={label}
				value={cleanValue}
				variant={variant}
				onChange={onChange}
				hiddenLabel={!label}
				country={selectedCountry}
				inputComponent={CustomInput}
				placeholder={placeholder ?? 'Enter phone number'}
				slotProps={{
					inputLabel: { shrink: true },
					input: {
						endAdornment: cleanValue && (
							<InputAdornment position="end">
								<IconButton size="small" edge="end" onClick={handleClear}>
									<Iconify width={16} icon="mingcute:close-line" />
								</IconButton>
							</InputAdornment>
						),
					},
				}}
				{...other}
			/>
		</Box>
	);
}

// ----------------------------------------------------------------------

function CustomInput({ ref, ...other }: TextFieldProps) {
	return <TextField inputRef={ref} {...other} />;
}

// ----------------------------------------------------------------------

function getCountryCode(inputValue: string, countryCode?: Country): Country {
	if (inputValue) {
		const phoneNumber = parsePhoneNumber(inputValue);
		return phoneNumber?.country as Country;
	}

	return countryCode as Country;
}
