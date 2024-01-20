import { useState } from 'react';

import { Card, Checkbox, Divider, Unstable_Grid2 as Grid, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from '@remix-run/react';

import { FRONT_PATH_NAMES } from '@devist/shared/lib/constants';
import Iconify from '@devist/ui-react/components/Iconify';
import ImageSSR from '@devist/ui-react/components/ImageSSR';
import Label from '@devist/ui-react/components/Label';
import TextMaxLine from '@devist/ui-react/components/TextMaxLine';
import type { IJobProps } from '@devist/ui-react/types/job';
import { fDate } from '@devist/ui-react/utils/date.utils';
import { fCurrency } from '@devist/ui-react/utils/number.utils';

// import { paths } from 'src/routes/paths';
// import type { IJobProps } from 'src/types/job';
// import { fCurrency } from 'src/utils/formatNumber';
// import { fDate } from 'src/utils/formatTime';

// ----------------------------------------------------------------------

type Props = {
	job: IJobProps;
};

const AwesomeToolItem = ({ job }: Props) => {
	const { slug, type, level, salary, location, isUrgent, createdAt, favorited, experience, companyName, companyLogo } =
		job;

	const [favorite, setFavorite] = useState(favorited);

	const handleChangeFavorite = (event: React.ChangeEvent<HTMLInputElement>) => {
		setFavorite(event.target.checked);
	};

	return (
		<Card
			sx={{
				'&:hover': {
					boxShadow: (theme) => {
						return theme.customShadows.z24;
					},
				},
			}}
		>
			<Checkbox
				color="error"
				checked={favorite}
				onChange={handleChangeFavorite}
				icon={<Iconify icon="carbon:favorite" />}
				checkedIcon={<Iconify icon="carbon:favorite-filled" />}
				sx={{ position: 'absolute', right: 16, top: 16 }}
			/>

			<Stack sx={{ p: 3, pb: 0 }}>
				<Stack direction="row" alignItems="center" spacing={2.5}>
					<ImageSSR alt={companyName} src={companyLogo} sx={{ width: 48, height: 48, borderRadius: 1 }} />

					{isUrgent && <Label color="error">Urgent</Label>}
				</Stack>

				<Stack spacing={0.5} sx={{ mt: 3, mb: 2 }}>
					<Link component={RouterLink} to={FRONT_PATH_NAMES.home} color="inherit">
						<TextMaxLine variant="h6" line={1}>
							{slug}
						</TextMaxLine>
					</Link>

					<Typography variant="body2" sx={{ color: 'info.main' }}>
						{companyName}
					</Typography>

					<Stack direction="row" alignItems="center" sx={{ typography: 'body2', color: 'text.secondary' }}>
						<Iconify icon="carbon:location" width={18} sx={{ mr: 0.5 }} />
						{location}
					</Stack>
				</Stack>

				<Typography variant="caption" sx={{ color: 'text.disabled' }}>
					Posted day: {fDate(createdAt)}
				</Typography>
			</Stack>

			<Divider sx={{ borderStyle: 'dashed', my: 2 }} />

			<Grid
				container
				spacing={1.5}
				sx={{
					p: 3,
					pt: 0,
					typography: 'body2',
					color: 'text.secondary',
					textTransform: 'capitalize',
				}}
			>
				<Grid xs={6}>
					<Stack direction="row" alignItems="center" sx={{ typography: 'body2' }}>
						<Iconify icon="carbon:increase-level" sx={{ mr: 1 }} />
						{`${experience} year exp`}
					</Stack>
				</Grid>

				<Grid xs={6}>
					<Stack direction="row" alignItems="center" sx={{ typography: 'body2' }}>
						<Iconify icon="carbon:time" sx={{ mr: 1 }} />
						{type}
					</Stack>
				</Grid>

				<Grid xs={6}>
					<Stack direction="row" alignItems="center" sx={{ typography: 'body2' }}>
						<Iconify icon="carbon:money" sx={{ mr: 1 }} />
						{typeof salary === 'number' ? fCurrency(salary) : salary}
					</Stack>
				</Grid>

				<Grid xs={6}>
					<Stack direction="row" alignItems="center" sx={{ typography: 'body2' }}>
						<Iconify icon="carbon:user" sx={{ mr: 1 }} />
						{level}
					</Stack>
				</Grid>
			</Grid>
		</Card>
	);
};

export default AwesomeToolItem;
