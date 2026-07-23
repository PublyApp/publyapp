using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Uploads.Handlers.Staff;

namespace PublyApp.Api.Modules.Uploads.Endpoints;

public static class UploadEndpointsForStaff {
	public static IEndpointRouteBuilder MapUploadEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes
			.MapGroup(Routes.Uploads.ForStaff.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Staff Uploads");

		group.MapPost(
				Routes.Uploads.ForStaff.Create,
				CreateStaffUpload.Handle
			)
			.WithName("CreateStaffUpload")
			.RequireRateLimiting(
				ApiRateLimitPolicies.Upload
			)
			.WithSummary(
				"Upload an image (multipart 'file' field) and get back a served URL"
			)
			.DisableAntiforgery()
			// Rejects oversize bodies at the transport level (413) before the
			// multipart body is spooled to a temp file, so an unauthorized or
			// over-limit caller cannot force a full buffer-to-disk per request.
			// A small buffer above UPLOAD_MAX_BYTES keeps this permissive
			// relative to the handler's own authoritative size check.
			.WithMetadata(
				new RequestSizeLimitAttribute(
					AppEnvironment.Instance.UPLOAD_MAX_BYTES + UploadLimits.MultipartHeaderHeadroomBytes
				)
			)
			.WithPermission([
				AppPermissions.Staff.Uploads.CREATE
			]);

		return routes;
	}
}
