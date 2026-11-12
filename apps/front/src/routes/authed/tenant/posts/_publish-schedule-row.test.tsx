/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
	vi,
} from 'vitest';

const lang = vi.hoisted(() => ({ current: 'fr' }));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { resolvedLanguage: lang.current, language: lang.current },
	}),
}));

import { PublishScheduleRow } from './_publish-schedule-row';

const originalTz = process.env.TZ;

beforeAll(() => {
	process.env.TZ = 'UTC';
});

afterAll(() => {
	if (originalTz === undefined) {
		delete process.env.TZ;
	} else {
		process.env.TZ = originalTz;
	}
});

afterEach(() => {
	cleanup();
	lang.current = 'fr';
});

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

		const alerts = screen.getAllByRole('alert');
		expect(alerts).toHaveLength(1);
		expect(alerts[0]?.textContent).toContain('posts:schedule-time-invalid');
		const timeField = screen.getByTestId('tenant-posts-schedule-time');
		expect(timeField.getAttribute('aria-invalid')).toBe('true');
		expect(timeField.getAttribute('aria-describedby')).toBe(alerts[0]?.id);
		fireEvent.click(submit);
		expect(onSchedule).not.toHaveBeenCalled();
	});

	test('both fields invalid: both point at the one rendered message', () => {
		render(<PublishScheduleRow disabled={false} onSchedule={vi.fn()} />);

		fill('tenant-posts-schedule-date', '31/02/2099');
		fill('tenant-posts-schedule-time', '25:99');

		const alert = screen.getByRole('alert');
		expect(alert.textContent).toContain('posts:schedule-both-invalid');
		for (const id of ['date', 'time']) {
			const field = screen.getByTestId(`tenant-posts-schedule-${id}`);
			expect(field.getAttribute('aria-describedby')).toBe(alert.id);
			expect(field.getAttribute('aria-errormessage')).toBe(alert.id);
			expect(document.getElementById(alert.id)).toBe(alert);
		}
	});

	test('typing a valid time then clicking Schedule works without a prior blur', async () => {
		const user = userEvent.setup();
		const onSchedule = vi.fn();
		render(<PublishScheduleRow disabled={false} onSchedule={onSchedule} />);

		fill('tenant-posts-schedule-date', '02/01/2099');
		await user.type(screen.getByTestId('tenant-posts-schedule-time'), '10:30');
		await user.click(screen.getByTestId('tenant-posts-schedule-submit'));

		expect(onSchedule).toHaveBeenCalledTimes(1);
		expect((onSchedule.mock.calls[0]?.[0] as Date).toISOString()).toBe(
			'2099-01-02T10:30:00.000Z',
		);
	});

	test('typing an invalid time then clicking Schedule shows the error and sends nothing', async () => {
		const user = userEvent.setup();
		const onSchedule = vi.fn();
		render(<PublishScheduleRow disabled={false} onSchedule={onSchedule} />);

		fill('tenant-posts-schedule-date', '02/01/2099');
		await user.type(screen.getByTestId('tenant-posts-schedule-time'), '25:99');
		await user.click(screen.getByTestId('tenant-posts-schedule-submit'));

		expect(onSchedule).not.toHaveBeenCalled();
		expect(screen.getByRole('alert').textContent).toContain(
			'posts:schedule-time-invalid',
		);
	});

	test('English: 10:30 PM is shown as typed and stored as 22:30', () => {
		lang.current = 'en';
		const onSchedule = vi.fn();
		render(<PublishScheduleRow disabled={false} onSchedule={onSchedule} />);

		const time = screen.getByTestId('tenant-posts-schedule-time');
		expect(time.getAttribute('placeholder')).toBe('hh:mm AM');
		expect(time.getAttribute('inputmode')).toBe('text');
		fill('tenant-posts-schedule-date', '01/02/2099');
		fill('tenant-posts-schedule-time', '10:30 PM');
		expect((time as HTMLInputElement).value).toBe('10:30 PM');
		fireEvent.click(screen.getByTestId('tenant-posts-schedule-submit'));

		expect((onSchedule.mock.calls[0]?.[0] as Date).toISOString()).toBe(
			'2099-01-02T22:30:00.000Z',
		);
	});

	test('French keeps the numeric keypad', () => {
		render(<PublishScheduleRow disabled={false} onSchedule={vi.fn()} />);
		expect(
			screen
				.getByTestId('tenant-posts-schedule-time')
				.getAttribute('inputmode'),
		).toBe('numeric');
	});

	test('clicking Schedule with only a date shows the incomplete message, never a silent no-op', () => {
		const onSchedule = vi.fn();
		render(<PublishScheduleRow disabled={false} onSchedule={onSchedule} />);

		fill('tenant-posts-schedule-date', '02/01/2099');
		fireEvent.click(screen.getByTestId('tenant-posts-schedule-submit'));

		expect(onSchedule).not.toHaveBeenCalled();
		expect(screen.getByRole('alert').textContent).toContain(
			'posts:schedule-incomplete',
		);
	});

	test('clicking Schedule with only an uncommitted time also asks for both', () => {
		const onSchedule = vi.fn();
		render(<PublishScheduleRow disabled={false} onSchedule={onSchedule} />);

		fireEvent.change(screen.getByTestId('tenant-posts-schedule-time'), {
			target: { value: '10:30' },
		});
		fireEvent.click(screen.getByTestId('tenant-posts-schedule-submit'));

		expect(onSchedule).not.toHaveBeenCalled();
		expect(screen.getByRole('alert').textContent).toContain(
			'posts:schedule-incomplete',
		);
	});

	test('retyping a committed time and clicking without a blur schedules what the field shows', () => {
		const onSchedule = vi.fn();
		render(<PublishScheduleRow disabled={false} onSchedule={onSchedule} />);

		fill('tenant-posts-schedule-date', '02/01/2099');
		fill('tenant-posts-schedule-time', '10:30');
		fireEvent.change(screen.getByTestId('tenant-posts-schedule-time'), {
			target: { value: '11:30' },
		});
		fireEvent.click(screen.getByTestId('tenant-posts-schedule-submit'));

		expect(onSchedule).toHaveBeenCalledTimes(1);
		expect((onSchedule.mock.calls[0]?.[0] as Date).toISOString()).toBe(
			'2099-01-02T11:30:00.000Z',
		);
	});

	test('an invalid retype without a blur is refused, not replaced by the old committed time', () => {
		const onSchedule = vi.fn();
		render(<PublishScheduleRow disabled={false} onSchedule={onSchedule} />);

		fill('tenant-posts-schedule-date', '02/01/2099');
		fill('tenant-posts-schedule-time', '10:30');
		fireEvent.change(screen.getByTestId('tenant-posts-schedule-time'), {
			target: { value: '25:99' },
		});
		fireEvent.click(screen.getByTestId('tenant-posts-schedule-submit'));

		expect(onSchedule).not.toHaveBeenCalled();
		const alert = screen.getByRole('alert');
		expect(alert.textContent).toContain('posts:schedule-time-invalid');
		const time = screen.getByTestId('tenant-posts-schedule-time');
		expect(time.getAttribute('aria-invalid')).toBe('true');
		expect(time.getAttribute('aria-describedby')).toBe(alert.id);
		expect(
			screen
				.getByTestId('tenant-posts-schedule-date')
				.getAttribute('aria-invalid'),
		).toBeNull();
	});
});
