using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;

namespace MainApi.Src.Modules.Tenant.Products;

public static class ProductHandlers {
	public static async Task<IResult> GetProducts(IProductService productService, CancellationToken cancellationToken = default) {
		var products = await productService.GetAllProductsAsync(cancellationToken);
		return TypedResults.Ok(products);
	}

	public static async Task<IResult> GetProductById(Guid id, IProductService productService, CancellationToken cancellationToken = default) {
		var product = await productService.GetProductByIdAsync(id, cancellationToken);

		if (product is null) {
			return TypedProblems.NotFound("Product not found", ResponseKeys.NotFound);
		}

		return TypedResults.Ok(product);
	}

	public static async Task<IResult> CreateProduct(Product product, IProductService productService, CancellationToken cancellationToken = default) {
		var createdProduct = await productService.CreateProductAsync(product, cancellationToken);
		return TypedResults.Created($"/api/products/{createdProduct.Id}", createdProduct);
	}

	public static async Task<IResult> UpdateProduct(Guid id, Product product, IProductService productService, CancellationToken cancellationToken = default) {
		if (id != product.Id) {
			return TypedProblems.BadRequest("Product ID does not match route ID", ResponseKeys.BadRequest);
		}

		var updatedProduct = await productService.UpdateProductAsync(product, cancellationToken);
		return TypedResults.Ok(updatedProduct);
	}

	public static async Task<IResult> DeleteProduct(Guid id, IProductService productService, CancellationToken cancellationToken = default) {
		var deleted = await productService.DeleteProductAsync(id, cancellationToken);

		if (!deleted) {
			return TypedProblems.NotFound("Product not found", ResponseKeys.NotFound);
		}

		return TypedResults.NoContent();
	}
}
