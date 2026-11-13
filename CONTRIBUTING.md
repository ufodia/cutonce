# Contributing to CutOnce

Thank you for helping make leftover material more useful. Small geometry reproductions, clearer instructions and focused usability improvements are valuable contributions.

## Set up the project

Use Node.js 24 LTS and Git. Clone your fork or the repository, create a branch for your change, then run:

```sh
npm ci
npm run dev
```

Read [the architecture](docs/architecture.md) before changing the planner and [the reference](docs/reference.md) before changing saved project data.

## Report a bug

Use the issue template and include:

- The operation you attempted, what you expected and what happened.
- The browser and operating system.
- The source commit, if you know it.
- A minimal project or dimensions that reproduce the problem.

Prefer geometry-only sample data. Remove private photographs and identifying labels before posting public attachments. Use [SECURITY.md](SECURITY.md) for vulnerabilities rather than a public issue.

## Make a focused change

Keep geometry and validation independent of browser APIs. Treat imported names and image data as untrusted. Preserve measured export units, format-version compatibility, and result invalidation when inputs change.

Add a regression test when you fix a planning, validation or export rule. For a UI change, test the affected workflow and include a screenshot when it makes the review easier. Do not add tests that merely repeat implementation details.

Do not commit credentials, private project files, dependency folders or generated build output. Keep the lockfile with dependency changes. Use assets that you created or have permission to distribute, and document any required attribution.

## Check your work

```sh
npm run verify
npx playwright install --no-shell chromium
npm run test:e2e
```

Describe the checks you actually ran and any that you could not run. Update the appropriate usage, reference or architecture document when behavior changes. Keep all project content in English and align the README with shipped features.

## Open a pull request

Explain the concrete problem, the resulting behavior, and how you verified it. State any effect on saved data or export dimensions. Use one change per pull request where practical. Maintainers may request a smaller reproduction or additional evidence before merging.

By contributing, you agree that your contribution is distributed under the repository's [MIT license](LICENSE). Follow the [code of conduct](CODE_OF_CONDUCT.md).
