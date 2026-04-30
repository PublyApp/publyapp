import { useEffect } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

/**
 * Triggers form validation when the language changes,
 * but only if the form is dirty or has been submitted.
 * @param language The current language (string)
 * @param methods The react-hook-form methods object
 */
export const useSyncFormToLang = <
	TFieldValues extends FieldValues = FieldValues,
>(
	lng: string,
	methods: UseFormReturn<TFieldValues>,
) => {
	useEffect(
		() => {
			if (/* methods.formState.isDirty &&  */ methods.formState.isSubmitted) {
				methods.trigger();
			}
		},
		// oxlint-disable-next-line react/exhaustive-deps -- This is intended to obtain the desired effect
		[
			lng,
			methods.formState.isDirty,
			methods.formState.isSubmitted,
			methods.trigger,
		],
	);
};
