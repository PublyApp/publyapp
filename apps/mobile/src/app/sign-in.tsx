import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	Text,
	TextInput,
	View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';

const SignInScreen = () => {
	const { signIn } = useAuth();
	const router = useRouter();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const canSubmit = email.trim().length > 0 && password.length > 0;

	const onSubmit = async () => {
		setErrorMessage(null);
		setIsSubmitting(true);
		try {
			await signIn(email.trim(), password);
			router.replace('/');
		} catch (error) {
			setErrorMessage(
				error instanceof ApiError ? error.detail : 'Connexion impossible.',
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<SafeAreaView className="flex-1 bg-background">
			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : undefined}
				className="flex-1"
			>
				<ScrollView
					contentContainerClassName="flex-grow justify-center px-6 py-10"
					keyboardShouldPersistTaps="handled"
				>
					<Text className="text-3xl font-bold text-foreground">PublyApp</Text>
					<Text className="mt-2 text-base text-foreground-muted">
						Connectez-vous pour retrouver vos publications.
					</Text>

					<View className="mt-8 gap-4">
						<View className="gap-2">
							<Text className="text-sm font-medium text-foreground-secondary">
								Adresse e-mail
							</Text>
							<TextInput
								autoCapitalize="none"
								autoComplete="email"
								className="rounded-field border border-input bg-white px-3 py-3 text-base text-foreground"
								keyboardType="email-address"
								onChangeText={setEmail}
								placeholder="vous@exemple.fr"
								placeholderTextColor="#6b6b73"
								value={email}
							/>
						</View>

						<View className="gap-2">
							<Text className="text-sm font-medium text-foreground-secondary">
								Mot de passe
							</Text>
							<TextInput
								className="rounded-field border border-input bg-white px-3 py-3 text-base text-foreground"
								onChangeText={setPassword}
								placeholder="••••••••"
								placeholderTextColor="#6b6b73"
								secureTextEntry
								value={password}
							/>
						</View>

						{errorMessage === null ? null : (
							<Text className="text-sm text-destructive">{errorMessage}</Text>
						)}

						<PrimaryButton
							disabled={!canSubmit || isSubmitting}
							label={isSubmitting ? 'Connexion…' : 'Se connecter'}
							onPress={() => {
								void onSubmit();
							}}
						/>
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
};

export default SignInScreen;
