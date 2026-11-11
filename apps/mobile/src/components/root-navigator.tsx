import { useRouter, useSegments, Stack } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth/auth-context';

/**
 * Root navigator: the session guard lives here so a 401 anywhere lands the
 * user back on sign-in (the auth context clears the token first).
 */
export const RootNavigator = () => {
	const { status } = useAuth();
	const segments = useSegments();
	const router = useRouter();

	useEffect(() => {
		if (status === 'loading') {
			return;
		}
		const onSignInScreen = segments[0] === 'sign-in';
		if (status === 'signed-out' && !onSignInScreen) {
			router.replace('/sign-in');
		}
	}, [status, segments, router]);

	return (
		<Stack
			screenOptions={{
				headerShown: false,
				contentStyle: { backgroundColor: '#f7f7f7' },
			}}
		>
			<Stack.Screen name="sign-in" />
			<Stack.Screen name="tenants" />
			<Stack.Screen name="posts" />
			<Stack.Screen name="settings" />
		</Stack>
	);
};
