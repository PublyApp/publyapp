using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Uploads.Handlers.Staff;

public sealed class CreateStaffUploadFailureSpec {
	private static readonly byte[] PngBytes = [
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
		0x00, 0x00, 0x00, 0x0D, 0x00, 0x00
	];

	[Fact]
	public async Task ItShouldReleaseAdmissionWhenAuditFailsAndCleanupSucceeds() {
		var admission = new UploadAdmissionService(PngBytes.Length, PngBytes.Length);
		var storage = new FakeStorage { DeleteResult = true };
		var audit = new ThrowingAuditLogService();

		await InvokeAndExpectAuditFailure(admission, storage, audit);

		admission.TryReserve(Guid.NewGuid(), PngBytes.Length)
			.Should().BeOfType<UploadAdmissionResult.Accepted>();
		storage.DeleteCalls.Should().Be(1);
	}

	[Theory]
	[InlineData(false)]
	[InlineData(true)]
	public async Task ItShouldKeepAdmissionWhenAuditFailureCleanupCannotBeConfirmed(
		bool throwOnDelete
	) {
		var admission = new UploadAdmissionService(PngBytes.Length, PngBytes.Length);
		var storage = new FakeStorage {
			DeleteResult = false,
			ThrowOnDelete = throwOnDelete
		};

		await InvokeAndExpectAuditFailure(
			admission,
			storage,
			new ThrowingAuditLogService()
		);

		admission.TryReserve(Guid.NewGuid(), PngBytes.Length)
			.Should().BeOfType<UploadAdmissionResult.Rejected>();
		storage.DeleteCalls.Should().Be(1);
	}

	[Fact]
	public async Task ItShouldRetryCleanupForAStorageFailureWithUnconfirmedCleanup() {
		var admission = new UploadAdmissionService(PngBytes.Length, PngBytes.Length);
		var storage = new FakeStorage {
			SaveException = new StorageWriteException(
				"uploads/failure.png",
				cleanupConfirmed: false,
				new IOException("partial write")
			),
			DeleteResult = false
		};

		var act = () => InvokeHandlerAsync(
			admission,
			storage,
			new ThrowingAuditLogService()
		);

		await act.Should().ThrowAsync<StorageWriteException>();
		storage.DeleteCalls.Should().Be(1);
		admission.TryReserve(Guid.NewGuid(), PngBytes.Length)
			.Should().BeOfType<UploadAdmissionResult.Rejected>();
	}

	private static async Task InvokeAndExpectAuditFailure(
		IUploadAdmissionService admission,
		FakeStorage storage,
		IAuditLogService audit
	) {
		var act = () => InvokeHandlerAsync(admission, storage, audit);

		await act.Should().ThrowAsync<InvalidOperationException>();
	}

	private static async Task InvokeHandlerAsync(
		IUploadAdmissionService admission,
		FakeStorage storage,
		IAuditLogService audit
	) {
		var userId = Guid.NewGuid();
		var formFile = new FormFile(
			new MemoryStream(PngBytes),
			0,
			PngBytes.Length,
			"file",
			"upload.png"
		) {
			Headers = new HeaderDictionary(),
			ContentType = "image/png"
		};

		await CreateStaffUpload.Handle(
			new RequestAuthContext {
				AccountStaff = UserAccount.CreateStaffAccount(userId)
			},
			storage,
			admission,
			audit,
			NullLogger<CreateStaffUpload>.Instance,
			formFile
		);
	}

	private sealed class ThrowingAuditLogService : IAuditLogService {
		public Task LogAsync(
			CreateAuditLogArgs args,
			CancellationToken cancellationToken = default
		) {
			throw new InvalidOperationException("audit failed");
		}

		public Task LogManyAsync(
			IReadOnlyCollection<CreateAuditLogArgs> argsList,
			CancellationToken cancellationToken = default
		) {
			throw new NotSupportedException();
		}
	}

	private sealed class FakeStorage : IFileStorage {
		public string RootPath {
			get {
				return "/tmp";
			}
		}
		public bool DeleteResult { get; init; }
		public bool ThrowOnDelete { get; init; }
		public Exception? SaveException { get; init; }
		public int DeleteCalls { get; private set; }

		public Task<string> SaveAsync(
			Stream content,
			string extension,
			CancellationToken cancellationToken = default
		) {
			if (SaveException is not null) {
				throw SaveException;
			}

			return Task.FromResult("uploads/failure.png");
		}

		public Task<bool> DeleteAsync(
			string relativePath,
			CancellationToken cancellationToken = default
		) {
			DeleteCalls += 1;
			if (ThrowOnDelete) {
				throw new IOException("delete failed");
			}

			return Task.FromResult(DeleteResult);
		}
	}
}
