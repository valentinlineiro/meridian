// Base of every domain rule violation. Carries a stable code; it knows nothing about HTTP (mapped at the delivery boundary).
export abstract class DomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = new.target.name;
  }
}
