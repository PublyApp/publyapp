import Box, { type BoxProps } from '@mui/material/Box';
import {
	FormProvider as RHFForm,
	type FieldValues,
	type UseFormReturn,
} from 'react-hook-form';

// ----------------------------------------------------------------------

export type FormProps<TFieldValues extends FieldValues = FieldValues> = {
	onSubmit?: () => void;
	children: React.ReactNode;
	methods: UseFormReturn<TFieldValues>;
	slotProps?: {
		form?: BoxProps;
	};
};

export const Form = <TFieldValues extends FieldValues = FieldValues>({
	children,
	onSubmit,
	methods,
	slotProps,
}: FormProps<TFieldValues>) => {
	return (
		<RHFForm {...methods}>
			<Box
				component="form"
				onSubmit={onSubmit}
				noValidate
				autoComplete="off"
				{...slotProps?.form}
			>
				{children}
			</Box>
		</RHFForm>
	);
};
