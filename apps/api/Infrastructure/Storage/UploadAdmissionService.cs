namespace PublyApp.Api.Infrastructure.Storage;

public interface IUploadAdmissionService {
	UploadAdmissionResult TryReserve(Guid staffUserId, long bytes);

	void Commit(UploadReservation reservation);

	void Release(UploadReservation reservation);
}

public abstract record UploadAdmissionResult {
	private UploadAdmissionResult() { }

	public sealed record Accepted(UploadReservation Reservation)
		: UploadAdmissionResult;

	public sealed record Rejected : UploadAdmissionResult;
}

/// <summary>
/// An in-process reservation for an upload's bytes. The reservation is opaque to
/// callers and releases itself when disposed unless it has been committed.
/// </summary>
public sealed class UploadReservation : IDisposable {
	internal UploadReservation(
		IUploadAdmissionService owner,
		Guid staffUserId,
		long bytes
	) {
		Owner = owner;
		StaffUserId = staffUserId;
		Bytes = bytes;
	}

	internal IUploadAdmissionService Owner { get; }

	internal Guid StaffUserId { get; }

	internal long Bytes { get; }

	internal UploadReservationState State { get; set; }

	public void Dispose() {
		Owner.Release(this);
	}
}

internal enum UploadReservationState {
	Active,
	Committed,
	Released,
}

/// <summary>
/// Fail-closed, process-local upload byte admission accounting. This bounds
/// in-flight and successful uploads on one API process. It is deliberately not
/// cross-process durable; phase 2 of #807 owns a durable asset/accounting model.
/// </summary>
public sealed class UploadAdmissionService : IUploadAdmissionService {
	private readonly object _gate = new();
	private readonly long _globalMaxBytes;
	private readonly long _perStaffMaxBytes;
	private readonly Dictionary<Guid, long> _committedBytesByStaff = [];
	private readonly Dictionary<Guid, long> _reservedBytesByStaff = [];
	private long _committedBytes;
	private long _reservedBytes;

	public UploadAdmissionService(long globalMaxBytes, long perStaffMaxBytes) {
		if (globalMaxBytes <= 0) {
			throw new ArgumentOutOfRangeException(
				nameof(globalMaxBytes),
				globalMaxBytes,
				"The global upload budget must be positive."
			);
		}
		if (perStaffMaxBytes <= 0) {
			throw new ArgumentOutOfRangeException(
				nameof(perStaffMaxBytes),
				perStaffMaxBytes,
				"The per-staff upload budget must be positive."
			);
		}
		if (globalMaxBytes < perStaffMaxBytes) {
			throw new ArgumentException(
				"The global upload budget must be greater than or equal to the per-staff budget.",
				nameof(globalMaxBytes)
			);
		}

		_globalMaxBytes = globalMaxBytes;
		_perStaffMaxBytes = perStaffMaxBytes;
	}

	public UploadAdmissionResult TryReserve(Guid staffUserId, long bytes) {
		if (bytes <= 0) {
			throw new ArgumentOutOfRangeException(
				nameof(bytes),
				bytes,
				"Upload bytes must be positive."
			);
		}

		lock (_gate) {
			var staffUsed = GetUsedBytes(_committedBytesByStaff, staffUserId)
				+ GetUsedBytes(_reservedBytesByStaff, staffUserId);
			if (WouldExceed(_committedBytes + _reservedBytes, bytes, _globalMaxBytes)
				|| WouldExceed(staffUsed, bytes, _perStaffMaxBytes)) {
				return new UploadAdmissionResult.Rejected();
			}

			_reservedBytes += bytes;
			AddBytes(_reservedBytesByStaff, staffUserId, bytes);
			return new UploadAdmissionResult.Accepted(
				new UploadReservation(this, staffUserId, bytes)
			);
		}
	}

	public void Commit(UploadReservation reservation) {
		ArgumentNullException.ThrowIfNull(reservation);

		lock (_gate) {
			EnsureActiveReservation(reservation);
			_reservedBytes -= reservation.Bytes;
			RemoveBytes(_reservedBytesByStaff, reservation.StaffUserId, reservation.Bytes);
			_committedBytes += reservation.Bytes;
			AddBytes(_committedBytesByStaff, reservation.StaffUserId, reservation.Bytes);
			reservation.State = UploadReservationState.Committed;
		}
	}

	public void Release(UploadReservation reservation) {
		ArgumentNullException.ThrowIfNull(reservation);

		lock (_gate) {
			if (!ReferenceEquals(reservation.Owner, this)) {
				throw new InvalidOperationException("Upload reservation ownership is invalid.");
			}
			if (reservation.State is not UploadReservationState.Active) {
				return;
			}

			_reservedBytes -= reservation.Bytes;
			RemoveBytes(_reservedBytesByStaff, reservation.StaffUserId, reservation.Bytes);
			reservation.State = UploadReservationState.Released;
		}
	}

	private static long GetUsedBytes(
		IReadOnlyDictionary<Guid, long> bytesByStaff,
		Guid staffUserId
	) {
		return bytesByStaff.GetValueOrDefault(staffUserId);
	}

	private static bool WouldExceed(long usedBytes, long requestedBytes, long maxBytes) {
		return usedBytes > maxBytes - requestedBytes;
	}

	private static void AddBytes(
		IDictionary<Guid, long> bytesByStaff,
		Guid staffUserId,
		long bytes
	) {
		var current = bytesByStaff.TryGetValue(staffUserId, out var value)
			? value
			: 0;
		bytesByStaff[staffUserId] = current + bytes;
	}

	private static void RemoveBytes(
		IDictionary<Guid, long> bytesByStaff,
		Guid staffUserId,
		long bytes
	) {
		var current = bytesByStaff.TryGetValue(staffUserId, out var value)
			? value
			: 0;
		var remaining = current - bytes;
		if (remaining <= 0) {
			bytesByStaff.Remove(staffUserId);
			return;
		}

		bytesByStaff[staffUserId] = remaining;
	}

	private void EnsureActiveReservation(UploadReservation reservation) {
		if (!ReferenceEquals(reservation.Owner, this)) {
			throw new InvalidOperationException("Upload reservation ownership is invalid.");
		}
		if (reservation.State is not UploadReservationState.Active) {
			throw new InvalidOperationException("Upload reservation is no longer active.");
		}
	}
}
