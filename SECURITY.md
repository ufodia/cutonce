# Security policy

## Scope

Security-sensitive areas include imported project validation, raster-image handling, HTML/SVG escaping, downloaded output, and dependencies. A planning or measurement error can also be important; describe its practical effect accurately.

Only the current `main` source is maintained at this stage. There is no promised security-response time or long-term support branch.

## Report a vulnerability privately

Use [Report a vulnerability](https://github.com/ufodia/cutonce/security/advisories/new). GitHub private vulnerability reporting is enabled for this repository. Do not post exploit details, private project files or personal data in a public issue.

Include the affected commit, reproduction steps, impact and a minimal synthetic example through the private route. Share only data needed to reproduce the issue.

## Local processing boundary

The application does not provide an upload service or a sandbox for arbitrary active files. It accepts a documented project format and supported raster images. A file passing validation is not a general safety certification. See [privacy.md](docs/privacy.md) for exported-data considerations.
