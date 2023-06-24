'use client';

import { Button as MUIButton } from '@mui/material';

import { Button, Header } from '@aktivpost/ui-react';

export default function Page() {
	return (
		<>
			<Header text="Web" />
			<Button />
			<MUIButton css={{ backgroundColor: 'red' }}>ok</MUIButton>
		</>
	);
}
