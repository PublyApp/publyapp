import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { changeAppLanguage } from '@/lib/i18n';
import {
	LOCALE_LABELS,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from '@org/shared-ts/lib/i18n/shared';

const useCurrentLanguage = (): SupportedLanguage => {
	const { i18n } = useTranslation();
	return i18n.resolvedLanguage === 'en' ? 'en' : 'fr';
};

const selectLanguage = (language: SupportedLanguage) => {
	void changeAppLanguage(language);
};

/** Settings screen: one row per language, the current one marked. */
export const LanguageList = () => {
	const current = useCurrentLanguage();
	return (
		<View className="gap-3">
			{SUPPORTED_LANGUAGES.map((language) => (
				<Pressable
					accessibilityRole="radio"
					accessibilityState={{ selected: language === current }}
					className="flex-row items-center justify-between rounded-control border border-border bg-card px-4 py-4"
					key={language}
					onPress={() => {
						selectLanguage(language);
					}}
				>
					<Text className="text-base font-semibold text-foreground">
						{LOCALE_LABELS[language]}
					</Text>
					<Text className="text-base font-bold text-foreground">
						{language === current ? '✓' : ''}
					</Text>
				</Pressable>
			))}
		</View>
	);
};

/** Sign-in screen: compact "Français · English" switch. */
export const LanguageSwitch = () => {
	const current = useCurrentLanguage();
	return (
		<View className="flex-row items-center justify-center gap-3">
			{SUPPORTED_LANGUAGES.map((language, index) => (
				<View className="flex-row items-center gap-3" key={language}>
					{index > 0 ? (
						<Text className="text-sm text-foreground-muted">·</Text>
					) : null}
					<Pressable
						accessibilityRole="button"
						accessibilityState={{ selected: language === current }}
						className="py-2"
						onPress={() => {
							selectLanguage(language);
						}}
					>
						<Text
							className={
								language === current
									? 'text-sm font-bold text-foreground'
									: 'text-sm text-foreground-muted'
							}
						>
							{LOCALE_LABELS[language]}
						</Text>
					</Pressable>
				</View>
			))}
		</View>
	);
};
