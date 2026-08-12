using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Infrastructure.Storage;

public sealed class UploadAdmissionServiceSpec {
	[Fact]
	public void ItShouldRejectAReservationThatWouldExceedTheGlobalBudget() {
		var service = new UploadAdmissionService(
			globalMaxBytes: 10,
			perStaffMaxBytes: 10
		);
		var userId = Guid.NewGuid();

		var first = service.TryReserve(userId, 6);
		first.Should().BeOfType<UploadAdmissionResult.Accepted>();
		service.Commit(((UploadAdmissionResult.Accepted)first).Reservation);

		var second = service.TryReserve(userId, 4);
		second.Should().BeOfType<UploadAdmissionResult.Accepted>();
		service.Commit(((UploadAdmissionResult.Accepted)second).Reservation);

		service.TryReserve(userId, 1)
			.Should().BeOfType<UploadAdmissionResult.Rejected>();
	}

	[Fact]
	public void ItShouldApplyThePerStaffBudgetIndependentlyPerUser() {
		var service = new UploadAdmissionService(
			globalMaxBytes: 100,
			perStaffMaxBytes: 10
		);
		var firstUserId = Guid.NewGuid();
		var secondUserId = Guid.NewGuid();

		var first = service.TryReserve(firstUserId, 10);
		first.Should().BeOfType<UploadAdmissionResult.Accepted>();
		service.Commit(((UploadAdmissionResult.Accepted)first).Reservation);

		service.TryReserve(firstUserId, 1)
			.Should().BeOfType<UploadAdmissionResult.Rejected>();
		var second = service.TryReserve(secondUserId, 10);
		second.Should().BeOfType<UploadAdmissionResult.Accepted>();
	}

	[Fact]
	public void ItShouldReleaseAReservationAfterAFailedWrite() {
		var service = new UploadAdmissionService(
			globalMaxBytes: 10,
			perStaffMaxBytes: 10
		);
		var userId = Guid.NewGuid();

		var failedWrite = service.TryReserve(userId, 10);
		failedWrite.Should().BeOfType<UploadAdmissionResult.Accepted>();
		service.Release(((UploadAdmissionResult.Accepted)failedWrite).Reservation);

		var retry = service.TryReserve(userId, 10);
		retry.Should().BeOfType<UploadAdmissionResult.Accepted>();
	}

	[Theory]
	[InlineData(0)]
	[InlineData(-1)]
	public void ItShouldRejectNonPositiveByteCounts(long bytes) {
		var service = new UploadAdmissionService(
			globalMaxBytes: 10,
			perStaffMaxBytes: 10
		);

		var act = () => service.TryReserve(Guid.NewGuid(), bytes);

		act.Should().Throw<ArgumentOutOfRangeException>();
	}
}
