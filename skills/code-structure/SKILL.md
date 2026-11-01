---
name: code-structure
description: Code structure and function decomposition patterns. Auto-applied when writing or reviewing TypeScript code to enforce clean separation of concerns.
user-invocable: false
---

# Code Structure Patterns

These patterns complement the Function Design rules in CLAUDE.md with specific guidance on decomposition, dependency flow, and naming.

## 1. One Operation Per Function

Each distinct, nameable operation gets its own function. Don't mix data fetching, transformation, and side effects in a single function body.

**Bad** — multiple concerns inlined:

```ts
function handle(state: State) {
  return Effect.gen(function* () {
    const erp = yield* ErpConnector;
    const items = state.resolvedItems ?? state.lineItems ?? [];
    const checks = yield* Effect.forEach(
      items,
      (item) =>
        Effect.gen(function* () {
          const level = yield* erp.checkInventory({
            tenantId: state.tenantId!,
            itemId: item.productId,
          });
          return { item, level };
        }),
      { concurrency: "unbounded" },
    );
    const plan = checks.map(({ item, level }) => ({
      itemId: item.productId,
      action:
        level.available >= item.quantity
          ? ("STOCK" as const)
          : ("MAKE" as const),
      quantity: item.quantity,
    }));
    const event = plan.some((p) => p.action === "MAKE")
      ? productionPlanDetermined({ orderId: state.orderId, plan })
      : readyToFulfill({ orderId: state.orderId, plan });
    const store = yield* EventStore;
    yield* store.append({
      streamId: state.orderId,
      events: [event],
      expectedVersion: state.version,
    });
  });
}
```

**Good** — each operation is a named function:

```ts
handle: (event) =>
  Effect.gen(function* () {
    const state = yield* loadAggregate(event.payload.orderId);
    const plan = yield* buildFulfillmentPlan(state);
    yield* emitFulfillmentDecision({ state, plan });
  }),
```

## 2. Functions Own Their Dependency Resolution

**Applies to: Effect code only.** In vanilla TypeScript, prefer explicit parameters.

In Effect, functions resolve their own services internally via `yield* ServiceTag`. The `R` type channel makes implicit dependencies visible at the type level, so this is safe. Don't resolve a service at a higher level just to pass it down.

**Bad** — resolved at caller, passed as param:

```ts
function buildPlan(state: State) {
  return Effect.gen(function* () {
    const erp = yield* ErpConnector;
    const checks = yield* checkLevels({
      erp,
      tenantId: state.tenantId!,
      items,
    });
  });
}
```

**Good** — each function resolves what it needs:

```ts
function buildPlan(state: State) {
  return Effect.gen(function* () {
    const checks = yield* checkLevels(state);
    return toPlan(checks);
  });
}
```

## 3. Pass the Aggregate in Domain Pipeline Code

**Applies to: event-sourced aggregates, sagas, and pipeline steps.** In general-purpose code, prefer narrow explicit parameters for testability and reuse.

In domain pipeline code, pass the aggregate state object. The function decides what properties it needs. This keeps call sites clean and avoids "parameter plucking" noise.

**Bad** — plucking fields at the call site:

```ts
const checks =
  yield *
  checkLevels({
    tenantId: state.tenantId!,
    items: state.resolvedItems ?? state.lineItems ?? [],
  });
```

**Good** — function receives state and plucks internally:

```ts
const checks = yield * checkLevels(state);
```

## 4. Orchestrators Read as Pipelines

Top-level handlers (use cases, saga steps, command handlers) should be a clean sequence of named function calls. No inline logic — each step reads like a sentence describing what happens.

```ts
handle: (event) =>
  Effect.gen(function* () {
    const state = yield* loadAggregate(event.payload.orderId);
    const plan = yield* buildFulfillmentPlan(state);
    yield* emitFulfillmentDecision({ state, plan });
  }),
```

If a step requires inline logic beyond a single function call, that's a signal to extract it.

## 5. Semantic Identifiers Over Structural Ones

Prefer domain-meaningful accessors over structural/generic ones, even when they resolve to the same value.

**Bad** — structural accessor:

```ts
const state = yield * loadAggregate(event.streamId);
```

**Good** — domain-meaningful accessor:

```ts
const state = yield * loadAggregate(event.payload.orderId);
```

## 6. Child Functions Below the Caller

Define extracted helper functions **below** the consuming function, not above. The exported/public entry point sits at the top of the file so readers see the high-level intent first, then drill into details.

**Bad** — helpers above the entry point:

```ts
function tryAppend(params: AppendParams) {
  /* ... */
}
function failOnConflict(result: AppendResult) {
  /* ... */
}

export const InMemoryEventStore = Layer.effect(
  EventStore,
  Effect.gen(function* () {
    // uses tryAppend, failOnConflict
  }),
);
```

**Good** — entry point first, helpers below:

```ts
export const InMemoryEventStore = Layer.effect(
  EventStore,
  Effect.gen(function* () {
    // uses tryAppend, failOnConflict
  }),
);

function tryAppend(params: AppendParams) {
  /* ... */
}
function failOnConflict(result: AppendResult) {
  /* ... */
}
```
