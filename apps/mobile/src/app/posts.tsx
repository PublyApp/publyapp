import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	ActivityIndicator,
	FlatList,
	type ListRenderItem,
	Pressable,
	Text,
	View,
} from 'react-native';
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
import type { PostStatus, PostSummary, PostsResponse } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/auth-context';
import { messageText } from '@/lib/i18n';
import type { MessageSpec } from '@/lib/i18n';

// Keys of the shared `common` namespace.
const STATUS_LABEL_KEY = {
	draft: 'draft',
	scheduled: 'scheduled',
	published: 'published',
} as const satisfies Record<PostStatus, string>;

const STATUS_CLASS = {
	draft: {
		pill: 'bg-card border border-border',
		text: 'text-foreground-secondary',
	},
	scheduled: { pill: 'bg-chip-pending-bg', text: 'text-chip-pending-text' },
	published: { pill: 'bg-chip-active-bg', text: 'text-chip-active-text' },
} satisfies Record<PostStatus, { pill: string; text: string }>;

const formatDate = (isoDate: string, language: string): string => {
	const date = new Date(isoDate);
	if (Number.isNaN(date.getTime())) {
		return '';
	}
	return date.toLocaleDateString(language, {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	});
};

const PAGE_SIZE = 20;

const PostCard = ({ post }: { post: PostSummary }) => {
	const { t, i18n } = useTranslation();
	const status = STATUS_CLASS[post.status] ?? STATUS_CLASS.draft;
	return (
		<View className="rounded-control border border-border bg-card px-4 py-4">
			<View className="flex-row items-center justify-between">
				<View className={`rounded-chip px-2 py-1 ${status.pill}`}>
					<Text className={`text-xs font-medium ${status.text}`}>
						{t(STATUS_LABEL_KEY[post.status] ?? 'draft')}
					</Text>
				</View>
				<Text className="text-xs text-foreground-muted">
					{formatDate(post.createdAt, i18n.language)}
				</Text>
			</View>
			<Text className="mt-3 text-base text-foreground" numberOfLines={4}>
				{post.bodyPreview}
			</Text>
		</View>
	);
};

const renderPost: ListRenderItem<PostSummary> = ({ item }) => (
	<PostCard post={item} />
);

const PostsScreen = () => {
	const { t } = useTranslation();
	const { request } = useAuth();
	const router = useRouter();
	const [posts, setPosts] = useState<PostSummary[] | null>(null);
	const [errorMessage, setErrorMessage] = useState<MessageSpec | null>(null);
	const nextCursorRef = useRef<string | null>(null);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [loadMoreError, setLoadMoreError] = useState(false);
	const loadingMoreRef = useRef(false);

	const buildUrl = useCallback((cursor: string | null): string => {
		const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
		if (cursor !== null) {
			params.set('cursor', cursor);
		}
		return `/posts?${params.toString()}`;
	}, []);

	const load = useCallback(async () => {
		setErrorMessage(null);
		nextCursorRef.current = null;
		setLoadMoreError(false);
		try {
			const result = await request<PostsResponse>(buildUrl(null));
			setPosts(result.data);
			nextCursorRef.current = result.nextCursor;
		} catch (error) {
			setPosts([]);
			setErrorMessage(toMessageSpec(error, 'mobile-load-posts-failed'));
		}
	}, [request, buildUrl]);

	useEffect(() => {
		void load();
	}, [load]);

	const loadMore = useCallback(async () => {
		const nextCursor = nextCursorRef.current;
		if (
			loadingMoreRef.current ||
			nextCursor === null ||
			posts === null ||
			posts.length === 0
		) {
			return;
		}
		loadingMoreRef.current = true;
		setIsLoadingMore(true);
		setLoadMoreError(false);
		try {
			const result = await request<PostsResponse>(buildUrl(nextCursor));
			setPosts((prev) =>
				prev === null ? result.data : [...prev, ...result.data],
			);
			nextCursorRef.current = result.nextCursor;
		} catch {
			setLoadMoreError(true);
		} finally {
			setIsLoadingMore(false);
			loadingMoreRef.current = false;
		}
	}, [posts, request, buildUrl]);

	if (posts === null) {
		return <LoadingState label={t('mobile-loading-posts')} />;
	}

	if (errorMessage !== null) {
		return (
			<ErrorState
				message={messageText(errorMessage)}
				onRetry={() => {
					setPosts(null);
					void load();
				}}
			>
				<SecondaryAction
					label={t('mobile-change-organization')}
					onPress={() => {
						router.replace('/tenants');
					}}
				/>
			</ErrorState>
		);
	}

	let listFooter: React.JSX.Element | undefined;
	if (isLoadingMore) {
		listFooter = (
			<View className="py-4">
				<ActivityIndicator />
			</View>
		);
	} else if (loadMoreError) {
		listFooter = (
			<View className="py-4">
				<Pressable
					accessibilityRole="button"
					className="rounded-chip border border-border bg-card px-4 py-2"
					onPress={() => {
						void loadMore();
					}}
				>
					<Text className="text-center text-sm text-foreground">
						{t('mobile-load-more-failed')}
					</Text>
				</Pressable>
			</View>
		);
	}

	return (
		<SafeAreaView className="flex-1 bg-background">
			<Screen>
				<View className="mb-4 flex-row items-end justify-between">
					<View>
						<Text className="text-2xl font-bold text-foreground">
							{t('posts')}
						</Text>
						<Text className="mt-1 text-sm text-foreground-muted">
							{posts.length === 0
								? t('mobile-no-posts')
								: t('mobile-recent-posts')}
						</Text>
					</View>
					<View className="flex-row gap-2">
						<Pressable
							accessibilityRole="button"
							className="rounded-chip border border-border bg-card px-3 py-2"
							onPress={() => {
								router.replace('/tenants');
							}}
						>
							<Text className="text-sm font-medium text-foreground">
								{t('organization')}
							</Text>
						</Pressable>
						<SettingsButton
							onPress={() => {
								router.push('/settings');
							}}
						/>
					</View>
				</View>

				{posts.length === 0 ? (
					<EmptyState label={t('mobile-no-posts-description')} />
				) : (
					<FlatList
						className="flex-1"
						contentContainerClassName="gap-3 pb-8"
						data={posts}
						keyExtractor={(post) => post.id}
						onEndReached={() => {
							void loadMore();
						}}
						onEndReachedThreshold={0.5}
						renderItem={renderPost}
						ListFooterComponent={listFooter}
					/>
				)}
			</Screen>
		</SafeAreaView>
	);
};

export default PostsScreen;
