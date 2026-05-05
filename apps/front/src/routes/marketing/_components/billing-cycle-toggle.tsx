import Box from '@mui/material/Box';

import { type Billing } from '#app/routes/marketing/_data/pricing.ts';

// ----------------------------------------------------------------------

const TRACK_W = 288;
const TRACK_H = 52;
const THUMB_INSET = 6;
const THUMB_W = (TRACK_W - THUMB_INSET * 2) / 2; // 138

// ----------------------------------------------------------------------

type BillingCycleToggleProps = {
	billing: Billing;
	onBillingChange: (next: Billing) => void;
	annualDiscountPct?: number;
};

export const BillingCycleToggle = ({
	billing,
	onBillingChange,
	annualDiscountPct = 20,
}: BillingCycleToggleProps) => {
	const isAnnual = billing === 'annually';

	return (
		<Box
			role="group"
			aria-label="Billing cycle"
			sx={{
				position: 'relative',
				display: 'inline-flex',
				alignItems: 'center',
				width: TRACK_W,
				height: TRACK_H,
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				borderRadius: '16px',
				p: `${THUMB_INSET}px`,
				boxShadow: '0 1px 2px rgba(17,24,39,0.04)',
			}}
		>
			{/* Sliding dark thumb — uses top + bottom insets (not explicit height)
			    so the 1px rail border doesn't squeeze the bottom gap. */}
			<Box
				aria-hidden="true"
				sx={(theme) => ({
					position: 'absolute',
					top: THUMB_INSET,
					bottom: THUMB_INSET,
					left: THUMB_INSET,
					width: THUMB_W,
					bgcolor: '#242424',
					borderRadius: '12px',
					transform: isAnnual ? `translateX(${THUMB_W}px)` : 'translateX(0)',
					transition: 'transform 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
					boxShadow: '0 4px 12px -2px rgba(17,24,39,0.25)',
					pointerEvents: 'none',
					...theme.applyStyles('dark', {
						bgcolor: 'common.white',
						boxShadow: '0 4px 12px -2px rgba(0,0,0,0.40)',
					}),
				})}
			/>

			{/* Monthly button */}
			<Box
				component="button"
				type="button"
				aria-pressed={!isAnnual}
				onClick={() => {
					return onBillingChange('monthly');
				}}
				sx={(theme) => ({
					position: 'relative',
					zIndex: 1,
					flex: 1,
					height: '100%',
					border: 'none',
					background: 'transparent',
					cursor: 'pointer',
					fontSize: 14,
					fontWeight: 700,
					color: isAnnual ? 'text.secondary' : 'common.white',
					transition: 'color 300ms ease',
					...theme.applyStyles('dark', {
						color: isAnnual ? 'text.secondary' : '#242424',
					}),
				})}
			>
				Monthly
			</Box>

			{/* Annually button (with inline -% pill) */}
			<Box
				component="button"
				type="button"
				aria-pressed={isAnnual}
				onClick={() => {
					return onBillingChange('annually');
				}}
				sx={(theme) => ({
					position: 'relative',
					zIndex: 1,
					flex: 1,
					height: '100%',
					border: 'none',
					background: 'transparent',
					cursor: 'pointer',
					fontSize: 14,
					fontWeight: 700,
					color: isAnnual ? 'common.white' : 'text.secondary',
					transition: 'color 300ms ease',
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 0.75,
					...theme.applyStyles('dark', {
						color: isAnnual ? '#242424' : 'text.secondary',
					}),
				})}
			>
				<Box component="span">Annually</Box>
				<Box
					component="span"
					sx={(theme) => ({
						fontSize: 10,
						fontWeight: 800,
						lineHeight: 1.2,
						px: 0.75,
						py: 0.25,
						borderRadius: 999,
						color: isAnnual ? 'common.white' : 'secondary.main',
						bgcolor: isAnnual ? 'rgba(255,255,255,0.18)' : 'secondary.lighter',
						transition: 'all 300ms ease',
						...theme.applyStyles('dark', {
							color: isAnnual ? '#242424' : 'secondary.main',
							bgcolor: isAnnual
								? 'rgba(0,0,0,0.10)'
								: `rgba(${theme.vars.palette.secondary.mainChannel} / 0.16)`,
						}),
					})}
				>
					-{annualDiscountPct}%
				</Box>
			</Box>
		</Box>
	);
};
