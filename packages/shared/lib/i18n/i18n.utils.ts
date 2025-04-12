import _ from "lodash";

import type { AppLocale, DefaultLocale, SupportedLanguages } from "./resources";

const appLocales: SupportedLanguages = ["en", "fr"] as const;
const defaultLocale: DefaultLocale = appLocales[0];

export const getCorrectLocale = (
	stringInput: string | undefined | null,
): AppLocale => {
	const lng = appLocales.find((l) => {
		return l === stringInput;
	});

	return lng ?? defaultLocale;
};
