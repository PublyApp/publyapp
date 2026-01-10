namespace MainApi.Src.Modules.Tenant.Products;

public static class ProductEndpoints {
	public static IEndpointRouteBuilder MapProductEndpoints(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup("/products")
				.WithTags("Products");

		group.MapGet("/", ProductHandlers.GetProducts)
			.WithName("GetProducts")
			.WithSummary("Get all products")
			;

		group.MapGet("/{id}", ProductHandlers.GetProductById)
		.WithName("GetProduct")
		.WithSummary("Get product by ID")
		;

		group.MapPost("/", ProductHandlers.CreateProduct)
			.WithName("CreateProduct")
			.WithSummary("Create a new product")
			;

		group.MapPut("/{id}", ProductHandlers.UpdateProduct)
			.WithName("UpdateProduct")
			.WithSummary("Update an existing product")
			;

		group.MapDelete("/{id}", ProductHandlers.DeleteProduct)
			.WithName("DeleteProduct")
			.WithSummary("Delete a product")
			;

		return routes;
	}
}
