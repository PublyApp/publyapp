import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider as MuiLocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';

import useLocale from '../hooks/useLocale';

// ----------------------------------------------------------------------

type Props = {
	children: React.ReactNode;
};

const MuiDatePickerLocalizationProvider = ({ children }: Props) => {
	const { lang } = useLocale();

	return (
		<MuiLocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={lang.adapterLocale}>
			{children}
		</MuiLocalizationProvider>
	);
};

export default MuiDatePickerLocalizationProvider;
