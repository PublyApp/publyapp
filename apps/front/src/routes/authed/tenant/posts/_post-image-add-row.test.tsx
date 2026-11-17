/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import {
	PostImageAddRow,
	PostImageNoticeFailure,
	PostImageNoticeFull,
	PostImageNoticeLimitReached,
	PostImageNoticeNoCommonType,
} from './_post-image-add-row';

afterEach(cleanup);

describe('PostImageAddRow notice parts', () => {
	test('renders only the notices composed as children, with their test ids', () => {
		render(
			<PostImageAddRow
				inputId="img"
				limits={null}
				addDisabled
				onPick={() => undefined}
			>
				<PostImageNoticeNoCommonType />
				<PostImageNoticeLimitReached max={4} />
				<PostImageNoticeFull max={4} />
				<PostImageNoticeFailure message="boom" />
			</PostImageAddRow>,
		);

		expect(
			screen.getByTestId('tenant-posts-create-image-no-common-type'),
		).toBeTruthy();
		expect(screen.getByTestId('tenant-posts-create-image-limit')).toBeTruthy();
		expect(screen.getByTestId('tenant-posts-create-image-full')).toBeTruthy();
		expect(screen.getByRole('alert').textContent).toBe('boom');
	});

	test('renders no notice when none is composed', () => {
		render(
			<PostImageAddRow
				inputId="img"
				limits={null}
				addDisabled={false}
				onPick={() => undefined}
			/>,
		);

		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.queryByTestId('tenant-posts-create-image-full')).toBeNull();
	});
});
