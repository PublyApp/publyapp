import 'dayjs/locale/en';
import 'dayjs/locale/fr';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider as Provider } from '@mui/x-date-pickers/LocalizationProvider';

import { useTranslate } from '../../hooks/use-translate';

// ----------------------------------------------------------------------

type Props = {
	children: React.ReactNode;
};

export const LocalizationProvider = ({ children }: Props) => {
	const { currentLang } = useTranslate();

	return (
		<Provider
			dateAdapter={AdapterDayjs}
			adapterLocale={currentLang.adapterLocale}
		>
			{children}
		</Provider>
	);
};
