import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import type { PostStatus, PostSummary, PostsResponse } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/auth-context';

const STATUS_LABEL = {
	draft: 'Brouillon',
	scheduled: 'Planifié',
	published: 'Publié',
} satisfies Record<PostStatus, string>;

const STATUS_CLASS = {
	draft: {
		pill: 'bg-card border border-border',
		text: 'text-foreground-secondary',
	},
	scheduled: { pill: 'bg-chip-pending-bg', text: 'text-chip-pending-text' },
	published: { pill: 'bg-chip-active-bg', text: 'text-chip-active-text' },
} satisfies Record<PostStatus, { pill: string; text: string }>;

const formatDate = (isoDate: string): string => {
	const date = new Date(isoDate);
	if (Number.isNaN(date.getTime())) {
		return '';
	}
	const day = String(date.getDate()).padStart(2, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	return `${day}/${month}/${date.getFullYear()}`;
};

const PostsScreen = () => {
	const { request } = useAuth();
	const router = useRouter();
	const [posts, setPosts] = useState<PostSummary[] | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const load = useCallback(async () => {
		setErrorMessage(null);
		try {
			const result = await request<PostsResponse>('/posts?limit=20');
			setPosts(result.data);
		} catch (error) {
			setPosts([]);
			setErrorMessage(
				error instanceof ApiError
					? error.detail
					: 'Impossible de charger les publications.',
			);
		}
	}, [request]);

	useEffect(() => {
		void load();
	}, [load]);

	if (posts === null) {
		return <LoadingState label="Chargement des publications…" />;
	}

	if (errorMessage !== null) {
		return (
			<ErrorState
				message={errorMessage}
				onRetry={() => {
					setPosts(null);
					void load();
				}}
			/>
		);
	}

	return (
		<SafeAreaView className="flex-1 bg-background">
			<Screen>
				<View className="mb-4 flex-row items-end justify-between">
					<View>
						<Text className="text-2xl font-bold text-foreground">
							Publications
						</Text>
						<Text className="mt-1 text-sm text-foreground-muted">
							{posts.length === 0
								? 'Aucune publication'
								: `${posts.length} publication${posts.length > 1 ? 's' : ''}`}
						</Text>
					</View>
					<Pressable
						accessibilityRole="button"
						className="rounded-chip border border-border bg-card px-3 py-2"
						onPress={() => {
							router.replace('/tenants');
						}}
					>
						<Text className="text-sm font-medium text-foreground">
							Organisation
						</Text>
					</Pressable>
				</View>

				{posts.length === 0 ? (
					<EmptyState label="Cette organisation n'a pas encore de publication." />
				) : (
					<FlatList
						className="flex-1"
						contentContainerClassName="gap-3 pb-8"
						data={posts}
						keyExtractor={(post) => post.id}
						renderItem={({ item }) => {
							const status = STATUS_CLASS[item.status] ?? STATUS_CLASS.draft;
							return (
								<View className="rounded-control border border-border bg-card px-4 py-4">
									<View className="flex-row items-center justify-between">
										<View className={`rounded-chip px-2 py-1 ${status.pill}`}>
											<Text className={`text-xs font-medium ${status.text}`}>
												{STATUS_LABEL[item.status] ?? item.status}
											</Text>
										</View>
										<Text className="text-xs text-foreground-muted">
											{formatDate(item.createdAt)}
										</Text>
									</View>
									<Text
										className="mt-3 text-base text-foreground"
										numberOfLines={4}
									>
										{item.bodyPreview}
									</Text>
								</View>
							);
						}}
					/>
				)}
			</Screen>
		</SafeAreaView>
	);
};

export default PostsScreen;
