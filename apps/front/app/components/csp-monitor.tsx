import { Close as CloseIcon } from '@mui/icons-material';
import {
	Alert,
	AlertTitle,
	Box,
	Collapse,
	IconButton,
	Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';

interface CSPViolation {
	id: string;
	timestamp: Date;
	blockedUri: string;
	documentUri: string;
	violatedDirective: string;
	originalPolicy: string;
}

export const CSPMonitor = () => {
	const [violations, setViolations] = useState<CSPViolation[]>([]);
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		// Only run in development
		if (import.meta.env.DEV) {
			// Listen for CSP violations
			const handleCSPViolation = (event: SecurityPolicyViolationEvent) => {
				const violation: CSPViolation = {
					id: crypto.randomUUID(),
					timestamp: new Date(),
					blockedUri: event.blockedURI || 'unknown',
					documentUri: event.documentURI || 'unknown',
					violatedDirective: event.violatedDirective || 'unknown',
					originalPolicy: event.originalPolicy || 'unknown',
				};

				setViolations((prev) => [violation, ...prev.slice(0, 9)]); // Keep last 10 violations
				setIsOpen(true);
			};

			document.addEventListener('securitypolicyviolation', handleCSPViolation);

			// Also listen for console errors that might be CSP-related
			const originalConsoleError = console.error;
			console.error = (...args) => {
				const message = args.join(' ');
				if (
					message.includes('Content Security Policy') ||
					message.includes('CSP')
				) {
					const violation: CSPViolation = {
						id: crypto.randomUUID(),
						timestamp: new Date(),
						blockedUri: 'console error',
						documentUri: window.location.href,
						violatedDirective: 'console',
						originalPolicy: message,
					};
					setViolations((prev) => [violation, ...prev.slice(0, 9)]);
					setIsOpen(true);
				}
				originalConsoleError.apply(console, args);
			};

			return () => {
				document.removeEventListener(
					'securitypolicyviolation',
					handleCSPViolation,
				);
				console.error = originalConsoleError;
			};
		}
	}, []);

	if (!import.meta.env.DEV || violations.length === 0) {
		return null;
	}

	return (
		<Box
			sx={{
				position: 'fixed',
				bottom: 16,
				right: 16,
				zIndex: 9999,
				maxWidth: 400,
			}}
		>
			<Collapse in={isOpen}>
				<Alert
					severity="warning"
					action={
						<IconButton
							color="inherit"
							size="small"
							onClick={() => setIsOpen(false)}
						>
							<CloseIcon fontSize="inherit" />
						</IconButton>
					}
				>
					<AlertTitle>CSP Violations Detected ({violations.length})</AlertTitle>
					<Box sx={{ mt: 1 }}>
						{violations.slice(0, 3).map((violation) => (
							<Box
								key={violation.id}
								sx={{
									mb: 1,
									p: 1,
									bgcolor: 'rgba(0,0,0,0.05)',
									borderRadius: 1,
								}}
							>
								<Typography
									variant="caption"
									display="block"
									color="text.secondary"
								>
									{violation.timestamp.toLocaleTimeString()}
								</Typography>
								<Typography variant="body2" sx={{ fontWeight: 'bold' }}>
									{violation.violatedDirective}
								</Typography>
								<Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
									Blocked: {violation.blockedUri}
								</Typography>
							</Box>
						))}
						{violations.length > 3 && (
							<Typography variant="caption" color="text.secondary">
								... and {violations.length - 3} more violations
							</Typography>
						)}
					</Box>
				</Alert>
			</Collapse>
		</Box>
	);
};
