import { Button } from '@heroui/react';
import { useNavigate } from '@tanstack/react-router';

export const View403 = () => {
	const navigate = useNavigate();

	return (
		<div className="p-6">
			<div>You are not allowed to access this resource.</div>
			<Button
				variant="primary"
				onPress={() => {
					navigate({ to: '/login' });
				}}
			>
				Back to Login
			</Button>
		</div>
	);
};
