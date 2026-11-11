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
		void initI18n().then(() => {
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
