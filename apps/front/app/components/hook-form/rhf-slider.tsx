import Box, { type BoxProps } from '@mui/material/Box';
import type { FormHelperTextProps } from '@mui/material/FormHelperText';
import Slider, { type SliderProps } from '@mui/material/Slider';
import { Controller, useFormContext } from 'react-hook-form';

import { HelperText } from './help-text';

// ----------------------------------------------------------------------

export type RHFSliderProps = SliderProps & {
	name: string;
	helperText?: React.ReactNode;
	slotProps?: {
		wrapper?: BoxProps;
		helperText?: FormHelperTextProps;
	};
};

export function RHFSlider({ name, helperText, slotProps, ...other }: RHFSliderProps) {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => (
				<Box {...slotProps?.wrapper}>
					<Slider {...field} valueLabelDisplay="auto" {...other} />

					<HelperText {...slotProps?.helperText} disableGutters errorMessage={error?.message} helperText={helperText} />
				</Box>
			)}
		/>
	);
}
