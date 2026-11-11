import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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

/** Extra exits (switch organisation, sign out) are composed as children. */
export const ErrorState = ({
	message,
	onRetry,
	children,
}: {
	message: string;
	onRetry: () => void;
	children?: ReactNode;
}) => {
	const { t } = useTranslation();
	return (
		<View className="flex-1 items-center justify-center gap-4 px-8">
			<Text className="text-center text-base text-destructive">{message}</Text>
			<Pressable
				className="rounded-control border border-border bg-card px-4 py-2"
				onPress={onRetry}
			>
				<Text className="text-sm font-medium text-foreground">
					{t('retry')}
				</Text>
			</Pressable>
			{children}
		</View>
	);
};

export const SecondaryAction = ({
	label,
	onPress,
}: {
	label: string;
	onPress: () => void;
}) => (
	<Pressable accessibilityRole="button" className="py-2" onPress={onPress}>
		<Text className="text-sm text-foreground-muted">{label}</Text>
	</Pressable>
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

export const SettingsButton = ({ onPress }: { onPress: () => void }) => {
	const { t } = useTranslation();
	return (
		<Pressable
			accessibilityLabel={t('settings')}
			accessibilityRole="button"
			className="h-10 w-10 items-center justify-center rounded-chip border border-border bg-card"
			onPress={onPress}
		>
			<Text className="text-lg text-foreground">⚙</Text>
		</Pressable>
	);
};
