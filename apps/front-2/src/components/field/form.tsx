import * as React from 'react';
import {
	FormProvider as RHFForm,
	type FieldValues,
	type UseFormReturn,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { isSupportedLanguage, type SupportedLanguage } from '~/lib/i18n.shared';

import InterZod from '@org/shared-ts/lib/zod/InterZod';

type FormProps<TFieldValues extends FieldValues = FieldValues> = {
	children: React.ReactNode;
	methods: UseFormReturn<TFieldValues>;
	onSubmit?: React.FormEventHandler<HTMLFormElement>;
	slotProps?: {
		form?: React.HTMLAttributes<HTMLFormElement>;
	};
};

const resolveLocale = (value: string | undefined | null): SupportedLanguage => {
	return isSupportedLanguage(value) ? value : 'en';
};

export const Form = <TFieldValues extends FieldValues = FieldValues>({
	children,
	onSubmit,
	methods,
	slotProps,
}: FormProps<TFieldValues>) => {
	const { i18n } = useTranslation();
	const activeLocale = resolveLocale(
		(typeof document === 'undefined'
			? undefined
			: document.documentElement.lang) || i18n.resolvedLanguage,
	);

	if (typeof document !== 'undefined') {
		const interZod = new InterZod({
			i18n: {
				getFixedT: i18n.getFixedT.bind(i18n),
				t: i18n.getFixedT(activeLocale) as never,
			},
			locale: activeLocale,
		});
		z.setErrorMap(interZod.getErrorMap());
	}

	return (
		<RHFForm {...methods}>
			<form
				{...slotProps?.form}
				onSubmit={onSubmit}
				noValidate
				autoComplete="off"
				className="space-y-4"
			>
				{children}
			</form>
		</RHFForm>
	);
};
