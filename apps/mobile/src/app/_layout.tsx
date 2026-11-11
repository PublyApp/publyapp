import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from '@/components/root-navigator';
import { AuthProvider } from '@/lib/auth/auth-context';

import '../../global.css';

const RootLayout = () => (
	<SafeAreaProvider>
		<AuthProvider>
			<RootNavigator />
			<StatusBar style="dark" />
		</AuthProvider>
	</SafeAreaProvider>
);

export default RootLayout;
