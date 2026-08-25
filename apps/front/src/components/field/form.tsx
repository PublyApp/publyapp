import * as React from 'react';
import {
	FormProvider as RHFForm,
	type FieldValues,
	type UseFormReturn,
} from 'react-hook-form';
import { cn } from '~/lib/utils';

type FormProps<TFieldValues extends FieldValues = FieldValues> = {
	children: React.ReactNode;
	methods: UseFormReturn<TFieldValues>;
	onSubmit?: React.SubmitEventHandler<HTMLFormElement>;
	slotProps?: {
		form?: React.HTMLAttributes<HTMLFormElement>;
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
			<form
				{...slotProps?.form}
				onSubmit={onSubmit}
				noValidate
				autoComplete="off"
				className={cn('space-y-4', slotProps?.form?.className)}
			>
				{children}
			</form>
		</RHFForm>
	);
};
