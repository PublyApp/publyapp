import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider as MuiLocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';

import useTranslate from '../hooks/useTranslate';

// ----------------------------------------------------------------------

type Props = {
	children: React.ReactNode;
};

const MuiDatePickerLocalizationProvider = ({ children }: Props) => {
	const { lang } = useTranslate();

	return (
		<MuiLocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={lang.adapterLocale}>
			{children}
		</MuiLocalizationProvider>
	);
};

export default MuiDatePickerLocalizationProvider;
