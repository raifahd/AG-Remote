# Rules for the Antigravity Agent

These rules are binding.

## Workflow

- **R-1**: Read this SRS fully before writing code. Treat it as the source of truth. If something is unclear or contradictory, ask the owner instead of guessing.
- **R-2**: Work one phase at a time, in order. Do not start work belonging to a later phase.
- **R-3**: At the end of each phase, stop. Report what was done, what was tested, what failed, and what is next. Wait for explicit approval before continuing.
- **R-4**: Before starting a phase, write a short plan listing the files you will create or change. Keep changes within that plan.
- **R-5**: Commit in small steps with conventional commit messages. Never rewrite history. Never force push.

## Verification and Honesty

- **R-6**: Never invent an API. Before using any function from antigravity-sdk, vscode, ws, express, zod or Expo, read its actual type definitions or documentation in node_modules or the official docs and confirm the name and signature exist.
- **R-7**: Phase 0 findings override assumptions in this document. If a capability is not verified, mark it as unverified in docs/capabilities.md and tell the owner.
- **R-8**: Do not claim something works unless you ran it. State exactly how you verified it.
- **R-9**: If a test fails, fix the cause. Do not weaken or delete the test to make it pass.
- **R-10**: If blocked after two attempts, stop and report the problem with the error output instead of trying risky workarounds.

## Code Quality

- **R-11**: Write simple code. Prefer plain functions and clear names. Avoid clever abstractions.
- **R-12**: Do not add code comments. Make the code self-explanatory. Record rationale in docs/decisions.md.
- **R-13**: TypeScript strict mode and no any in the bridge and shared package. The Expo app is JavaScript. Validate all external input with zod in both.
- **R-14**: IDE-specific logic lives only in files under adapters. Everything else depends on the AgentAdapter interface.
- **R-15**: Add a test with every feature that has logic. Run lint, typecheck and tests before declaring a phase done.
- **R-27**: Write cross-platform code. Use path and os for paths and system information. Keep OS-specific logic in scripts/ and packages/bridge/src/network.ts only. Every shell script needs a PowerShell twin, and each phase's manual checklist is run on both Windows and Debian.

## Dependencies

- **R-16**: Ask before adding any dependency not listed in section 5. Prefer the standard library and existing dependencies.
- **R-17**: Pin exact versions. Do not use packages that require payment, an account, or a hosted service.
- **R-26**: The mobile app runs in Expo Go. Use only libraries bundled with Expo Go. Do not add custom native modules, and do not run prebuild or eject. Check Expo Go compatibility of every package before using it.

## Security and Compliance (Non-negotiable)

- **R-18**: Never read, copy, log, store, transmit or reference Antigravity, Google or any OAuth tokens, cookies or credentials. Do not inspect credential files or databases for them.
- **R-19**: Never commit secrets. Keep tokens, topics and keys out of the repository, logs, error messages and notifications. Use SecretStorage and environment files that are gitignored.
- **R-20**: Never bind the server to a public interface by default. Never disable authentication, even temporarily or for testing.
- **R-21**: Do not weaken any requirement in section 9 for convenience. If one blocks progress, ask the owner.
- **R-22**: Do not run destructive commands (deleting outside the repository, force pushes, system configuration changes, installing system services) without explicit approval.
- **R-23**: Do not modify Antigravity installation files. The bridge works only through supported extension APIs, the SDK, and the debug port.

## Communication

- **R-24**: Keep reports short and factual. Use the format: Done, Verified, Problems, Next.
- **R-25**: Record every deviation from this SRS, with the reason, in docs/decisions.md and tell the owner.

## Definition of Done for Any Task

Code compiles, typecheck and lint pass, tests pass, behavior was demonstrated, docs/capabilities.md or docs/decisions.md updated if anything surprising was found, and the change is committed.
