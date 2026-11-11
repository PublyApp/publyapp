import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from '@/components/root-navigator';
import { AuthProvider } from '@/lib/auth/auth-context';
import { initI18n } from '@/lib/i18n';

import '../../global.css';

const RootLayout = () => {
	const [isI18nReady, setIsI18nReady] = useState(false);

	useEffect(() => {
		// initI18n falls back to French itself; finally guards any other failure.
		void initI18n()
			.catch((error: unknown) => {
				console.warn('i18n init failed', error);
			})
			.finally(() => {
				setIsI18nReady(true);
			});
	}, []);

	// Wait for the saved language so no screen flashes in the wrong one.
	if (!isI18nReady) {
		return null;
	}

	return (
		<SafeAreaProvider>
			<AuthProvider>
				<RootNavigator />
				<StatusBar style="dark" />
			</AuthProvider>
		</SafeAreaProvider>
	);
};

export default RootLayout;
