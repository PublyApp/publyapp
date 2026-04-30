import Autocomplete, {
	type AutocompleteProps,
	type AutocompleteRenderInputParams,
} from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import { filledInputClasses } from '@mui/material/FilledInput';
import InputAdornment from '@mui/material/InputAdornment';
import { outlinedInputClasses } from '@mui/material/OutlinedInput';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import { useCallback, useMemo } from 'react';

import { countries } from '#app/assets/data/countries.ts';

import { FlagIcon, flagIconClasses } from '../flag-icon';

// ----------------------------------------------------------------------

type Value = string;
type CountrySelectRenderValue = NonNullable<
	AutocompleteProps<Value, boolean, boolean, boolean>['renderValue']
>;

export type AutocompleteBaseProps = Omit<
	// oxlint-disable-next-line typescript/no-explicit-any -- code from template leave as is for now
	AutocompleteProps<any, boolean, boolean, boolean>,
	'options' | 'renderOption' | 'renderInput' | 'renderValue' | 'getOptionLabel'
>;

export type CountrySelectProps = AutocompleteBaseProps & {
	label?: string;
	error?: boolean;
	placeholder?: string;
	hiddenLabel?: boolean;
	getValue?: 'label' | 'code';
	helperText?: React.ReactNode;
	variant?: TextFieldProps['variant'];
};

export const CountrySelect = ({
	id,
	label,
	error,
	variant,
	multiple,
	helperText,
	hiddenLabel,
	placeholder,
	getValue = 'label',
	...other
}: CountrySelectProps) => {
	const options = useMemo(() => {
		return countries.map((country) => {
			return getValue === 'label' ? country.label : country.code;
		});
	}, [getValue]);

	const getCountry = useCallback((inputValue: string) => {
		const country = countries.find((op) => {
			return (
				op.label === inputValue ||
				op.code === inputValue ||
				op.phone === inputValue
			);
		});
		return {
			code: country?.code || '',
			label: country?.label || '',
			phone: country?.phone || '',
		};
	}, []);

	const renderOption = useCallback(
		(props: React.HTMLAttributes<HTMLLIElement>, option: Value) => {
			const country = getCountry(option);

			return (
				<li {...props} key={country.label}>
					<FlagIcon
						key={country.label}
						code={country.code}
						sx={{
							mr: 1,
							width: 22,
							height: 22,
							borderRadius: '50%',
						}}
					/>
					{country.label} ({country.code}) +{country.phone}
				</li>
			);
		},
		[getCountry],
	);

	const renderInput = useCallback(
		(params: AutocompleteRenderInputParams) => {
			const country = getCountry(params.inputProps.value as Value);

			const baseField = {
				...params,
				label,
				variant,
				placeholder,
				helperText,
				hiddenLabel,
				error: !!error,
				inputProps: { ...params.inputProps, autoComplete: 'new-password' },
			};

			if (multiple) {
				return <TextField {...baseField} />;
			}

			return (
				<TextField
					{...baseField}
					slotProps={{
						input: {
							...params.InputProps,
							startAdornment: (
								<InputAdornment
									position="start"
									sx={{ ...(!country.code && { display: 'none' }) }}
								>
									<FlagIcon
										key={country.label}
										code={country.code}
										sx={{ width: 22, height: 22, borderRadius: '50%' }}
									/>
								</InputAdornment>
							),
						},
					}}
					sx={{
						[`& .${outlinedInputClasses.root}`]: {
							[`& .${flagIconClasses.root}`]: { ml: 0.5, mr: -0.5 },
						},
						[`& .${filledInputClasses.root}`]: {
							[`& .${flagIconClasses.root}`]: {
								ml: 0.5,
								mr: -0.5,
								mt: hiddenLabel ? 0 : -2,
							},
						},
					}}
				/>
			);
		},
		[
			getCountry,
			label,
			variant,
			placeholder,
			helperText,
			hiddenLabel,
			error,
			multiple,
		],
	);

	const renderValue = useCallback<CountrySelectRenderValue>(
		(selected, getItemProps) => {
			if (!Array.isArray(selected)) {
				return null;
			}

			return selected.map((option, index) => {
				const country = getCountry(option);

				return (
					<Chip
						{...getItemProps({ index })}
						key={country.label}
						label={country.label}
						size="small"
						variant="soft"
						icon={
							<FlagIcon
								key={country.label}
								code={country.code}
								sx={{ width: 16, height: 16, borderRadius: '50%' }}
							/>
						}
					/>
				);
			});
		},
		[getCountry],
	);

	const getOptionLabel = useCallback(
		(option: Value) => {
			if (getValue === 'code') {
				const country = countries.find((op) => {
					return op.code === option;
				});
				return country?.label ?? '';
			}

			return option;
		},
		[getValue],
	);

	return (
		<Autocomplete
			id={`${id}-country-select`}
			multiple={multiple}
			options={options}
			autoHighlight={!multiple}
			disableCloseOnSelect={multiple}
			renderOption={renderOption}
			renderInput={renderInput}
			renderValue={multiple ? renderValue : undefined}
			getOptionLabel={getOptionLabel}
			{...other}
		/>
	);
};
