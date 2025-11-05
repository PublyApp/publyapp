import { zodResolver } from '@hookform/resolvers/zod';
import { APP_NAME } from '@org/shared/lib/constants';
import { formatDistanceToNow } from 'date-fns';
import { Copy, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { data } from 'react-router';
import { serializeError } from 'serialize-error';
import { z } from 'zod';
import { Badge } from '@/front/components/ui/badge';
import { Button } from '@/front/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/front/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/front/components/ui/dialog';
import { Input } from '@/front/components/ui/input';
import { Label } from '@/front/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/front/components/ui/select';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/front/components/ui/table';
import { toast } from '@/front/components/snackbar';
import { useTranslate } from '@/front/hooks/use-translate';
import { safeRun } from '@/front/lib/react-router/safeRun';
import { getServerAction } from '@/front/lib/react-router/server-data.server';
import type { Route } from './+types/staff-invitations-page';

export const meta = (_: Route.MetaArgs) => {
	return [{ title: `Staff Invitations - ${APP_NAME}` }];
};

const createInvitationSchema = z.object({
	email: z.string().email('Invalid email address'),
	profileId: z.string().uuid('Invalid profile'),
});

type CreateInvitationForm = z.infer<typeof createInvitationSchema>;

export type InvitationsLoaderResult = Awaited<
	ReturnType<typeof loader>
>['data'];

export const loader = async ({ apiClient }: Route.LoaderArgs) => {
	// Fetch staff profiles
	const getProfiles = safeRun(async () => {
		return apiClient.staff.profiles.get();
	});

	const profilesResult = await getProfiles();

	// Fetch invitations
	const getInvitations = safeRun(async () => {
		return apiClient.staff.invitations.get();
	});

	const invitationsResult = await getInvitations();

	return data({
		profiles:
			profilesResult.status === 'success' ? profilesResult.data : null,
		invitations:
			invitationsResult.status === 'success' ? invitationsResult.data : null,
		error:
			profilesResult.status === 'error' || invitationsResult.status === 'error'
				? serializeError(
						profilesResult.status === 'error'
							? profilesResult.error
							: invitationsResult.error,
					)
				: null,
	});
};

export type InvitationActionResult = Awaited<
	ReturnType<typeof action>
>['data'];

export const action = getServerAction({
	action: async ({ request, apiClient }) => {
		const formData = await request.formData();
		const actionType = formData.get('actionType') as string;

		if (actionType === 'create') {
			const email = formData.get('email') as string;
			const profileId = formData.get('profileId') as string;

			const createInvitation = safeRun(async () => {
				return apiClient.staff.invitations.post({
					email,
					profileId,
				});
			});

			const result = await createInvitation();

			if (result.status === 'error') {
				return data({ error: serializeError(result.error), token: null });
			}

			return data({ error: null, token: result.data?.token });
		}

		if (actionType === 'revoke') {
			const invitationId = formData.get('invitationId') as string;

			const revokeInvitation = safeRun(async () => {
				return apiClient.staff.invitations.byInvitationId(invitationId).delete();
			});

			const result = await revokeInvitation();

			if (result.status === 'error') {
				return data({ error: serializeError(result.error), success: false });
			}

			return data({ error: null, success: true });
		}

		return data({ error: 'Invalid action type', success: false });
	},
});

const StaffInvitationsPage = ({
	loaderData,
	actionData,
}: Route.ComponentProps) => {
	const { t } = useTranslate();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [invitationToken, setInvitationToken] = useState<string | null>(
		actionData?.token || null,
	);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const form = useForm<CreateInvitationForm>({
		resolver: zodResolver(createInvitationSchema),
	});

	const profiles = loaderData?.profiles?.profiles || [];
	const invitations = loaderData?.invitations?.invitations || [];

	const onSubmit = async (data: CreateInvitationForm) => {
		setIsSubmitting(true);
		const formData = new FormData();
		formData.append('actionType', 'create');
		formData.append('email', data.email);
		formData.append('profileId', data.profileId);

		// Submit form
		const formElement = document.createElement('form');
		formElement.method = 'POST';
		formElement.style.display = 'none';
		for (const [key, value] of formData.entries()) {
			const input = document.createElement('input');
			input.name = key;
			input.value = value as string;
			formElement.appendChild(input);
		}
		document.body.appendChild(formElement);
		formElement.submit();
	};

	const handleRevoke = async (invitationId: string) => {
		const formData = new FormData();
		formData.append('actionType', 'revoke');
		formData.append('invitationId', invitationId);

		// Submit form
		const formElement = document.createElement('form');
		formElement.method = 'POST';
		formElement.style.display = 'none';
		for (const [key, value] of formData.entries()) {
			const input = document.createElement('input');
			input.name = key;
			input.value = value as string;
			formElement.appendChild(input);
		}
		document.body.appendChild(formElement);
		formElement.submit();
	};

	const copyInvitationLink = () => {
		if (!invitationToken) return;
		const invitationUrl = `${window.location.origin}/auth/accept-invitation/${invitationToken}`;
		navigator.clipboard.writeText(invitationUrl);
		toast.success(t('staff-invitation-link-copied'));
	};

	const getStatusBadge = (invitation: any) => {
		if (invitation.isAccepted) {
			return <Badge variant="default">{t('staff-accepted')}</Badge>;
		}
		if (invitation.isRevoked) {
			return <Badge variant="destructive">{t('staff-revoked')}</Badge>;
		}
		if (new Date(invitation.expiresAt) < new Date()) {
			return <Badge variant="secondary">{t('staff-expired')}</Badge>;
		}
		return <Badge variant="outline">{t('staff-pending')}</Badge>;
	};

	return (
		<div className="container mx-auto py-8">
			<div className="mb-8 flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold">{t('staff-invitations')}</h1>
					<p className="text-muted-foreground">
						{t('staff-invitations-description')}
					</p>
				</div>
				<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
					<DialogTrigger asChild>
						<Button>
							<UserPlus className="mr-2 h-4 w-4" />
							{t('staff-invite-staff')}
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t('staff-invite-staff-member')}</DialogTitle>
							<DialogDescription>
								{t('staff-invite-staff-description')}
							</DialogDescription>
						</DialogHeader>

						{invitationToken ? (
							<div className="space-y-4">
								<p className="text-sm text-green-600">
									{t('staff-invitation-created-success')}
								</p>
								<div className="flex gap-2">
									<Input
										readOnly
										value={`${window.location.origin}/auth/accept-invitation/${invitationToken}`}
									/>
									<Button onClick={copyInvitationLink} variant="outline">
										<Copy className="h-4 w-4" />
									</Button>
								</div>
								<Button
									className="w-full"
									onClick={() => {
										setInvitationToken(null);
										setDialogOpen(false);
										form.reset();
									}}
								>
									{t('common-done')}
								</Button>
							</div>
						) : (
							<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="email">{t('auth-email')}</Label>
									<Input
										id="email"
										type="email"
										{...form.register('email')}
										disabled={isSubmitting}
									/>
									{form.formState.errors.email && (
										<p className="text-sm text-red-500">
											{form.formState.errors.email.message}
										</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="profileId">{t('profile')}</Label>
									<Select
										onValueChange={(value) => form.setValue('profileId', value)}
										disabled={isSubmitting}
									>
										<SelectTrigger>
											<SelectValue placeholder={t('staff-select-profile')} />
										</SelectTrigger>
										<SelectContent>
											{profiles.map((profile: any) => (
												<SelectItem key={profile.id} value={profile.id}>
													{profile.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{form.formState.errors.profileId && (
										<p className="text-sm text-red-500">
											{form.formState.errors.profileId.message}
										</p>
									)}
								</div>

								<Button
									type="submit"
									className="w-full"
									disabled={isSubmitting}
								>
									{isSubmitting
										? t('common-loading')
										: t('staff-send-invitation')}
								</Button>
							</form>
						)}
					</DialogContent>
				</Dialog>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t('staff-invitation-history')}</CardTitle>
					<CardDescription>
						{t('staff-invitation-history-description')}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{loaderData?.error ? (
						<p className="text-red-500">{t('errors-generic')}</p>
					) : invitations.length === 0 ? (
						<p className="text-muted-foreground">{t('staff-no-invitations')}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t('auth-email')}</TableHead>
									<TableHead>{t('profile')}</TableHead>
									<TableHead>{t('staff-invited-by')}</TableHead>
									<TableHead>{t('status')}</TableHead>
									<TableHead>{t('staff-expires')}</TableHead>
									<TableHead>{t('common-actions')}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{invitations.map((invitation: any) => (
									<TableRow key={invitation.id}>
										<TableCell>{invitation.email}</TableCell>
										<TableCell>{invitation.profileName}</TableCell>
										<TableCell>{invitation.invitedByName}</TableCell>
										<TableCell>{getStatusBadge(invitation)}</TableCell>
										<TableCell>
											{formatDistanceToNow(new Date(invitation.expiresAt), {
												addSuffix: true,
											})}
										</TableCell>
										<TableCell>
											{!invitation.isAccepted && !invitation.isRevoked && (
												<Button
													variant="ghost"
													size="sm"
													onClick={() => handleRevoke(invitation.id)}
												>
													{t('staff-revoke')}
												</Button>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
};

export default StaffInvitationsPage;
