export class ApplicationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends ApplicationError {
  constructor(detail: string) {
    super("NOT_FOUND", detail);
  }
}

export class InvalidCommandError extends ApplicationError {
  constructor(detail: string) {
    super("INVALID_COMMAND", detail);
  }
}

export class OwnershipViolationError extends ApplicationError {
  constructor(detail: string) {
    super("OWNERSHIP_VIOLATION", detail);
  }
}

export class InvalidCredentialsError extends ApplicationError {
  constructor() {
    super("INVALID_CREDENTIALS", "invalid credentials");
  }
}

export class TooManyAttemptsError extends ApplicationError {
  constructor() {
    super("TOO_MANY_ATTEMPTS", "too many failed attempts");
  }
}

export class SyncUnavailableError extends ApplicationError {
  constructor(detail: string) {
    super("SYNC_UNAVAILABLE", detail);
  }
}

export class SyncAlreadyRunningError extends ApplicationError {
  constructor(readonly runId: number) {
    super("SYNC_IN_PROGRESS", "a sync is already running");
  }
}
