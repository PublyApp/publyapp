using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Uploads.Handlers.Staff;

namespace PublyApp.Api.Modules.Uploads.Endpoints;

public static class UploadEndpointsForStaff {
	public static IEndpointRouteBuilder MapUploadEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes
			.MapGroup(Routes.Uploads.ForStaff.Root)
			.WithTags("Staff Uploads");

		group.MapPost(
				Routes.Uploads.ForStaff.Create,
				CreateStaffUpload.Handle
			)
			.WithName("CreateStaffUpload")
			.WithSummary(
				"Upload an image (multipart 'file' field) and get back a served URL"
			)
			.DisableAntiforgery()
			.WithPermission([
				AppPermissions.Staff.Uploads.CREATE
			]);

		return routes;
	}
}
