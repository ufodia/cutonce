# Privacy and local data

CutOnce 0.1.0 processes material photos, geometry and layouts in your browser. The application has no account system, application server, telemetry integration, or photo-upload endpoint.

## What leaves the application

- Saving a project writes a file to the location you choose. That JSON may contain the embedded photograph, project name, dimensions, boundary and defect polygons.
- Exporting SVG or print HTML creates a vector file or document containing project information and layout labels. Those cutting exports omit the original photograph. Review the output before sharing it.
- Opening GitHub or Buy Me a Coffee links visits those services. Their own privacy practices apply to that visit.
- Installing dependencies and obtaining the application source use npm and GitHub. Those development operations are separate from processing a photo in the running app.

## Session state is not a backup

Do not assume that unsaved work survives a refresh, closed tab, browser crash or device replacement. Save project JSON and keep an appropriate copy of that file. The repository backs up application source; it does not back up your local workshop projects.

## Before you share a report

Check a photo for faces, labels, addresses, serial numbers or other information that you do not want to publish. Prefer the included sample or a minimal geometry-only reproduction for a public issue.

Imported project files are untrusted. Format validation and escaped labels reduce specific input risks; they do not establish that a file or the browser environment is safe. Use [SECURITY.md](../SECURITY.md) for sensitive vulnerability reports.
