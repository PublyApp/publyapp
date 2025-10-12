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
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		group.MapGet("/{id}", ProductHandlers.GetProductById)
		.WithName("GetProduct")
		.WithSummary("Get product by ID")
		.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		group.MapPost("/", ProductHandlers.CreateProduct)
			.WithName("CreateProduct")
			.WithSummary("Create a new product")
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		group.MapPut("/{id}", ProductHandlers.UpdateProduct)
			.WithName("UpdateProduct")
			.WithSummary("Update an existing product")
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		group.MapDelete("/{id}", ProductHandlers.DeleteProduct)
			.WithName("DeleteProduct")
			.WithSummary("Delete a product")
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		return routes;
	}
}
