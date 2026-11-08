import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import type { TenantSummary, TenantsForPickerResponse } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/auth-context';

const TenantsScreen = () => {
	const { request, selectTenant, signOut } = useAuth();
	const router = useRouter();
	const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const load = useCallback(async () => {
		setErrorMessage(null);
		try {
			const result = await request<TenantsForPickerResponse>(
				'/auth/tenants-for-picker',
			);
			setTenants(result.tenants);
		} catch (error) {
			setTenants([]);
			setErrorMessage(
				error instanceof ApiError
					? error.detail
					: 'Impossible de charger vos organisations.',
			);
		}
	}, [request]);

	useEffect(() => {
		void load();
	}, [load]);

	const onSelect = async (tenantId: string) => {
		await selectTenant(tenantId);
		router.replace('/posts');
	};

	if (tenants === null) {
		return <LoadingState label="Chargement des organisations…" />;
	}

	if (errorMessage !== null) {
		return (
			<ErrorState
				message={errorMessage}
				onRetry={() => {
					setTenants(null);
					void load();
				}}
			/>
		);
	}

	return (
		<SafeAreaView className="flex-1 bg-background">
			<Screen>
				<View className="mb-6 flex-row items-center justify-between">
					<View>
						<Text className="text-2xl font-bold text-foreground">
							Choisir une organisation
						</Text>
						<Text className="mt-1 text-sm text-foreground-muted">
							Vos publications sont propres à chaque organisation.
						</Text>
					</View>
				</View>

				{tenants.length === 0 ? (
					<EmptyState label="Aucune organisation disponible pour ce compte." />
				) : (
					<FlatList
						className="flex-1"
						contentContainerClassName="gap-3 pb-8"
						data={tenants}
						keyExtractor={(tenant) => tenant.id}
						renderItem={({ item }) => (
							<Pressable
								accessibilityRole="button"
								className="rounded-control border border-border bg-card px-4 py-4 active:bg-white"
								onPress={() => {
									void onSelect(item.id);
								}}
							>
								<Text className="text-base font-semibold text-foreground">
									{item.name}
								</Text>
								<Text className="mt-1 text-sm text-foreground-muted">
									{item.code}
								</Text>
							</Pressable>
						)}
					/>
				)}

				<Pressable
					accessibilityRole="button"
					className="items-center py-3"
					onPress={() => {
						void signOut();
					}}
				>
					<Text className="text-sm text-foreground-muted">Se déconnecter</Text>
				</Pressable>
			</Screen>
		</SafeAreaView>
	);
};

export default TenantsScreen;
