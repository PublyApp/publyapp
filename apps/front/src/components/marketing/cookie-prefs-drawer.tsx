import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import {
	type CookieConsent,
	COOKIE_CONSENT_POLICY_VERSION,
	OPTIONAL_COOKIE_CATEGORIES,
	REJECT_ALL_CONSENT,
	useCookieConsentStore,
} from '~/lib/store/cookie-consent-store';

const CATEGORY_LABEL_KEYS = {
	functional: 'marketing-cookies-functional',
	analytics: 'marketing-cookies-analytics',
	marketing: 'marketing-cookies-marketing',
} satisfies Record<string, string>;

const CATEGORY_DESCRIPTION_KEYS = {
	functional: 'marketing-cookies-functional-description',
	analytics: 'marketing-cookies-analytics-description',
	marketing: 'marketing-cookies-marketing-description',
} satisfies Record<string, string>;

/**
 * Cookie preferences (#1038) — a right-side drawer, never a centred modal.
 *
 * The categories are squared 5px `Checkbox` primitives, not switches: a
 * fully-rounded (999px) switch track is banned by the radii rule, and the
 * existing Base UI checkbox already satisfies both that rule and the
 * keyboard model.
 * (The handoff's "no checkbox primitive exists" flag is stale.)
 *
 * Essential is rendered as a permanently checked, disabled row rather than
 * omitted: a consent surface that hides the cookies you cannot refuse is
 * less honest, not more.
 */
export const CookiePrefsDrawer = ({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const { t } = useTranslation('common');
	const storedConsent = useCookieConsentStore((state) => state.consent);
	const savePreferences = useCookieConsentStore(
		(state) => state.savePreferences,
	);
	const rejectAll = useCookieConsentStore((state) => state.rejectAll);
	const [draft, setDraft] = useState<CookieConsent>(storedConsent);

	// Re-seed the draft from the stored decision every time the drawer opens:
	// an abandoned edit must never leak into the next visit to this surface.
	useEffect(() => {
		if (open) {
			setDraft(storedConsent);
		}
	}, [open, storedConsent]);

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent
				id="marketing-cookie-preferences"
				data-testid="cookie-prefs-drawer"
			>
				<DrawerHeader>
					<DrawerTitle>{t('marketing-cookies-title')}</DrawerTitle>
					{/* The shared drawer-description style now uses the
					    secondary foreground step and passes AA at this size
					    (#1043). This surface still steps up one more to the
					    muted foreground, the marketing AA-floor step the shell
					    spec reserves for marketing surfaces (same choice as
					    .publy-marketing-eyebrow), so the cookie drawer
					    description reads at the same weight as the rest of
					    the marketing copy it sits among. This is the one
					    override that sits closest to the 4.5:1 floor (round 5
					    M8) — deliberate, and pinned by both the source guard
					    and the browser spec. */}
					<DrawerDescription className="text-(--publy-foreground-muted)">
						{t('marketing-cookies-policy-version', {
							version: COOKIE_CONSENT_POLICY_VERSION,
						})}
					</DrawerDescription>
				</DrawerHeader>
				<DrawerBody className="flex flex-col gap-5">
					<div className="flex items-start gap-3">
						<Checkbox
							checked
							disabled
							aria-label={t('marketing-cookies-essential')}
							data-testid="cookie-category-essential"
							className="mt-0.5"
						/>
						<span className="flex flex-col gap-1">
							<span className="flex items-center gap-2 text-sm font-medium text-foreground">
								{t('marketing-cookies-essential')}
								<span className="publy-type-helper text-(--publy-foreground-muted)">
									{t('marketing-cookies-always-on')}
								</span>
							</span>
							<span className="text-[13px] leading-5 text-(--publy-foreground-muted)">
								{t('marketing-cookies-essential-description')}
							</span>
						</span>
					</div>
					{OPTIONAL_COOKIE_CATEGORIES.map((category) => (
						<label
							key={category}
							className="flex cursor-pointer items-start gap-3"
						>
							<Checkbox
								checked={draft[category]}
								onCheckedChange={(checked) =>
									setDraft((previous) => ({
										...previous,
										[category]: checked === true,
									}))
								}
								data-testid={`cookie-category-${category}`}
								className="mt-0.5"
							/>
							<span className="flex flex-col gap-1">
								<span className="text-sm font-medium text-foreground">
									{t(CATEGORY_LABEL_KEYS[category])}
								</span>
								<span className="text-[13px] leading-5 text-(--publy-foreground-muted)">
									{t(CATEGORY_DESCRIPTION_KEYS[category])}
								</span>
							</span>
						</label>
					))}
					<p className="publy-type-helper text-(--publy-foreground-muted)">
						{t('marketing-cookies-close-note')}
					</p>
				</DrawerBody>
				<DrawerFooter className="flex items-center justify-end gap-2">
					<Button
						variant="outline"
						size="sm"
						data-testid="cookie-prefs-reject-all"
						onClick={() => {
							setDraft(REJECT_ALL_CONSENT);
							rejectAll();
							onOpenChange(false);
						}}
					>
						{t('marketing-cookies-reject-all')}
					</Button>
					<Button
						size="sm"
						data-testid="cookie-prefs-save"
						onClick={() => {
							savePreferences(draft);
							onOpenChange(false);
						}}
					>
						{t('marketing-cookies-save')}
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
};
