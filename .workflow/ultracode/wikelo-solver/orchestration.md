# Orchestration

- Parent critical path: initialize starter -> preview server -> design approval -> implement -> build -> smoke test -> approval to publish.
- Wave 1: three parallel explorer/design agents, each owns one preview HTML file outside the site source.
- Delegation: 3 sidecar agents, 1 wave; no write-capable implementation agents until the user approves.
- Wait point: collect all three previews before presenting the picker.
- Fallback: if preview rendering or picker is unavailable, present text briefs and pause for approval.
- Verification order: source inspection, build, browser smoke, then hosting approval.
