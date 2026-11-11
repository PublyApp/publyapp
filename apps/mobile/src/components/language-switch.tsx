import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { changeAppLanguage } from '@/lib/i18n';
import {
	LOCALE_LABELS,
	type SupportedLanguage,
} from '@org/shared-ts/lib/i18n/shared';

/** Display order: « Français · English ». */
const DISPLAY_LANGUAGES = ['fr', 'en'] as const satisfies SupportedLanguage[];

const useCurrentLanguage = (): SupportedLanguage => {
	const { i18n } = useTranslation();
	return i18n.resolvedLanguage === 'en' ? 'en' : 'fr';
};

const useLanguageSelection = () => {
	const [saveFailed, setSaveFailed] = useState(false);
	const selectLanguage = (language: SupportedLanguage) => {
		void changeAppLanguage(language).then((saved) => {
			setSaveFailed(!saved);
		});
	};
	return { saveFailed, selectLanguage };
};

const SaveFailedNotice = ({ visible }: { visible: boolean }) => {
	const { t } = useTranslation();
	if (!visible) {
		return null;
	}
	return (
		<Text className="mt-3 text-center text-sm text-destructive">
			{t('mobile-language-save-failed')}
		</Text>
	);
};

/** Settings screen: one row per language, the current one marked. */
export const LanguageList = () => {
	const current = useCurrentLanguage();
	const { saveFailed, selectLanguage } = useLanguageSelection();
	return (
		<View className="gap-3">
			{DISPLAY_LANGUAGES.map((language) => (
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
			<SaveFailedNotice visible={saveFailed} />
		</View>
	);
};

/** Sign-in screen: compact "Français · English" switch. */
export const LanguageSwitch = () => {
	const current = useCurrentLanguage();
	const { saveFailed, selectLanguage } = useLanguageSelection();
	return (
		<View>
			<View className="flex-row items-center justify-center gap-3">
				{DISPLAY_LANGUAGES.map((language, index) => (
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
			<SaveFailedNotice visible={saveFailed} />
		</View>
	);
};
