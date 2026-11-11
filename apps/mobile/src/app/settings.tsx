import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageList } from '@/components/language-switch';
import { Screen, SecondaryAction } from '@/components/ui';
import { useAuth } from '@/lib/auth/auth-context';

const SettingsScreen = () => {
	const { t } = useTranslation();
	const { signOut } = useAuth();
	const router = useRouter();

	return (
		<SafeAreaView className="flex-1 bg-background">
			<Screen>
				<View className="mb-6 flex-row items-center justify-between">
					<Text className="text-2xl font-bold text-foreground">
						{t('settings')}
					</Text>
					<Pressable
						accessibilityRole="button"
						className="rounded-chip border border-border bg-card px-3 py-2"
						onPress={() => {
							router.back();
						}}
					>
						<Text className="text-sm font-medium text-foreground">
							{t('back')}
						</Text>
					</Pressable>
				</View>

				<Text className="mb-3 text-sm font-medium text-foreground-secondary">
					{t('language')}
				</Text>
				<LanguageList />

				<View className="mt-8 items-center">
					<SecondaryAction
						label={t('log-out')}
						onPress={() => {
							void signOut();
						}}
					/>
				</View>
			</Screen>
		</SafeAreaView>
	);
};

export default SettingsScreen;
