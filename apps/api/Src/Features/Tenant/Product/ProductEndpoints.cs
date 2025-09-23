using MainApi.Src.Lib.Extensions;

namespace MainApi.Src.Features.Tenant.Product;

public static class ProductEndpoints {
	public static IEndpointRouteBuilder MapProductEndpoints(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup("/products")
				.WithTags("Products")
		.WithOpenApi();

		group.MapGet("/", ProductHandlers.GetProducts)
			.WithName("GetProducts")
			.WithSummary("Get all products")
			.Produces500ApiResponse();

		group.MapGet("/{id}", ProductHandlers.GetProductById)
		.WithName("GetProduct")
		.WithSummary("Get product by ID")
		.Produces500ApiResponse();

		group.MapPost("/", ProductHandlers.CreateProduct)
			.WithName("CreateProduct")
			.WithSummary("Create a new product")
			.Produces500ApiResponse();

		group.MapPut("/{id}", ProductHandlers.UpdateProduct)
			.WithName("UpdateProduct")
			.WithSummary("Update an existing product")
			.Produces500ApiResponse();

		group.MapDelete("/{id}", ProductHandlers.DeleteProduct)
			.WithName("DeleteProduct")
			.WithSummary("Delete a product")
			.Produces500ApiResponse();

		return routes;
	}
}
