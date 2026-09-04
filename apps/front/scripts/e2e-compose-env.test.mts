/**
 * Tests for e2e-compose-env.mts and the runner that owns its reservation.
 *
 * The exclusivity mechanism is an OS-owned loopback TCP lease: band `n` is
 * held by a live `net.Server` bound on 127.0.0.1:14000+n. There is no
 * persistent state at all, so these specs assert the only things that can
 * still be true or false — real sockets, real cleanup, real precedence.
 *
 * Every lease-level spec holds a real cross-process CLAIM on the block of
 * ports it uses (see e2e-lease-window.mts) for as long as it runs. So a spec
 * can never take or free a band a real e2e run is holding on the production
 * range, and two concurrent copies of this file cannot become each other's
 * squatter — the kernel decides who owns a block, exactly as it does for the
 * lease under test.
 */

import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
import process from 'node:process';
import { describe, it, type TestContext } from 'node:test';

import {
	bandPortsFor,
	buildBandConflictMessage,
	describePortHolders,
	deriveProjectName,
	findOccupiedBandPorts,
	isOwnProjectContainer,
	normalizeComposeName,
	reserveE2EComposeEnv,
	type E2eComposeEnv,
	type E2eComposeReservation,
} from './e2e-compose-env.mts';
import {
	claimLeaseWindow,
	closeListener,
	LEASE_BLOCK_SIZE,
	LEASE_HOST,
	listenOnPort as listenOn,
} from './e2e-lease-window.mts';
import { runE2EFront, type RunCommand } from './run-e2e-front.mts';

/** The repository justfile, relative to this spec. */
const JUSTFILE_PATH = pathJoin(import.meta.dirname, '../../../justfile');

/** The one-process-per-contender harness driven by the contention proof. */
const CONTENTION_HARNESS = pathJoin(
	import.meta.dirname,
	'e2e-compose-env.contention-harness.mts',
);

/** What one contention-harness process reports on stdout. */
type ContenderAnnouncement = {
	result: string;
	band?: string;
	message?: string;
};

/**
 * Reads the single JSON line a contender prints. Its stderr is folded into the
 * failure message, because a harness that dies on an import error would
 * otherwise show up only as an unexplained timeout.
 */
const readAnnouncement = async (
	child: ChildProcess,
): Promise<ContenderAnnouncement> =>
	await new Promise<ContenderAnnouncement>((resolveLine, rejectLine) => {
		let stdout = '';
		let stderr = '';
		child.stdout?.setEncoding('utf8');
		child.stderr?.setEncoding('utf8');
		child.stderr?.on('data', (chunk: string) => {
			stderr += chunk;
		});
		child.stdout?.on('data', (chunk: string) => {
			stdout += chunk;
			const newline = stdout.indexOf('\n');
			if (newline === -1) {
				return;
			}
			try {
				resolveLine(
					JSON.parse(stdout.slice(0, newline)) as ContenderAnnouncement,
				);
			} catch (error) {
				rejectLine(error);
			}
		});
		child.once('exit', (code) => {
			rejectLine(
				new Error(
					`a contender exited (code ${String(code)}) without announcing a band; stderr: ${stderr}`,
				),
			);
		});
	});

/** Whether `port` can be bound right now — the only observable a lease has. */
const isLeasePortFree = async (port: number): Promise<boolean> => {
	try {
		const server = await listenOn(port);
		await closeListener(server);
		return true;
	} catch {
		return false;
	}
};

/**
 * Claims a block of loopback ports for ONE spec and holds the claim until that
 * spec is over.
 *
 * The claim is registered with `t.after`, so it is handed back whether the
 * spec passes, fails, or throws — a spec that failed while still holding a
 * slot would starve every later spec and every concurrent copy of this file.
 */
const claimWindow = async (t: TestContext): Promise<number> => {
	const window = await claimLeaseWindow();
	t.after(async () => {
		await window.release();
	});

	return window.basePort;
};

/**
 * The band a reservation ACTUALLY took, read out of its own environment.
 *
 * A spec asks for a lease base port; it does not get to decide which band it
 * is granted. The claim keeps other copies of this suite out of the block, but
 * unrelated software on the machine can still hold the first port, and then
 * the scan moves on and every absolute expectation ("it must be band 8080")
 * becomes a false failure — or worse, a probe aimed at the wrong port that
 * passes without testing anything.
 */
const bandIndexOf = (env: E2eComposeEnv): number =>
	(Number(env.E2E_PORT_TRAEFIK_WEB) - 8080) / 10;

/** The lease port a reservation is actually holding. */
const leasePortOf = (leaseBasePort: number, env: E2eComposeEnv): number =>
	leaseBasePort + bandIndexOf(env);

/**
 * Records the exact server a reservation closes, so a spec can assert on the
 * port that was really bound instead of the one it hoped for.
 */
const recordingCloser = () => {
	const closedPorts: number[] = [];

	return {
		closedPorts,
		closeLeaseServer: async (server: Server) => {
			const address = server.address();
			if (address !== null && typeof address !== 'string') {
				closedPorts.push(address.port);
			}
			await closeListener(server);
		},
	};
};

/**
 * Binds the first port of a claimed block that is actually takeable, returning
 * both the socket and the port it landed on. The claim keeps other copies of
 * this suite out, but not unrelated software, so a spec that must hold a real
 * port asks for one rather than demanding a particular one.
 */
const listenSomewhereInBlock = async (
	basePort: number,
	host: string = LEASE_HOST,
): Promise<{ port: number; server: Server }> => {
	for (let offset = 0; offset < 8; offset++) {
		try {
			return {
				port: basePort + offset,
				server: await listenOn(basePort + offset, host),
			};
		} catch {
			continue;
		}
	}

	throw new Error(
		`No takeable port in the claimed block at ${String(basePort)}.`,
	);
};

/**
 * Reservation dependencies that keep a spec off the machine's real state.
 *
 * `maxBands` is capped at one claim block: a fully occupied block must not
 * spill into the next claim's window (that squats another spec). Narrower
 * tests override `maxBands` after the spread so they keep the scan bounded.
 */
const freeServicePorts = {
	findOccupiedBandPorts: (): number[] => [],
	maxBands: LEASE_BLOCK_SIZE,
};

/**
 * Awaits `work`, failing instead of hanging if it takes longer than
 * `timeoutMs`.
 *
 * A spec that proves something COMPLETES has to bound the wait itself: the
 * node:test runner is configured without a per-test timeout, so an unbounded
 * await on a promise that never settles hangs the whole suite silently rather
 * than reporting the defect it was written to catch.
 */
// The trailing comma in `<T,>` is required: in a .mts file a bare `<T>` on an
// arrow function is reserved syntax (TS7060).
const withinBound = async <T,>(
	work: Promise<T>,
	timeoutMs: number,
	what: string,
): Promise<T> => {
	let timer: NodeJS.Timeout | undefined;

	try {
		return await Promise.race([
			work,
			new Promise<never>((_resolveNever, rejectSlow) => {
				timer = setTimeout(
					() =>
						rejectSlow(
							new Error(`${what} did not finish within ${String(timeoutMs)}ms`),
						),
					timeoutMs,
				);
			}),
		]);
	} finally {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	}
};

/**
 * Resolves once a client socket has finished its attempt, whether that ended
 * in a connection, a reset, or an immediate close. A lease that destroys its
 * accepted sockets produces any of the three depending on scheduling, and the
 * spec cares only that the attempt reached the listener.
 */
const settledConnection = async (client: Socket): Promise<void> =>
	await new Promise<void>((resolveSettled) => {
		client.once('connect', () => resolveSettled());
		client.once('close', () => resolveSettled());
		client.once('error', () => resolveSettled());
	});

/**
 * Awaits a reservation attempt that must REJECT, releasing the reservation if
 * it wrongly resolves instead.
 *
 * The release matters as much as the assertion: a leaked lease server is a
 * live listening socket, and a live socket keeps the test process alive for
 * ever. Without this, a regression in any of these specs stops being a failed
 * assertion and becomes a hung suite with no output at all.
 */
const rejectsReservation = async (
	attempt: Promise<E2eComposeReservation>,
	expected: RegExp | ((error: unknown) => boolean),
): Promise<void> => {
	let resolved: E2eComposeReservation | undefined;

	try {
		await assert.rejects(
			attempt.then((reservation) => {
				resolved = reservation;
				return reservation;
			}),
			expected,
		);
	} finally {
		await resolved?.release();
	}
};

void describe('normalizeComposeName', () => {
	void it('converts to lowercase', () => {
		assert.equal(normalizeComposeName('MY-PROJECT'), 'my-project');
	});

	void it('replaces spaces and special characters with underscores', () => {
		assert.equal(normalizeComposeName('my/project#test'), 'my_project_test');
	});

	void it('must start with alphanumeric character', () => {
		const result = normalizeComposeName('-my-project');
		assert.ok(
			/^[a-z0-9]/.test(result),
			`Expected to start with alphanumeric, got: ${result}`,
		);
	});

	void it('produces Compose-safe names (alphanumeric, dash, underscore only)', () => {
		const result = normalizeComposeName('test/path/with spaces');
		assert.ok(
			/^[a-z0-9_-]+$/.test(result),
			`Result "${result}" contains invalid characters`,
		);
	});

	void it('handles empty input gracefully', () => {
		const result = normalizeComposeName('');
		assert.ok(typeof result === 'string', 'Should return a string');
		assert.ok(result.length > 0, 'Should not be empty');
	});
});

void describe('deriveProjectName', () => {
	void it('produces Compose-safe names', () => {
		const projectName = deriveProjectName();
		assert.ok(
			/^publyapp-e2e-[a-z0-9_-]+$/.test(projectName),
			`Not Compose-safe: ${projectName}`,
		);
	});

	void it('uses the full absolute repository path for uniqueness', () => {
		const name = deriveProjectName();
		assert.ok(name.includes('publyapp'), 'Should contain publyapp');
		assert.ok(
			name.length > 'publyapp-e2e-'.length,
			'Name should have path-derived suffix',
		);
	});
});

void describe('port lease exclusivity', () => {
	/**
	 * PROOF: two LIVE reservations can never share a band. The first holds its
	 * lease socket for the whole spec, so the second must move on — there is no
	 * bookkeeping to consult, only the kernel's answer to a bind.
	 *
	 * Both reservations scan the same base port.
	 * Unrelated, lower occupancy can change between the two scans, so distinct
	 * bands from a live lease is the invariant — numeric order is not.
	 */
	void it('gives two live reservations different bands', async (t) => {
		const leaseBasePort = await claimWindow(t);
		const first = await reserveE2EComposeEnv(undefined, {
			leaseBasePort,
			...freeServicePorts,
		});
		let second: E2eComposeReservation | undefined;

		try {
			second = await reserveE2EComposeEnv(undefined, {
				leaseBasePort,
				...freeServicePorts,
			});

			// Which bands they get depends on what else is on the machine; that
			// they cannot be the SAME band does not.
			assert.notEqual(
				first.env.E2E_PORT_TRAEFIK_WEB,
				second.env.E2E_PORT_TRAEFIK_WEB,
				'two live reservations must never share a band',
			);
			assert.notEqual(
				first.env.E2E_PORT_TRAEFIK_WEBSECURE,
				second.env.E2E_PORT_TRAEFIK_WEBSECURE,
			);
			assert.equal(
				await isLeasePortFree(leasePortOf(leaseBasePort, first.env)),
				false,
				"the first reservation's lease must still be held",
			);
			assert.equal(
				await isLeasePortFree(leasePortOf(leaseBasePort, second.env)),
				false,
				"the second reservation's lease must still be held",
			);
		} finally {
			await first.release();
			await second?.release();
		}
	});

	/** PROOF: releasing the lease hands the band straight back. */
	void it('reuses a band once its lease is released', async (t) => {
		const leaseBasePort = await claimWindow(t);
		const first = await reserveE2EComposeEnv(undefined, {
			leaseBasePort,
			...freeServicePorts,
		});
		await first.release();

		const second = await reserveE2EComposeEnv(undefined, {
			leaseBasePort,
			...freeServicePorts,
		});

		try {
			assert.equal(
				second.env.E2E_PORT_TRAEFIK_WEB,
				first.env.E2E_PORT_TRAEFIK_WEB,
				'the freed band must be handed out again',
			);
			assert.equal(
				await isLeasePortFree(leasePortOf(leaseBasePort, second.env)),
				false,
				'the re-granted band must be genuinely held again',
			);
		} finally {
			await second.release();
		}
	});

	/** PROOF: a lease port held by anything at all skips that band. */
	void it('skips a band whose lease port is already occupied', async (t) => {
		const leaseBasePort = await claimWindow(t);
		const squatter = await listenOn(leaseBasePort);

		try {
			const reservation = await reserveE2EComposeEnv(undefined, {
				leaseBasePort,
				...freeServicePorts,
			});

			try {
				assert.ok(
					bandIndexOf(reservation.env) >= 1,
					'the band whose lease port was taken must be skipped',
				);
				assert.notEqual(
					leasePortOf(leaseBasePort, reservation.env),
					leaseBasePort,
					'the reservation must not claim the port the squatter holds',
				);
			} finally {
				await reservation.release();
			}
		} finally {
			await closeListener(squatter);
		}
	});

	/**
	 * PROOF: a bind failure that is NOT "someone else has it" is a defect, not a
	 * band to skip. Binding an address the host does not own fails with
	 * EADDRNOTAVAIL, and that must surface instead of silently walking 500 bands.
	 */
	void it('fails loudly on a bind error that is not EADDRINUSE', async (t) => {
		await rejectsReservation(
			reserveE2EComposeEnv(undefined, {
				leaseBasePort: await claimWindow(t),
				// TEST-NET-3: never assigned to a host interface.
				leaseHost: '203.0.113.1',
				...freeServicePorts,
			}),
			(error: unknown) =>
				error instanceof Error && /EADDRNOTAVAIL|EACCES/.test(error.message),
		);
	});

	/** PROOF: release is idempotent, sequentially and concurrently. */
	void it('releases idempotently when called twice and in parallel', async (t) => {
		const leaseBasePort = await claimWindow(t);
		const reservation = await reserveE2EComposeEnv(undefined, {
			leaseBasePort,
			...freeServicePorts,
		});

		// Three releases, concurrent and sequential, must all resolve: a second
		// close of an already-closed server reports ERR_SERVER_NOT_RUNNING, so
		// resolving IS the idempotence proof.
		await Promise.all([reservation.release(), reservation.release()]);
		await reservation.release();
	});

	/**
	 * PROOF (real client): a stranger connecting to a lease port cannot hold the
	 * band hostage.
	 *
	 * `net.Server.close()` stops accepting and then waits for every socket it
	 * has already accepted to end. A lease listener that kept its connections
	 * would therefore block release for as long as some client stayed connected
	 * — and the runner AWAITS release inside its teardown, so one stray
	 * connection (a port scanner, a curl, a health check) would hang the whole
	 * e2e gate. The lease exists to be bound, never to serve, so an accepted
	 * socket is destroyed the moment it arrives.
	 */
	void it('releases promptly while a real client is connected', async (t) => {
		const leaseBasePort = await claimWindow(t);
		const reservation = await reserveE2EComposeEnv(undefined, {
			leaseBasePort,
			...freeServicePorts,
		});
		// The port the reservation really took — aiming at `leaseBasePort` would
		// talk to whatever squatted it and prove nothing at all.
		const leasePort = leasePortOf(leaseBasePort, reservation.env);
		const client = connect({ host: LEASE_HOST, port: leasePort });
		// A reset arriving after the assertions must not become an unhandled
		// 'error' event and take the test process down.
		client.on('error', () => {});

		try {
			await withinBound(
				settledConnection(client),
				5000,
				'the client connection attempt',
			);

			await withinBound(
				reservation.release(),
				5000,
				'the release of a lease with a connected client',
			);

			// That the release RESOLVED is the whole proof — production awaits the
			// socket close. Re-probing the port would race unrelated software.
		} finally {
			// Destroying the client lets a RED run finish: the close it was
			// waiting on completes, so the failure is reported instead of hanging.
			client.destroy();
		}
	});

	/**
	 * PROOF (two independent processes): the design's central claim is that two
	 * SEPARATE e2e runners cannot be handed the same band. The sequential
	 * same-process test above cannot establish that — a broken implementation
	 * that simply remembered "I already gave out band 0" in a module variable
	 * would pass it and still hand both of two real runners the same band.
	 *
	 * So two child processes each invoke the SHIPPED reservation helper, release
	 * from a shared barrier so they collide inside the scan, and then STAY ALIVE
	 * holding their leases. Both are proven alive at the moment their bands are
	 * compared, which is what makes the bands genuinely simultaneous rather than
	 * merely consecutive.
	 */
	void it('never gives two independent processes the same band', async (t) => {
		const contenders = 2;
		const maxBands = 4;
		const leaseBasePort = await claimWindow(t);
		const barrierDir = mkdtempSync(
			pathJoin(tmpdir(), 'publyapp-e2e-contention-'),
		);

		const children = Array.from({ length: contenders }, (_unused, index) =>
			spawn(
				process.execPath,
				[
					CONTENTION_HARNESS,
					String(leaseBasePort),
					String(maxBands),
					barrierDir,
					String(contenders),
					String(index),
				],
				{ cwd: pathJoin(import.meta.dirname, '..'), stdio: 'pipe' },
			),
		);

		try {
			const announcements = await withinBound(
				Promise.all(children.map((child) => readAnnouncement(child))),
				30_000,
				'both contenders to announce a band',
			);

			for (const [index, announcement] of announcements.entries()) {
				assert.equal(
					announcement.result,
					'reserved',
					`contender ${String(index)} failed to reserve: ${
						announcement.message ?? 'no reason given'
					}`,
				);
			}

			// Both leases must be LIVE right now, or "different bands" would only
			// mean the first contender had already finished and let go.
			for (const child of children) {
				assert.equal(
					child.exitCode,
					null,
					'every contender must still be holding its lease at comparison time',
				);
			}

			const bands = announcements.map((announcement) => announcement.band);
			assert.equal(
				new Set(bands).size,
				contenders,
				`two live processes must never share a band; got ${bands.join(', ')}`,
			);
		} finally {
			writeFileSync(pathJoin(barrierDir, 'release'), '1', 'utf8');
			for (const child of children) {
				await new Promise<void>((resolveExit) => {
					if (child.exitCode !== null || child.signalCode !== null) {
						resolveExit();
						return;
					}
					child.once('exit', () => resolveExit());
					setTimeout(() => {
						child.kill('SIGKILL');
					}, 10_000).unref();
				});
			}
			rmSync(barrierDir, { recursive: true, force: true });
		}
	});

	/**
	 * PROOF (real crash): the operating system is the release mechanism. A child
	 * killed with SIGKILL runs no cleanup whatsoever, and its band is free the
	 * moment it dies. No mock can stand in for this.
	 */
	void it('frees the lease when its owning process is killed outright', async (t) => {
		const basePort = await claimWindow(t);
		// The child walks its claimed block and REPORTS the port it got. Telling
		// it one exact port would make unrelated software holding that port look
		// like "the holder never became ready".
		const child = spawn(
			process.execPath,
			[
				'-e',
				"const net=require('node:net');const base=Number(process.argv[1]);" +
					'const tryPort=(offset)=>{if(offset>=8){process.exit(3);}' +
					'const s=net.createServer((c)=>c.destroy());' +
					"s.once('error',()=>tryPort(offset+1));" +
					"s.listen({host:'127.0.0.1',port:base+offset,exclusive:true}," +
					"()=>{process.stdout.write('READY '+(base+offset)+'\\n');});};" +
					'tryPort(0);setInterval(()=>{},1000);',
				String(basePort),
			],
			{ stdio: ['ignore', 'pipe', 'ignore'] },
		);

		try {
			const port = await new Promise<number>((resolveReady, rejectReady) => {
				const timer = setTimeout(
					() => rejectReady(new Error('the lease holder never became ready')),
					20_000,
				);
				child.stdout?.setEncoding('utf8');
				child.stdout?.on('data', (chunk: string) => {
					const match = /READY (\d+)/.exec(chunk);
					if (match) {
						clearTimeout(timer);
						resolveReady(Number(match[1]));
					}
				});
			});

			assert.equal(
				await isLeasePortFree(port),
				false,
				'the live holder must own the lease port',
			);

			const exited = new Promise<void>((resolveExit) => {
				child.once('exit', () => resolveExit());
			});
			child.kill('SIGKILL');
			await exited;

			assert.equal(
				await isLeasePortFree(port),
				true,
				'a killed holder must leave no reservation behind',
			);
		} finally {
			child.kill('SIGKILL');
		}
	});
});

void describe('lease window claim (spec infrastructure)', () => {
	/**
	 * PROOF: a claim can always be handed back.
	 *
	 * `Server.close()` waits for every socket it has already accepted, so a
	 * claim listener that retained connections could not be released while
	 * anything was connected to it. Claims are released on the cleanup path of
	 * every spec, so one stray connection to a claim port would hang the whole
	 * suite — which is exactly what it did before the listener started
	 * destroying accepted sockets.
	 */
	void it('releases the claim while a real client is connected', async () => {
		const window = await claimLeaseWindow();
		const client = connect({ host: LEASE_HOST, port: window.claimPort });
		client.on('error', () => {});

		try {
			await withinBound(
				settledConnection(client),
				5000,
				'the client connection to the claim port',
			);
			await withinBound(
				window.release(),
				5000,
				'the claim release with a connected client',
			);
		} finally {
			client.destroy();
			await window.release();
		}
	});

	/**
	 * PROOF: a spec survives unrelated software taking the port it asked for.
	 *
	 * The claim stops other copies of this suite from entering the block, but
	 * the block's ports are probed and released, so anything else on the machine
	 * can still take one afterwards. When that happens the scan simply moves on
	 * — and a spec that assumed it got the band it requested would either fail
	 * for no reason or, worse, aim its socket assertions at the squatter and
	 * pass without testing anything.
	 */
	void it('reads the granted band when the requested port is taken', async (t) => {
		const leaseBasePort = await claimWindow(t);
		// Arrives AFTER the block was probed: the exact window the claim cannot
		// close, standing in for unrelated software on the machine.
		const squatter = await listenOn(leaseBasePort);

		try {
			const reservation = await reserveE2EComposeEnv(undefined, {
				leaseBasePort,
				...freeServicePorts,
			});
			const leasePort = leasePortOf(leaseBasePort, reservation.env);

			try {
				assert.notEqual(
					leasePort,
					leaseBasePort,
					'the granted lease must not be the port the squatter holds',
				);
				assert.equal(
					await isLeasePortFree(leasePort),
					false,
					'the port derived from the environment must be the one really held',
				);
			} finally {
				await reservation.release();
			}

			assert.equal(
				await isLeasePortFree(leaseBasePort),
				false,
				"the squatter's port must be untouched by the reservation",
			);
		} finally {
			await closeListener(squatter);
		}
	});

	/**
	 * PROOF: a fully blocked scan stays inside its own claim window.
	 *
	 * `first` holds band 0 of window1 and late squatters take its other seven
	 * ports, so a second reservation scoped to the same base must exhaust
	 * within the block (`maxBands` is capped at `LEASE_BLOCK_SIZE`). Without
	 * the cap the scan walks the whole lease range and binds the first free
	 * band — which can sit inside another claim's window, letting two specs
	 * squat each other. So window2's block must stay untouched afterwards; the
	 * exhaustion rejection catches a regression either way.
	 */
	void it('does not spill a fully blocked scan into the next claim window', async (t) => {
		const firstWindow = await claimLeaseWindow();
		const secondWindow = await claimLeaseWindow();
		t.after(async () => {
			await firstWindow.release();
			await secondWindow.release();
		});

		// Offset 0 is squatted BEFORE the first reservation, so `first` is forced
		// onto some other offset instead of always landing on band 0 itself.
		const squatters: Server[] = [await listenOn(firstWindow.basePort)];
		let first: E2eComposeReservation | undefined;

		try {
			first = await reserveE2EComposeEnv(undefined, {
				leaseBasePort: firstWindow.basePort,
				...freeServicePorts,
			});
			const actualOffset = bandIndexOf(first.env);

			// Squat every remaining offset of window1 except the one the offset-0
			// squatter already covers and the one `first` actually took.
			for (let offset = 1; offset < LEASE_BLOCK_SIZE; offset++) {
				if (offset === actualOffset) {
					continue;
				}
				squatters.push(await listenOn(firstWindow.basePort + offset));
			}

			await rejectsReservation(
				reserveE2EComposeEnv(undefined, {
					leaseBasePort: firstWindow.basePort,
					...freeServicePorts,
				}),
				/All \d+ bands are in use/,
			);

			// Window2 must be untouched: the spill the cap prevents would have
			// bound its base port. No adjacency is assumed — the exhaustion
			// rejection is the primary proof, these checks the secondary one.
			assert.equal(
				await isLeasePortFree(secondWindow.basePort),
				true,
				"the second reservation must not bind window2's base port",
			);
			for (let offset = 0; offset < LEASE_BLOCK_SIZE; offset++) {
				assert.equal(
					await isLeasePortFree(secondWindow.basePort + offset),
					true,
					`window2 port ${String(secondWindow.basePort + offset)} must stay free`,
				);
			}
		} finally {
			for (const squatter of squatters) {
				await closeListener(squatter);
			}
			await first?.release();
		}
	});
});

void describe('reservation cleanup after a successful bind', () => {
	/** PROOF: a derivation failure after the bind must not strand the lease. */
	void it('releases the lease when project-name derivation throws', async (t) => {
		const leaseBasePort = await claimWindow(t);

		const closer = recordingCloser();

		await rejectsReservation(
			reserveE2EComposeEnv(undefined, {
				leaseBasePort,
				...freeServicePorts,
				...closer,
				deriveProjectName: () => {
					throw new Error('derivation failed');
				},
			}),
			/derivation failed/,
		);

		// The port that was really bound, not the one the spec asked for: if
		// something else held `leaseBasePort` the scan moved on, and checking the
		// requested port would be checking the squatter.
		// The recorded close IS the proof: the reservation handed its exact
		// server back before rethrowing. Re-probing the port afterwards would
		// only race whatever else on the machine wants it.
		assert.deepEqual(
			closer.closedPorts.length,
			1,
			'the lease must be released before the rejection',
		);
	});

	/** PROOF: the same holds for a service-port probe that cannot decide. */
	void it('releases the lease when the service-port probe fails', async (t) => {
		const leaseBasePort = await claimWindow(t);

		const closer = recordingCloser();

		await rejectsReservation(
			reserveE2EComposeEnv(undefined, {
				leaseBasePort,
				...closer,
				findOccupiedBandPorts: () => {
					throw new Error('probe failed');
				},
			}),
			/probe failed/,
		);

		assert.equal(closer.closedPorts.length, 1);
	});

	/** PROOF: an abort that lands after the bind still frees the lease. */
	void it('releases the lease when the abort lands after the bind', async (t) => {
		const leaseBasePort = await claimWindow(t);
		const controller = new AbortController();

		const closer = recordingCloser();

		await rejectsReservation(
			reserveE2EComposeEnv(controller.signal, {
				leaseBasePort,
				...closer,
				findOccupiedBandPorts: () => {
					controller.abort(new Error('aborted after bind'));
					return [];
				},
			}),
			/aborted after bind/,
		);

		assert.equal(closer.closedPorts.length, 1);
	});

	/**
	 * PROOF: an abort that lands mid-scan beats exhaustion.
	 *
	 * Every candidate band is occupied here, so the scan skips all of them and
	 * falls through to the "all bands are in use" error. That message is the
	 * wrong answer for an interrupted run: the caller pressed Ctrl-C, and the
	 * runner keys its exit status off the abort reason, so reporting exhaustion
	 * instead loses the 130. The abort is therefore rechecked after every bind
	 * result and once more before exhaustion is declared.
	 *
	 * The abort is requested after exactly one microtask, which is deterministic:
	 * the reservation runs synchronously up to its first `await bindLease(...)`,
	 * and that cannot settle before real I/O. So the pre-scan check has already
	 * passed and the abort genuinely lands INSIDE the scan.
	 */
	void it('reports the abort reason when every candidate band is occupied', async (t) => {
		const maxBands = 3;
		const leaseBasePort = await claimWindow(t);
		const squatters: Server[] = [];
		const controller = new AbortController();

		try {
			for (let index = 0; index < maxBands; index++) {
				squatters.push(await listenOn(leaseBasePort + index));
			}

			const attempt = reserveE2EComposeEnv(controller.signal, {
				leaseBasePort,
				...freeServicePorts,
				maxBands,
			});

			await Promise.resolve();
			controller.abort(new Error('aborted during a fully contended scan'));

			await rejectsReservation(
				attempt,
				/aborted during a fully contended scan/,
			);
		} finally {
			for (const squatter of squatters) {
				await closeListener(squatter);
			}
		}
	});

	/** PROOF: an abort requested before the scan never binds anything. */
	void it('rejects without binding when the abort is already requested', async (t) => {
		const leaseBasePort = await claimWindow(t);
		const controller = new AbortController();
		controller.abort(new Error('aborted before bind'));

		const closer = recordingCloser();

		await rejectsReservation(
			reserveE2EComposeEnv(controller.signal, {
				leaseBasePort,
				...freeServicePorts,
				...closer,
			}),
			/aborted before bind/,
		);

		// Nothing was bound, so nothing was closed. That is a stronger statement
		// than "the requested port is free", which would also hold if the scan
		// had bound and released some OTHER port.
		assert.deepEqual(
			closer.closedPorts,
			[],
			'an already-aborted caller must not bind anything at all',
		);
	});

	/**
	 * PROOF: when the cleanup ALSO fails, the original cause is what the
	 * operator sees, and the cleanup failure is still reported rather than
	 * swallowed.
	 */
	void it('keeps the primary error and reports a failing cleanup', async (t) => {
		const messages: string[] = [];

		await rejectsReservation(
			reserveE2EComposeEnv(undefined, {
				leaseBasePort: await claimWindow(t),
				...freeServicePorts,
				deriveProjectName: () => {
					throw new Error('primary derivation failure');
				},
				// Closes for real and THEN fails, the way a close that reports an
				// error does. A stub that merely threw would leave this spec's own
				// listening socket open, and a live socket keeps the test process
				// alive for ever — the spec would hang the suite instead of proving
				// anything.
				closeLeaseServer: async (server) => {
					await closeListener(server);
					throw new Error('lease close failed');
				},
				writeError: (message) => messages.push(message),
			}),
			/primary derivation failure/,
		);

		assert.match(
			messages.join(''),
			/lease close failed/,
			'a failing cleanup must remain observable',
		);
	});
});

void describe('published service-port conflicts', () => {
	/**
	 * PROOF: a real listening socket on a band port is detected through the
	 * shipped probe, and its holder is named.
	 */
	void it('detects an occupied band port and names its holder', async (t) => {
		// A claimed port, not a hunted one. `bandPortsFor(base)[0] === base` by
		// construction (the first published port sits at offset zero), so the
		// shipped probe can be aimed at a port this spec genuinely owns rather
		// than at a production band another copy of this file may be using.
		const claimedBase = await claimWindow(t);
		// Anywhere in the claimed block: insisting on its first port would turn
		// unrelated software holding that one port into a spurious failure.
		const { port: bandPort, server } = await listenSomewhereInBlock(
			claimedBase,
			'0.0.0.0',
		);
		const basePort = bandPort;
		assert.equal(
			bandPortsFor(basePort)[0],
			basePort,
			'the first published port of a band sits at offset zero',
		);

		try {
			const occupied = findOccupiedBandPorts(basePort);
			assert.ok(
				occupied.includes(bandPort),
				`the occupied port ${bandPort} must be reported; got ${occupied.join(', ')}`,
			);

			const holders = describePortHolders(bandPort);
			assert.ok(holders.length > 0, 'the holder must be described');
			assert.match(
				holders.join(' '),
				/process|container|unidentified/,
				'the holder description must name a process, a container, or say it is unidentified',
			);
		} finally {
			await closeListener(server);
		}
	});

	/**
	 * PROOF: a foreign holder of a published service port makes the band
	 * unusable — the reservation refuses it, names the holder, and hands its
	 * lease back instead of stranding it.
	 */
	void it('refuses a band whose service port a foreign holder squats', async (t) => {
		const leaseBasePort = await claimWindow(t);
		// Inside the claimed block, clear of the bands the scan itself walks.
		const squattedPort = leaseBasePort + 4;
		const squatter = await listenOn(squattedPort, '0.0.0.0');
		const closer = recordingCloser();

		try {
			await rejectsReservation(
				reserveE2EComposeEnv(undefined, {
					leaseBasePort,
					...closer,
					// A REAL occupied port, classified by the real holder probe.
					findOccupiedBandPorts: () => [squattedPort],
				}),
				(error: unknown) => {
					assert.ok(error instanceof Error);
					assert.match(
						error.message,
						/Port band \d+ is NOT free/,
						'must name the band it refused',
					);
					assert.match(
						error.message,
						new RegExp(String(squattedPort)),
						'must name the occupied port',
					);
					assert.match(error.message, /docker ps/, 'must say how to inspect');
					assert.match(
						error.message,
						/process|container|unidentified/,
						'must name the holder',
					);
					return true;
				},
			);

			assert.deepEqual(
				closer.closedPorts.length,
				1,
				'a refused band must hand its lease back',
			);
		} finally {
			await closeListener(squatter);
		}
	});

	void it('distinguishes our own project containers from foreign ones', () => {
		const projectName = deriveProjectName();

		assert.ok(
			isOwnProjectContainer(`${projectName}-traefik-1`),
			'our own project container must be recognized',
		);
		assert.ok(
			!isOwnProjectContainer('publyapp-e2e-somebody_else-traefik-1'),
			'a foreign project container must not be recognized as ours',
		);
		assert.ok(
			!isOwnProjectContainer('not-even-an-e2e-container'),
			'an unrelated container must not be recognized as ours',
		);
	});

	void it('builds the loud conflict message with port, holder and inspection command', () => {
		const message = buildBandConflictMessage(8080, [8080]);

		assert.match(message, /band 8080/, 'must name the band');
		assert.match(message, /port 8080/, 'must name the port');
		assert.match(message, /docker ps/, 'must give the docker ps command');
		assert.match(message, /ss -tlnp/, 'must give the ss command');
	});
});

const DERIVED_ENV_PROOF: E2eComposeEnv = {
	COMPOSE_PROJECT_NAME: 'publyapp-e2e-proof',
	E2E_PORT_TRAEFIK_WEB: '9080',
	E2E_PORT_TRAEFIK_WEBSECURE: '9443',
	E2E_PORT_REQUEST_COUNTER: '9800',
	E2E_PORT_TOXIPROXY: '9474',
	E2E_PORT_POSTGRES: '6454',
	E2E_BASE_URL: 'https://front.localhost:9443',
	E2E_API_BASE_URL: 'https://api.front.localhost:9443',
};

/** A reservation stub whose release outcome the spec chooses. */
const stubReservation = (
	release: () => Promise<void>,
): E2eComposeReservation => ({ env: DERIVED_ENV_PROOF, release });

const COMPOSE_DOWN =
	'docker compose -f apps/front/docker-compose.test.yml down -v --remove-orphans';

void describe('ci-e2e-front recipe', () => {
	void it('delegates the complete lifecycle to the cross-platform runner', () => {
		const justfile = readFileSync(JUSTFILE_PATH, 'utf8');
		const recipe = justfile.match(/^ci-e2e-front:\n(?<body>(?:  .*\n|\n)*)/m)
			?.groups?.body;

		assert.ok(recipe, 'ci-e2e-front recipe should exist');
		const executableLines = recipe
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !line.startsWith('#'));

		assert.deepEqual(executableLines, [
			'@node apps/front/scripts/run-e2e-front.mts',
		]);
	});

	void it('passes one derived environment through the complete lifecycle', async () => {
		const invocations: Parameters<RunCommand>[] = [];
		let released = 0;

		await runE2EFront({
			reserveEnv: async () =>
				stubReservation(async () => {
					released += 1;
				}),
			runCommand: async (...args) => {
				invocations.push(args);
			},
			writeError: () => {},
		});

		assert.deepEqual(
			invocations.map(([command, args]) => `${command} ${args.join(' ')}`),
			[
				COMPOSE_DOWN,
				'docker compose -f apps/front/docker-compose.test.yml up -d --build --wait --wait-timeout 180',
				'pnpm --filter front exec playwright install chromium',
				'pnpm --filter front exec playwright test',
				'pnpm --filter front test:drawer-contrast',
				COMPOSE_DOWN,
			],
		);
		assert.equal(released, 1, 'the lease must be released exactly once');
	});

	void it('gives every command all derived fields and preserves ambient variables', async () => {
		const invocations: Parameters<RunCommand>[] = [];
		const ambientKey = 'PUBLYAPP_E2E_AMBIENT_PROOF';
		process.env[ambientKey] = 'ambient-value';

		try {
			await runE2EFront({
				reserveEnv: async () => stubReservation(async () => {}),
				runCommand: async (...args) => {
					invocations.push(args);
				},
				writeError: () => {},
			});
		} finally {
			delete process.env[ambientKey];
		}

		assert.equal(invocations.length, 6);
		for (const [command, args, commandEnv] of invocations) {
			const where = `${command} ${args.join(' ')}`;

			for (const [key, value] of Object.entries(DERIVED_ENV_PROOF)) {
				assert.equal(
					commandEnv[key],
					value,
					`${where} must receive ${key}=${value}`,
				);
			}

			assert.equal(
				commandEnv[ambientKey],
				'ambient-value',
				`${where} must keep the ambient environment`,
			);
			assert.equal(
				commandEnv.PATH,
				process.env.PATH,
				`${where} must keep PATH so docker/pnpm resolve`,
			);
		}
	});

	void it('tears the stack down and releases the lease when playwright fails', async () => {
		const invocations: string[] = [];
		const failure = new Error('playwright test failed with exit 1');
		let released = 0;

		await assert.rejects(
			runE2EFront({
				reserveEnv: async () =>
					stubReservation(async () => {
						released += 1;
					}),
				runCommand: async (command, args) => {
					invocations.push(`${command} ${args.join(' ')}`);
					if (args.at(-1) === 'test' && args.includes('playwright')) {
						throw failure;
					}
				},
				writeError: () => {},
			}),
			(error: unknown) => error === failure,
		);

		assert.deepEqual(invocations, [
			COMPOSE_DOWN,
			'docker compose -f apps/front/docker-compose.test.yml up -d --build --wait --wait-timeout 180',
			'pnpm --filter front exec playwright install chromium',
			'pnpm --filter front exec playwright test',
			COMPOSE_DOWN,
		]);
		assert.equal(released, 1, 'a failed run must still release the lease');
	});
});

void describe('runner acquisition window', () => {
	/**
	 * PROOF: the signal handlers exist BEFORE the reservation is awaited. A
	 * signal arriving while the lease scan is in flight used to hit the default
	 * disposition and kill the runner outright, and the acquisition then had no
	 * owner at all.
	 */
	void it('installs signal handlers before awaiting the reservation', async () => {
		const observed = { sigint: 0, sigterm: 0 };

		await assert.rejects(
			runE2EFront({
				reserveEnv: async (signal) => {
					observed.sigint = process.listenerCount('SIGINT');
					observed.sigterm = process.listenerCount('SIGTERM');
					assert.equal(
						signal.aborted,
						false,
						'the runner must hand a live abort signal to the reservation',
					);
					throw new Error('acquisition failed');
				},
				runCommand: async () => {
					throw new Error('no command may run without a reservation');
				},
				writeError: () => {},
			}),
			/acquisition failed/,
		);

		assert.ok(observed.sigint > 0, 'SIGINT must be handled during acquisition');
		assert.ok(
			observed.sigterm > 0,
			'SIGTERM must be handled during acquisition',
		);
	});

	/**
	 * PROOF: a failed acquisition runs NOTHING — no lifecycle command, and no
	 * teardown either. There is no stack to tear down and no lease to release.
	 */
	void it('runs no command and no teardown when acquisition aborts', async () => {
		let commands = 0;

		await assert.rejects(
			runE2EFront({
				reserveEnv: async (signal) =>
					await new Promise<never>((_resolveNever, rejectAcquire) => {
						signal.addEventListener(
							'abort',
							() => rejectAcquire(signal.reason as Error),
							{ once: true },
						);
						process.emit('SIGINT');
					}),
				runCommand: async () => {
					commands += 1;
				},
				writeError: () => {},
			}),
			/front e2e aborted by SIGINT/,
		);

		assert.equal(commands, 0, 'an aborted acquisition must run no command');
	});
});

void describe('runner release precedence', () => {
	/** PROOF: teardown happens BEFORE the lease is released, never after. */
	void it('tears the stack down before releasing the lease', async () => {
		const order: string[] = [];

		await runE2EFront({
			reserveEnv: async () =>
				stubReservation(async () => {
					order.push('release');
				}),
			runCommand: async (command, args) => {
				if (`${command} ${args.join(' ')}` === COMPOSE_DOWN) {
					order.push('down');
				}
			},
			writeError: () => {},
		});

		assert.deepEqual(order, ['down', 'down', 'release']);
	});

	/** PROOF: an unreleasable lease fails an otherwise successful run. */
	void it('fails a successful run when the release fails', async () => {
		const messages: string[] = [];

		await assert.rejects(
			runE2EFront({
				reserveEnv: async () =>
					stubReservation(async () => {
						throw new Error('release failed');
					}),
				runCommand: async () => {},
				writeError: (message) => messages.push(message),
			}),
			/release failed/,
		);

		assert.match(messages.join(''), /release failed/);
	});

	/** PROOF: the primary failure survives a failing release, which is reported. */
	void it('keeps the lifecycle failure primary and reports the release failure', async () => {
		const messages: string[] = [];
		const failure = new Error('playwright test failed');

		await assert.rejects(
			runE2EFront({
				reserveEnv: async () =>
					stubReservation(async () => {
						throw new Error('release failed');
					}),
				runCommand: async (_command, args) => {
					if (args.at(-1) === 'test' && args.includes('playwright')) {
						throw failure;
					}
				},
				writeError: (message) => messages.push(message),
			}),
			(error: unknown) => error === failure,
		);

		assert.match(
			messages.join(''),
			/release failed/,
			'the losing cleanup failure must still be reported',
		);
	});

	/** PROOF: a teardown failure outranks a release failure but not the run. */
	void it('prefers the teardown failure over the release failure', async () => {
		const messages: string[] = [];

		await assert.rejects(
			runE2EFront({
				reserveEnv: async () =>
					stubReservation(async () => {
						throw new Error('release failed');
					}),
				runCommand: async (command, args, _env, abortSignal) => {
					if (
						abortSignal === undefined &&
						`${command} ${args.join(' ')}` === COMPOSE_DOWN
					) {
						throw new Error('teardown failed');
					}
				},
				writeError: (message) => messages.push(message),
			}),
			/teardown failed/,
		);

		assert.match(messages.join(''), /release failed/);
	});
});
