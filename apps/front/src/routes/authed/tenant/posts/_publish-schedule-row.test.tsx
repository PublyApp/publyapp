/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { resolvedLanguage: 'fr', language: 'fr' },
	}),
}));

import { PublishScheduleRow } from './_publish-schedule-row';

process.env.TZ = 'UTC';

afterEach(cleanup);

describe('PublishScheduleRow (#2410)', () => {
	test('shows the French date placeholder, not the browser mm/dd/yyyy', () => {
		render(<PublishScheduleRow disabled={false} onSchedule={vi.fn()} />);

		const date = screen.getByTestId('tenant-posts-schedule-date');
		expect(date.getAttribute('placeholder')).toBe('jj/mm/aaaa');
		expect(date.getAttribute('type')).toBe('text');
		const time = screen.getByTestId('tenant-posts-schedule-time');
		expect(time.getAttribute('placeholder')).toBe('hh:mm');
		expect(time.getAttribute('type')).toBe('text');
	});

	test('reads a French date and the time into one instant', () => {
		const onSchedule = vi.fn();
		render(<PublishScheduleRow disabled={false} onSchedule={onSchedule} />);

		const date = screen.getByTestId('tenant-posts-schedule-date');
		fireEvent.change(date, { target: { value: '02/01/2099' } });
		fireEvent.blur(date);
		const time = screen.getByTestId('tenant-posts-schedule-time');
		fireEvent.change(time, { target: { value: '10:30' } });
		fireEvent.blur(time);
		fireEvent.click(screen.getByTestId('tenant-posts-schedule-submit'));

		expect(onSchedule).toHaveBeenCalledTimes(1);
		const at = onSchedule.mock.calls[0]?.[0] as Date;
		// Pinned instant: 10:30 on the wall clock of the test zone (UTC).
		expect(at.toISOString()).toBe('2099-01-02T10:30:00.000Z');
	});

	test('an invalid date edit blocks Schedule instead of reusing the previous valid date', () => {
		const onSchedule = vi.fn();
		render(<PublishScheduleRow disabled={false} onSchedule={onSchedule} />);

		const date = screen.getByTestId('tenant-posts-schedule-date');
		const submit = screen.getByTestId(
			'tenant-posts-schedule-submit',
		) as HTMLButtonElement;
		fireEvent.change(date, { target: { value: '02/01/2099' } });
		fireEvent.blur(date);
		const time = screen.getByTestId('tenant-posts-schedule-time');
		fireEvent.change(time, { target: { value: '10:30' } });
		fireEvent.blur(time);
		expect(submit.disabled).toBe(false);

		fireEvent.change(date, { target: { value: '31/02/2099' } });
		fireEvent.blur(date);

		expect(screen.getByRole('alert')).toBeTruthy();
		expect(submit.disabled).toBe(true);
		fireEvent.click(submit);
		expect(onSchedule).not.toHaveBeenCalled();

		fireEvent.change(date, { target: { value: '03/01/2099' } });
		fireEvent.blur(date);
		expect(submit.disabled).toBe(false);
	});

	const fill = (testId: string, text: string) => {
		const field = screen.getByTestId(testId);
		fireEvent.change(field, { target: { value: text } });
		fireEvent.blur(field);
	};

	test('shows the time in 24 h in French, whatever 12 h convention was typed', () => {
		render(<PublishScheduleRow disabled={false} onSchedule={vi.fn()} />);

		fill('tenant-posts-schedule-time', '10:30 pm');

		expect(
			(screen.getByTestId('tenant-posts-schedule-time') as HTMLInputElement)
				.value,
		).toBe('22:30');
	});

	test('an invalid time blocks Schedule and shows one message under the fields', () => {
		const onSchedule = vi.fn();
		render(<PublishScheduleRow disabled={false} onSchedule={onSchedule} />);

		fill('tenant-posts-schedule-date', '02/01/2099');
		fill('tenant-posts-schedule-time', '10:30');
		const submit = screen.getByTestId(
			'tenant-posts-schedule-submit',
		) as HTMLButtonElement;
		expect(submit.disabled).toBe(false);

		fill('tenant-posts-schedule-time', '25:99');

		expect(screen.getAllByRole('alert')).toHaveLength(1);
		expect(submit.disabled).toBe(true);
		fireEvent.click(submit);
		expect(onSchedule).not.toHaveBeenCalled();
	});
});
