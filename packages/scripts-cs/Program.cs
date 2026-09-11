using PublyApp.Scripts.Commands;

namespace PublyApp.Scripts;

public static class Program {
	public static int Main(string[] args) {
		if (args.Length == 0) {
			_WriteUsage();
			return 1;
		}

		var command = args[0];
		var commandArgs = args[1..];

		if (string.Equals(command, "generate-translation-keys", StringComparison.Ordinal)) {
			return GenerateTranslationKeys.Run(commandArgs);
		}

		if (string.Equals(command, "measure-status-guard-overhead", StringComparison.Ordinal)) {
			return MeasureStatusGuardOverhead.Run(commandArgs.ToArray());
		}

		Console.Error.WriteLine($"Unknown command: {command}");
		_WriteUsage();
		return 1;
	}

	private static void _WriteUsage() {
		Console.Error.WriteLine("Usage:");
		Console.Error.WriteLine(
			"  dotnet run --project <scripts-cs> -- generate-translation-keys <input-json-file> <output-cs-file>"
		);
	}
}
