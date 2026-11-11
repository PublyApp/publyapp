import * as SecureStore from 'expo-secure-store';

const LANGUAGE_KEY = 'publy.language';

export const readStoredLanguage = (): Promise<string | null> =>
	SecureStore.getItemAsync(LANGUAGE_KEY);

export const writeStoredLanguage = (language: string): Promise<void> =>
	SecureStore.setItemAsync(LANGUAGE_KEY, language);
