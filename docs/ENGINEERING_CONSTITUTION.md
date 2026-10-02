# Global Engineering Constitution

These rules apply to every software project unless the project explicitly requires a different approach.

The goal is simple:

**Clean Architecture, DDD, minimal code, meaningful tests, clear behaviour, and no unnecessary complexity.**

---

# 1. Architecture

Use **Clean Architecture** as the default architectural model.

Dependencies must point inward:

```text
Delivery / Infrastructure
          ↓
      Application
          ↓
        Domain
```

* Domain must not depend on frameworks, infrastructure, databases, HTTP, messaging or UI.
* Application must not depend directly on infrastructure implementations.
* Infrastructure implements ports defined by inner layers.
* Delivery translates external input into application commands/queries and translates application results into external responses.

Use **ports and adapters** where an architectural boundary exists.

Do not introduce abstractions only for the sake of abstraction.

---

# 2. Domain-Driven Design

Use **DDD principles in the Domain layer**.

The domain model must represent the actual business concepts and rules of the system.

Use DDD building blocks when they provide real value:

* Entities
* Value Objects
* Aggregates
* Aggregate Roots
* Domain Services
* Domain Events
* Repositories as domain/application ports where appropriate
* Domain-specific exceptions

Do not introduce DDD patterns mechanically.

### Entities

Use entities when identity and lifecycle matter.

Entities should protect their own invariants where appropriate.

### Value Objects

Use Value Objects for concepts that have:

* domain meaning,
* validation rules,
* semantic identity by value.

Prefer:

```text
Money
Email
CustomerId
ProductCode
OrderStatus
```

over primitive obsession when the concept genuinely has domain behaviour or invariants.

Do not create Value Objects for trivial primitives without a reason.

### Aggregates

Use aggregates to define transactional consistency boundaries.

The Aggregate Root controls access to the aggregate's invariants.

Do not create enormous aggregates simply because objects are related.

### Domain Services

Use Domain Services only for domain behaviour that:

* belongs to the domain,
* does not naturally belong to a single entity/value object.

Do not use Domain Services as generic application services.

### Domain Events

Use Domain Events when an important domain fact has occurred and other behaviour needs to react to it.

Do not introduce events merely to decouple ordinary method calls.

### Domain repositories

Repositories represent domain/application needs, not database details.

Infrastructure implements them.

The domain must not know whether persistence is:

* SQL,
* NoSQL,
* an API,
* a file,
* an ORM,
* or an in-memory store.

---

# 3. Domain Invariants

Business invariants must be protected at the appropriate domain boundary.

Invalid domain states should not be freely constructible when the domain can prevent them.

Prefer:

```text
Order.create(...)
```

with domain validation over:

```text
new Order(...)
```

followed by scattered validation.

Business rules should live as close as possible to the domain concept that owns them.

Do not duplicate the same business rule across:

* controllers,
* application services,
* domain,
* repositories.

---

# 4. Use Cases

Organize business behaviour around **use cases**.

Each use case should have a clear vertical slice:

```text
Use Case
├── Application
├── Domain
├── Ports
└── Infrastructure adapters
```

Keep code required by a use case close to that use case when doing so improves cohesion.

Avoid artificial horizontal layers such as:

```text
Controller
Service
Manager
Helper
Utility
Repository
```

when they provide no meaningful architectural boundary.

---

# 5. Clean Code

Prefer:

* small focused methods,
* cohesive classes,
* explicit behaviour,
* meaningful names,
* simple control flow,
* low coupling,
* high cohesion,
* immutable data where appropriate.

Avoid:

* unnecessary indirection,
* premature abstraction,
* generic helpers,
* god classes,
* god services,
* deeply nested conditionals,
* speculative extensibility,
* duplicated configuration,
* clever code.

Prefer the **simplest implementation that correctly expresses the behaviour**.

---

# 6. Minimal Code

Write the **minimum code necessary** to satisfy the requirement correctly.

Do not add:

* speculative features,
* unused abstractions,
* unused configuration,
* unnecessary interfaces,
* unnecessary DTOs,
* unnecessary factories,
* unnecessary builders,
* unnecessary wrappers,
* unnecessary validation,
* unnecessary error types,
* unnecessary framework components.

Before adding code, ask:

> Can this requirement be satisfied with less code and the same clarity?

Prefer the smaller solution when both are equally correct.

---

# 7. Comments

Use **minimum comments**.

Code should explain what it does through structure and naming.

Do not add comments that merely describe the code.

Comments are appropriate only for:

* non-obvious business reasoning,
* invariants,
* workarounds,
* external constraints,
* surprising behaviour,
* decisions that cannot be expressed clearly in code.

Prefer explaining **why**, not **what**.

---

# 8. Error and Exception Architecture

Exceptions must respect architectural boundaries.

### Domain exceptions

Domain rules must use **domain-specific exceptions** when an exceptional condition is part of the domain behaviour.

Examples:

```text
InsufficientStock
OrderCannotBeCancelled
InvalidOrderState
CustomerNotEligible
```

Domain exceptions:

* belong to the Domain layer,
* contain domain meaning,
* must not depend on HTTP, REST, databases or frameworks,
* must not expose infrastructure details.

### Application exceptions

Application-level failures may use application-specific exceptions when the failure belongs to the use-case orchestration rather than the domain.

Examples:

```text
ResourceNotFound
UseCaseConflict
InvalidCommand
```

Do not use application exceptions to disguise domain rules.

---

# 9. Exception Mapping

**Internal exceptions must never leak directly through external interfaces.**

Map exceptions at the appropriate architectural boundary.

For example:

```text
Domain
  │
  │ throws
  ↓
DomainException
  │
  ↓
Application
  │
  ↓
Delivery / Adapter
  │
  │ maps
  ↓
External representation
```

For HTTP:

```text
OrderCannotBeCancelled
        ↓
HTTP 409 Conflict
```

```text
CustomerNotFound
        ↓
HTTP 404 Not Found
```

```text
InvalidCommand
        ↓
HTTP 400 Bad Request
```

The exact mapping depends on the API contract and project semantics.

### Rules

* Never expose domain exception class names as an API contract accidentally.
* Never expose stack traces.
* Never expose database exceptions.
* Never expose ORM exceptions.
* Never expose infrastructure implementation details.
* Never map every exception to `500` if the failure has a known external semantic.
* Never map every domain exception to the same HTTP status without considering its meaning.
* Preserve the domain meaning when translating it externally.
* Centralize external exception mapping where the framework supports it.

The external contract should expose a stable representation such as:

```json
{
  "code": "ORDER_CANNOT_BE_CANCELLED",
  "message": "Order cannot be cancelled in its current state"
}
```

rather than:

```json
{
  "exception": "OrderCannotBeCancelledException"
}
```

The external representation belongs to the **delivery/API boundary**, not to the domain.

---

# 10. Testing Strategy

Testing follows architectural boundaries and user-visible behaviour.

```text
UT  → Application behaviour
IT  → Use-case vertical slice
E2E → Functional user journey
```

Do not duplicate the same test at every level.

Each test must protect meaningful behaviour.

Do not write tests merely to increase coverage.

---

# 11. Application Unit Tests

Application use cases must have **unit tests**.

A unit test should exercise:

```text
Real Application
      ↓
Real Domain
      ↓
Stub/Fake at architectural boundaries
```

### Rules

* Test one application use case at a time.
* Execute the real application logic.
* Execute the real domain logic.
* Do not mock intermediate layers.
* Do not mock domain objects merely to isolate the application.
* Do not mock application services.
* Do not mock validators, policies or internal collaborators merely because they are classes.
* Replace external dependencies only at architectural boundaries.

### Stubs and fakes

Prefer:

* stubs for deterministic responses,
* fakes for lightweight stateful behaviour.

Example:

```text
Application
    ↓
Domain
    ↓
ProductRepository ← StubProductRepository
```

Avoid:

```text
Application
    ↓
MockService
    ↓
MockValidator
    ↓
MockRepository
```

### Core rule

> **Mock at boundaries, not between layers.**

More precisely:

> **UTs use real Application + real Domain + stubs/fakes at architectural ports. Never mock internal layers.**

If a use case requires many mocks to be tested, reconsider the design before adding more mocks.

---

# 12. Unit Test Assertions

Assert **observable behaviour**, not implementation details.

Prefer:

```text
result == expected
state == expected
event == expected
error == expected
```

Avoid tests whose main purpose is:

```text
verify(repository).save(...)
verify(service).execute(...)
verify(validator).validate(...)
```

unless the interaction itself is an explicit business requirement.

---

# 13. Integration Tests

Integration tests belong to the **vertical slice of a use case**.

They verify that real components collaborate correctly.

Example:

```text
HTTP
 ↓
Application
 ↓
Domain
 ↓
Repository
 ↓
Database
```

or:

```text
Application
 ↓
Domain
 ↓
Messaging adapter
 ↓
Message broker
```

### Rules

* Use real implementations for components whose integration is being tested.
* Use real infrastructure where practical.
* Do not replace the integration boundary with mocks.
* Keep the test focused on the use-case vertical slice.
* Do not reproduce every unit-test scenario.
* Test integration behaviour that cannot be proven by unit tests.

The purpose of an IT is:

> **Does this vertical slice actually work together?**

---

# 14. End-to-End Tests

E2E tests belong to the **functional layer**.

They represent complete user/business journeys.

Example:

```text
User
 ↓
API/UI
 ↓
Application
 ↓
Domain
 ↓
Infrastructure
 ↓
External system
```

### Rules

* Test through the real external interface.
* Test complete functional behaviour.
* Focus on high-value business journeys.
* Keep E2E tests few and meaningful.
* Do not test internal implementation details.
* Do not use E2E tests as a substitute for unit tests.
* Do not duplicate every unit-test scenario in E2E.

The purpose of E2E is:

> **Does the system perform the complete behaviour that matters to the user/business?**

---

# 15. Test Naming

All tests must use behaviour-oriented names following:

```text
shouldDoWhateverWhenInputIsWhatever
```

Examples:

```text
shouldCreateOrderWhenCustomerIsValid

shouldRejectOrderWhenStockIsInsufficient

shouldReturnEmptyResultWhenNoProductsMatch

shouldPublishOrderCreatedEventWhenOrderIsCreated

shouldReturnUnauthorizedWhenCredentialsAreInvalid
```

Avoid:

```text
testCreateOrder

createOrderTest

shouldWork

testRepository

shouldCallRepository

shouldExecuteService
```

The name must communicate:

1. expected behaviour,
2. relevant condition/context.

---

# 16. Test Structure

Prefer:

```text
Arrange
Act
Assert
```

Keep each test:

* short,
* deterministic,
* independent,
* readable,
* focused on one behavioural scenario.

Avoid:

* enormous fixtures,
* shared mutable state,
* complicated test factories,
* excessive setup,
* test inheritance,
* magic data.

Test data should make the scenario obvious.

---

# 17. Test Duplication

Do not automatically duplicate a scenario across UT, IT and E2E.

For example, this does not mean all three are required:

```text
UT:
shouldRejectOrderWhenStockIsInsufficient

IT:
shouldRejectOrderWhenStockIsInsufficient

E2E:
shouldRejectOrderWhenStockIsInsufficient
```

Choose the level that proves the behaviour.

Use higher-level tests when they protect:

* an architectural boundary,
* infrastructure integration,
* a complete functional journey.

---

# 18. Implementation Workflow

For every change:

### 1. Understand

Inspect:

* existing architecture,
* relevant use case,
* domain model,
* existing tests,
* external boundaries.

Do not immediately start coding.

### 2. Identify behaviour

Determine exactly what behaviour must exist.

### 3. Implement minimally

Make the smallest coherent change.

### 4. Protect Application behaviour

Add/update UTs.

Use:

```text
real Application
+
real Domain
+
stubs/fakes at ports
```

### 5. Protect the vertical slice

Add/update ITs where infrastructure collaboration matters.

### 6. Protect the functional journey

Add/update E2E only where complete functional behaviour needs protection.

### 7. Run tests

Run the relevant test suite.

### 8. Simplify

Remove:

* unnecessary abstractions,
* unnecessary code,
* unnecessary comments,
* dead code,
* duplicated logic.

---

# 19. Refactoring

Refactor when it improves the current design.

Do not refactor merely because a pattern exists elsewhere.

Do not introduce patterns without a concrete problem.

Avoid unnecessary:

```text
Factory
Strategy
Builder
Manager
Coordinator
Facade
Adapter
```

Patterns are tools, not requirements.

---

# 20. Dependencies

Minimize dependencies.

Before adding a library, determine whether the behaviour can be implemented simply with the existing stack.

Do not introduce dependencies for trivial functionality.

Prefer standard-library solutions when they are sufficiently clear.

---

# 21. Framework Usage

Frameworks are implementation details.

Do not allow framework conventions to dictate the domain model unnecessarily.

Keep framework-specific code at outer boundaries whenever practical.

The core Application and Domain logic should remain easy to test without starting the full framework.

---

# 22. Persistence and Infrastructure

Persistence and external systems belong outside the application core.

Application code depends on ports representing required behaviour.

Infrastructure implements those ports.

Do not leak infrastructure types into the domain unnecessarily:

* ORM entities,
* HTTP clients,
* framework request objects,
* database-specific types,
* infrastructure exceptions.

---

# 23. Delivery Layer

Delivery code must remain thin.

Its responsibilities are primarily:

```text
external input
    ↓
mapping
    ↓
application use case
    ↓
mapping
    ↓
external output
```

Do not put business rules into:

* controllers,
* HTTP handlers,
* REST resources,
* message consumers,
* CLI commands.

External exception mapping belongs here.

---

# 24. Domain Purity

The Domain must not know about:

* HTTP,
* REST,
* JSON,
* databases,
* SQL,
* ORM frameworks,
* messaging infrastructure,
* HTTP status codes,
* UI,
* external DTOs.

Domain concepts should remain meaningful independently of the delivery mechanism.

---

# 25. Code Review Criteria

Before considering a change complete:

### Architecture

* [ ] Dependencies point inward.
* [ ] Domain is independent from infrastructure.
* [ ] Application does not depend directly on infrastructure implementations.
* [ ] Use case is vertically coherent.
* [ ] No unnecessary abstraction was introduced.

### Domain

* [ ] Business rules live in the appropriate domain concepts.
* [ ] DDD is used where it provides real value.
* [ ] Domain invariants are protected.
* [ ] Aggregates have sensible consistency boundaries.
* [ ] Domain exceptions express domain meaning.
* [ ] Domain does not depend on external technology.

### Errors

* [ ] Domain exceptions do not expose infrastructure details.
* [ ] Exceptions are mapped at the appropriate external boundary.
* [ ] External responses use stable error contracts.
* [ ] Stack traces/internal implementation details are not exposed.
* [ ] Domain semantics are preserved during mapping.

### Code

* [ ] Implementation is minimal.
* [ ] Names explain intent.
* [ ] Responsibilities are clear.
* [ ] No speculative functionality.
* [ ] No unrelated refactoring.
* [ ] No unnecessary comments.
* [ ] No dead code.

### Unit Tests

* [ ] Application behaviour is unit tested.
* [ ] Real Application logic is exercised.
* [ ] Real Domain logic is exercised.
* [ ] Internal layers are not mocked.
* [ ] Ports/external boundaries use stubs or fakes.
* [ ] Tests assert behaviour rather than implementation details.
* [ ] Test names follow `shouldDoWhateverWhenInputIsWhatever`.

### Integration Tests

* [ ] Relevant use-case vertical slice is tested.
* [ ] Real integration components are used where appropriate.
* [ ] Infrastructure collaboration is actually exercised.
* [ ] Tests do not merely duplicate unit tests.

### E2E

* [ ] Important functional journeys are covered.
* [ ] Tests exercise the real external interface.
* [ ] E2E suite remains small and high-value.
* [ ] No unnecessary duplication with UT/IT.

---

# 26. Default Decision Rule

When multiple implementations are valid:

1. Prefer the simpler implementation.
2. Prefer fewer abstractions.
3. Prefer fewer dependencies.
4. Prefer fewer lines of code.
5. Prefer clearer names.
6. Prefer real code over mocks in UTs.
7. Prefer stubs/fakes at architectural boundaries.
8. Prefer behaviour-oriented tests.
9. Prefer the lowest test level that proves the behaviour.
10. Add IT/E2E only when they protect something the lower level cannot prove.
11. Keep domain rules in the domain.
12. Preserve domain meaning when mapping errors externally.
13. Do not optimize for patterns, coverage or architecture aesthetics.

---

# 27. Final Principle

> **Build the smallest clean system that correctly models the domain, expresses the required behaviour, and proves that behaviour at the appropriate architectural level.**

> **Real Application. Real Domain. Stubs at boundaries. Integration through vertical slices. E2E through functional journeys. Minimal code. Minimal comments.**
