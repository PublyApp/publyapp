namespace PublyApp.Api.Modules.Publishing.Entities;

// Scheduled = 10, InProgress = 20, Published = 30, Failed = 40, Paused = 50
// (Epic D §2). Gaps keep room for later states without renumbering; the check
// constraint in PublicationConfiguration pins exactly these values.
public enum PublicationStatus {
	Scheduled = 10,
	InProgress = 20,
	Published = 30,
	Failed = 40,
	Paused = 50,
}
