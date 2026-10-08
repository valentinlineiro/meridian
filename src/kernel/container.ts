export class Token<T> {
  declare readonly type: T;
  constructor(readonly name: string) {}
}

// Composition only: use cases receive their ports through constructors and never see the container.
export class Container {
  private readonly factories = new Map<Token<unknown>, (c: Container) => unknown>();
  private readonly built = new Map<Token<unknown>, unknown>();

  register<T>(token: Token<T>, factory: (c: Container) => T): this {
    this.factories.set(token, factory);
    this.built.delete(token);
    return this;
  }

  resolve<T>(token: Token<T>): T {
    if (this.built.has(token)) return this.built.get(token) as T;
    const factory = this.factories.get(token);
    if (!factory) throw new Error(`not registered: ${token.name}`);
    const value = factory(this) as T;
    this.built.set(token, value);
    return value;
  }
}
