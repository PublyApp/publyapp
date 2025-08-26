using Microsoft.AspNetCore.Mvc.ModelBinding;
using System.Text.Json;

namespace MainApi.Src.Features.Common.Auth.Handlers.PasswordLogin;

// Custom model binder for JsonElement properties
public class JsonElementModelBinder : IModelBinder
{
	public async Task BindModelAsync(ModelBindingContext bindingContext)
	{
		if (bindingContext == null)
		{
			throw new ArgumentNullException(nameof(bindingContext));
		}

		var httpContext = bindingContext.HttpContext;
		var request = httpContext.Request;

		if (!request.HasJsonContentType())
		{
			bindingContext.Result = ModelBindingResult.Failed();
			return;
		}

		try
		{
			using var reader = new StreamReader(request.Body);
			var jsonString = await reader.ReadToEndAsync();

			if (string.IsNullOrEmpty(jsonString))
			{
				bindingContext.Result = ModelBindingResult.Failed();
				return;
			}

			var jsonDocument = JsonDocument.Parse(jsonString);
			var rootElement = jsonDocument.RootElement;

			// Create the target model type (BodyDto)
			var modelType = bindingContext.ModelType;
			var model = Activator.CreateInstance(modelType);

			// Get all properties that are JsonElement
			var properties = modelType.GetProperties()
					.Where(p => p.PropertyType == typeof(JsonElement));

			foreach (var property in properties)
			{
				if (rootElement.TryGetProperty(property.Name.ToLowerInvariant(), out var element))
				{
					property.SetValue(model, element);
				}
				else
				{
					// Set default JsonElement for missing properties
					property.SetValue(model, default(JsonElement));
				}
			}

			bindingContext.Result = ModelBindingResult.Success(model);
		}
		catch (JsonException)
		{
			// If JSON parsing fails, we still want to create a model with default JsonElements
			// so validation can handle the error
			var modelType = bindingContext.ModelType;
			var model = Activator.CreateInstance(modelType);
			bindingContext.Result = ModelBindingResult.Success(model);
		}
	}
}

// Model binder provider
public class JsonElementModelBinderProvider : IModelBinderProvider
{
	public IModelBinder? GetBinder(ModelBinderProviderContext context)
	{
		if (context == null)
		{
			throw new ArgumentNullException(nameof(context));
		}

		// Check if the model type has JsonElement properties
		var modelType = context.Metadata.ModelType;
		var hasJsonElementProperties = modelType.GetProperties()
				.Any(p => p.PropertyType == typeof(JsonElement));

		if (hasJsonElementProperties)
		{
			return new JsonElementModelBinder();
		}

		return null;
	}
}
