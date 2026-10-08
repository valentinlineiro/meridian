import { describe, it, expect } from "vitest";
import { Container, Token } from "../../src/kernel/container.ts";

const GREETING = new Token<string>("greeting");
const LENGTH = new Token<number>("length");

describe("Container", () => {
  it("shouldResolveARegisteredDependency", () => {
    const c = new Container().register(GREETING, () => "hola");
    expect(c.resolve(GREETING)).toBe("hola");
  });

  it("shouldResolveDependenciesOfOtherDependencies", () => {
    const c = new Container()
      .register(GREETING, () => "hola")
      .register(LENGTH, (k) => k.resolve(GREETING).length);
    expect(c.resolve(LENGTH)).toBe(4);
  });

  it("shouldBuildEachDependencyOnceWhenResolvedRepeatedly", () => {
    let built = 0;
    const c = new Container().register(GREETING, () => `hola${++built}`);
    c.resolve(GREETING);
    expect(c.resolve(GREETING)).toBe("hola1");
  });

  it("shouldNotBuildADependencyUntilItIsResolved", () => {
    let built = 0;
    new Container().register(GREETING, () => `hola${++built}`);
    expect(built).toBe(0);
  });

  it("shouldReplaceARegistrationWhenRegisteredAgain", () => {
    const c = new Container().register(GREETING, () => "hola").register(GREETING, () => "adios");
    expect(c.resolve(GREETING)).toBe("adios");
  });

  it("shouldFailNamingTheTokenWhenItIsNotRegistered", () => {
    expect(() => new Container().resolve(GREETING)).toThrow(/greeting/);
  });
});
