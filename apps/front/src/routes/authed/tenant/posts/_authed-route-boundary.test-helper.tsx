import { Component } from 'react';
import type { ReactNode } from 'react';

import { AuthedLayoutErrorBoundary } from '../../_layout-error-boundary';

/** The authed route's own error boundary around a page under test: a thrown
 * 401 must end in the logout redirect, anything else in the error view. The
 * test file stubs `LogoutRedirect` and `useRouter`. */
type BoundaryState = { failure: { cause: unknown } | null };

export class AuthedRouteBoundary extends Component<
	{ children: ReactNode },
	BoundaryState
> {
	state: BoundaryState = { failure: null };

	static getDerivedStateFromError(cause: unknown) {
		return { failure: { cause } };
	}

	render() {
		if (this.state.failure !== null) {
			return (
				<AuthedLayoutErrorBoundary
					error={this.state.failure.cause}
					reset={() => undefined}
				/>
			);
		}
		return this.props.children;
	}
}
