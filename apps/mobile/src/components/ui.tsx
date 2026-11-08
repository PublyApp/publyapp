import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

export const Screen = ({ children }: { children: ReactNode }) => (
	<View className="flex-1 bg-background px-5 pt-4">{children}</View>
);

export const LoadingState = ({ label }: { label: string }) => (
	<View className="flex-1 items-center justify-center gap-3 bg-background">
		<ActivityIndicator color="#18181b" />
		<Text className="text-sm text-foreground-muted">{label}</Text>
	</View>
);

export const EmptyState = ({ label }: { label: string }) => (
	<View className="flex-1 items-center justify-center px-8">
		<Text className="text-center text-base text-foreground-muted">{label}</Text>
	</View>
);

export const ErrorState = ({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) => (
	<View className="flex-1 items-center justify-center gap-4 px-8">
		<Text className="text-center text-base text-destructive">{message}</Text>
		<Pressable
			className="rounded-control border border-border bg-card px-4 py-2"
			onPress={onRetry}
		>
			<Text className="text-sm font-medium text-foreground">Réessayer</Text>
		</Pressable>
	</View>
);

export const PrimaryButton = ({
	label,
	onPress,
	disabled,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
}) => (
	<Pressable
		accessibilityRole="button"
		className={
			disabled
				? 'items-center rounded-control bg-border px-4 py-3'
				: 'items-center rounded-control bg-primary px-4 py-3 active:bg-primary-active'
		}
		disabled={disabled}
		onPress={onPress}
	>
		<Text
			className={
				disabled
					? 'text-base font-semibold text-foreground-muted'
					: 'text-base font-semibold text-primary-foreground'
			}
		>
			{label}
		</Text>
	</Pressable>
);
