#!/usr/bin/env node
/*
 * Test-only: a cross-process CLAIM on a block of loopback ports.
 *
 * The e2e lease specs need to own real ports — the thing under test is a real
 * socket bind, so there is nothing to mock. That makes the specs themselves
 * competitors for the port space, including against other copies of the very
 * same file running at the same time.
 *
 * The obvious approach — probe some ports, close them, then use them — does
 * not work, and this module exists because it was tried. Probing proves the
 * ports were free a moment ago, not that they still are: between the probe and
 * the spec's first real bind, another copy that probed the same block wins the
 * race. Randomising the block only lowers the odds, and it makes the failure
 * rare and irreproducible instead of impossible. Four copies forced to the
 * same choice produced twenty-three failures across them: EADDRINUSE, bands
 * silently shifted by one, "the port is free" checks that were reading
 * somebody else's release, and readiness timeouts.
 *
 * So the claim is a real one, held by the kernel, alive for as long as the
 * spec needs it — the same primitive the code under test uses:
 *
 *   claim port C  ->  a listening socket this process keeps open
 *   usable block  ->  C+1 .. C+LEASE_BLOCK_SIZE
 *
 * Every copy of the suite scans the same slots in the same order, so the
 * winner of slot 0 is decided by `bind()` and everyone else deterministically
 * moves to slot 1. No files, no PIDs, no timestamps, no recovery protocol, and
 * nothing to clean up if a process dies: the kernel closes the descriptor and
 * the slot is free again. It is the production design, applied to the specs.
 *
 * What the claim does NOT do is reserve the usable block. Those ports are
 * probed and released, so unrelated software on the machine can still take one
 * between the probe and a spec's bind. That is why the specs read the band and
 * lease port they were actually granted out of the returned environment
 * instead of assuming they got the first one they asked for.
 */
import { createServer, type Server } from 'node:net';

export const LEASE_HOST = '127.0.0.1';

/** Ports a claim makes available to one spec. */
const LEASE_BLOCK_SIZE = 8;

// Above the production lease range (14000+) and every published service port.
// It is also below the DEFAULT ephemeral range on the platforms this repo runs
// on (Linux 32768+, Windows and macOS 49152+), which makes a collision with an
// OS-assigned outbound port unlikely — but that range is configurable and this
// code does not depend on it: a taken slot is simply skipped. Slots span
// 20000-20899.
const LEASE_CLAIM_BASE = 20_000;
const LEASE_CLAIM_SLOTS = 100;
const LEASE_CLAIM_STRIDE = LEASE_BLOCK_SIZE + 1;

/** A held claim: the ports it grants, and the release of the claim socket. */
export type LeaseWindow = {
	/** The port whose binding IS the claim. Not part of the usable block. */
	claimPort: number;
	/** First usable port. The block runs to `basePort + LEASE_BLOCK_SIZE - 1`. */
	basePort: number;
	release: () => Promise<void>;
};

/**
 * Binds `port` on loopback, resolving once it is actually listening.
 *
 * Accepted connections are destroyed on arrival, exactly as the production
 * lease does. `Server.close()` waits for every socket it has already accepted
 * to end, so a listener that kept its connections could not be closed while
 * anything was connected to it — and these listeners get closed on the
 * cleanup path of every spec. A single stray connection to a claim port would
 * hang the release, and with it the suite.
 */
export const listenOnPort = async (
	port: number,
	host: string = LEASE_HOST,
): Promise<Server> => {
	const server = createServer((socket) => {
		// The no-op error listener comes first: destroying can surface
		// ECONNRESET, and an 'error' event with no listener is a fatal throw.
		socket.on('error', () => {});
		socket.destroy();
	});

	await new Promise<void>((resolveListen, rejectListen) => {
		const onError = (error: Error) => {
			server.removeListener('listening', onListening);
			rejectListen(error);
		};
		const onListening = () => {
			server.removeListener('error', onError);
			resolveListen();
		};

		server.once('error', onError);
		server.once('listening', onListening);
		server.listen({ host, port, exclusive: true });
	});

	return server;
};

/** Closes a listener, awaiting the close. */
export const closeListener = async (server: Server): Promise<void> => {
	await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
};

/**
 * Whether every port of a block can be bound right now.
 *
 * This is a probe, with all a probe's weakness: it reports the past. The claim
 * settles the race between copies of this suite, which is the one that
 * actually bites, but it cannot stop unrelated software from taking a port in
 * the block a moment later. So this check is a filter for slots that are
 * already dirty — NOT a guarantee that `basePort` will still be free when a
 * spec binds it. Specs must therefore read the port they were actually granted
 * rather than assume they got the one they asked for.
 */
const blockIsFree = async (basePort: number): Promise<boolean> => {
	const held: Server[] = [];
	let free = true;

	for (let offset = 0; offset < LEASE_BLOCK_SIZE; offset++) {
		try {
			held.push(await listenOnPort(basePort + offset));
		} catch {
			free = false;
			break;
		}
	}

	for (const server of held) {
		await closeListener(server);
	}

	return free;
};

/**
 * Claims a block of ports for the caller, holding the claim socket open until
 * the returned `release` is awaited.
 */
export const claimLeaseWindow = async (): Promise<LeaseWindow> => {
	for (let slot = 0; slot < LEASE_CLAIM_SLOTS; slot++) {
		const claimPort = LEASE_CLAIM_BASE + slot * LEASE_CLAIM_STRIDE;

		let claim: Server;
		try {
			claim = await listenOnPort(claimPort);
		} catch {
			// Another copy of the suite owns this slot; the next one may be free.
			continue;
		}

		const basePort = claimPort + 1;
		if (await blockIsFree(basePort)) {
			return {
				claimPort,
				basePort,
				release: async () => await closeListener(claim),
			};
		}

		// The slot is ours but something outside the suite is sitting in its
		// block. Hand the claim straight back rather than holding a slot we
		// cannot use.
		await closeListener(claim);
	}

	throw new Error(
		`No free lease window: all ${String(LEASE_CLAIM_SLOTS)} claim slots from ` +
			`${String(LEASE_CLAIM_BASE)} are taken or blocked.`,
	);
};
