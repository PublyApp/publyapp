import Box, { type BoxProps } from '@mui/material/Box';
import { FormProvider as RHFForm, type UseFormReturn } from 'react-hook-form';

// ----------------------------------------------------------------------

export type FormProps = {
	onSubmit?: () => void;
	children: React.ReactNode;
	// oxlint-disable-next-line typescript/no-explicit-any -- code from template leave as is for now
	methods: UseFormReturn<any>;
	slotProps?: {
		form?: BoxProps;
	};
};

export const Form = ({ children, onSubmit, methods, slotProps }: FormProps) => {
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
