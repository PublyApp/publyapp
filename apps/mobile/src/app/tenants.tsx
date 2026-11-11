import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
	EmptyState,
	ErrorState,
	LoadingState,
	Screen,
	SecondaryAction,
	SettingsButton,
} from '@/components/ui';
import { toMessageSpec } from '@/lib/api/client';
import type { TenantSummary, TenantsForPickerResponse } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/auth-context';
import { messageText } from '@/lib/i18n';
import type { MessageSpec } from '@/lib/i18n';

type TenantRowProps = {
	tenant: TenantSummary;
	onSelect: (tenantId: string) => void;
};

const TenantRow = memo(({ tenant, onSelect }: TenantRowProps) => {
	const onPress = useCallback(() => {
		onSelect(tenant.id);
	}, [onSelect, tenant.id]);

	return (
		<Pressable
			accessibilityRole="button"
			className="rounded-control border border-border bg-card px-4 py-4 active:bg-white"
			onPress={onPress}
		>
			<Text className="text-base font-semibold text-foreground">
				{tenant.name}
			</Text>
			<Text className="mt-1 text-sm text-foreground-muted">{tenant.code}</Text>
		</Pressable>
	);
});
TenantRow.displayName = 'TenantRow';

const TenantsScreen = () => {
	const { t } = useTranslation();
	const { request, selectTenant, signOut } = useAuth();
	const router = useRouter();
	const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
	const [errorMessage, setErrorMessage] = useState<MessageSpec | null>(null);

	const load = useCallback(async () => {
		setErrorMessage(null);
		try {
			const result = await request<TenantsForPickerResponse>(
				'/auth/tenants-for-picker',
			);
			setTenants(result.tenants);
		} catch (error) {
			setTenants([]);
			setErrorMessage(toMessageSpec(error, 'mobile-load-organizations-failed'));
		}
	}, [request]);

	useEffect(() => {
		void load();
	}, [load]);

	const onSelect = useCallback(
		(tenantId: string) => {
			selectTenant(tenantId).then(
				() => {
					router.replace('/posts');
				},
				() => {
					setErrorMessage({ key: 'mobile-save-organization-failed' });
				},
			);
		},
		[selectTenant, router],
	);

	const renderTenant = useCallback(
		({ item }: { item: TenantSummary }) => (
			<TenantRow onSelect={onSelect} tenant={item} />
		),
		[onSelect],
	);

	if (tenants === null) {
		return <LoadingState label={t('mobile-loading-organizations')} />;
	}

	if (errorMessage !== null) {
		return (
			<ErrorState
				message={messageText(errorMessage)}
				onRetry={() => {
					setTenants(null);
					void load();
				}}
			>
				<SecondaryAction
					label={t('log-out')}
					onPress={() => {
						void signOut();
					}}
				/>
			</ErrorState>
		);
	}

	return (
		<SafeAreaView className="flex-1 bg-background">
			<Screen>
				<View className="mb-6 flex-row items-center justify-between">
					<View>
						<Text className="text-2xl font-bold text-foreground">
							{t('mobile-choose-organization')}
						</Text>
						<Text className="mt-1 text-sm text-foreground-muted">
							{t('mobile-choose-organization-description')}
						</Text>
					</View>
					<SettingsButton
						onPress={() => {
							router.push('/settings');
						}}
					/>
				</View>

				{tenants.length === 0 ? (
					<EmptyState label={t('mobile-no-organizations')} />
				) : (
					<FlatList
						className="flex-1"
						contentContainerClassName="gap-3 pb-8"
						data={tenants}
						keyExtractor={(tenant) => tenant.id}
						renderItem={renderTenant}
					/>
				)}

				<Pressable
					accessibilityRole="button"
					className="items-center py-3"
					onPress={() => {
						void signOut();
					}}
				>
					<Text className="text-sm text-foreground-muted">{t('log-out')}</Text>
				</Pressable>
			</Screen>
		</SafeAreaView>
	);
};

export default TenantsScreen;
