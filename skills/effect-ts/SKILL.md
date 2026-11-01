---
name: effect-ts
description: Load Effect-TS library documentation for writing idiomatic Effect code. Use when working with Effect patterns, pipes, services, layers, errors, or concurrency.
---

# Effect-TS Documentation

Load the Effect-TS library documentation so you can write idiomatic Effect code with accurate API usage.

## Usage

- `/effect-ts` - Load the Effect documentation

## Workflow

When invoked:

1. Fetch the Effect-TS documentation from https://effect.website/llms-small.txt using the WebFetch tool
2. Use the fetched documentation as your reference for all Effect-related code in the current session
3. Confirm to the user that the documentation has been loaded and you're ready to assist with Effect code

## Prompt

Fetch and read the Effect-TS documentation:

```
Use WebFetch to retrieve https://effect.website/llms-small.txt with the prompt:
"Extract and return the full documentation content. This is the Effect-TS library reference documentation."
```

After loading, tell the user the documentation is loaded and ask how you can help with Effect code.
