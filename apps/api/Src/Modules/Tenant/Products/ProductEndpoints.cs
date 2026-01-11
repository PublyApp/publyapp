using MainApi.Src.Lib.Extensions;

namespace MainApi.Src.Modules.Tenant.Products;

public static class ProductEndpoints {
	public static IEndpointRouteBuilder MapProductEndpoints(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup("/products")
			.WithTags("Products");

		group.MapGet("/", ProductHandlers.GetProducts)
			.WithName("GetProducts")
			.WithSummary("Get all products")
			.Produces<IEnumerable<Product>>(StatusCodes.Status200OK, "application/json");

		group.MapGet("/{id}", ProductHandlers.GetProductById)
			.WithName("GetProduct")
			.WithSummary("Get product by ID")
			.Produces<Product>(StatusCodes.Status200OK, "application/json")
			.ProducesAppProblem(StatusCodes.Status404NotFound);

		group.MapPost("/", ProductHandlers.CreateProduct)
			.WithName("CreateProduct")
			.WithSummary("Create a new product")
			.Produces<Product>(StatusCodes.Status201Created, "application/json");

		group.MapPut("/{id}", ProductHandlers.UpdateProduct)
			.WithName("UpdateProduct")
			.WithSummary("Update an existing product")
			.Produces<Product>(StatusCodes.Status200OK, "application/json")
			.ProducesAppProblem(StatusCodes.Status400BadRequest);

		group.MapDelete("/{id}", ProductHandlers.DeleteProduct)
			.WithName("DeleteProduct")
			.WithSummary("Delete a product")
			.Produces(StatusCodes.Status204NoContent)
			.ProducesAppProblem(StatusCodes.Status404NotFound);

		return routes;
	}
}
