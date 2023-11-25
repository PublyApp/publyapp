import { useState } from 'react';

import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Unstable_Grid2';

import { FRONT_PATH_NAMES } from '@devist/shared/lib/constants';
import Iconify from '@devist/ui-react/components/Iconify';
import Image from '@devist/ui-react/components/Image';
import Label from '@devist/ui-react/components/Label';
import TextMaxLine from '@devist/ui-react/components/TextMaxLine';
import type { IJobProps } from '@devist/ui-react/types/job';
import { fDate } from '@devist/ui-react/utils/date.utils';
import { fCurrency } from '@devist/ui-react/utils/number.utils';

import RouterLink from '@front/components/RouterLink';

// ----------------------------------------------------------------------

type Props = {
	job: IJobProps;
};

const CareerJobItem = ({ job }: Props) => {
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
					<Image alt={companyName} src={companyLogo} sx={{ width: 48, height: 48, borderRadius: 1 }} />

					{isUrgent && <Label color="error">Urgent</Label>}
				</Stack>

				<Stack spacing={0.5} sx={{ mt: 3, mb: 2 }}>
					<Link component={RouterLink} href={FRONT_PATH_NAMES.job} color="inherit">
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

export default CareerJobItem;
