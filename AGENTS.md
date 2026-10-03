# Greenvest Workspace Rules

## Supabase Database Usage
- The Supabase database (`zvjqpigduyvczidzafus`) is strictly dedicated to this **Greenvest** project (`greenvest-website`).
- MCP Supabase tools must only be used when working on tasks, migrations, or features for this project.
- Never use or leak this database configuration, schema, or credentials into other unrelated projects or workspaces.

## Ponytail Ruleset: Senior Developer Code Optimization (50% Bloat Reduction)
Adopt the **Ponytail (Lazy Senior Developer)** philosophy across all code generation:
1. **YAGNI (You Ain't Gonna Need It):** Never build speculative features, complex generic wrappers, or unnecessary abstractions. If it doesn't serve the direct goal, skip it.
2. **Reuse Existing Code First:** Check existing utilities (`withTimeout`, `storage.ts`, `authUtils.ts`, `sound.ts`) before writing new helpers.
3. **Native Web & Platform APIs:** Use native browser standards (Web Audio API for chimes, native `<input type="date">` / `<input type="time">`, CSS GPU `translate3d`, `navigator.geolocation`) instead of heavy npm libraries.
4. **Zero Bloat / 50% Less Code:** Keep functions tight, direct, and readable. Write the minimum amount of code required to achieve perfection.
5. **Lazy, Not Negligent:** While eliminating code bloat, NEVER compromise on security (RLS, input sanitization, authentication guards, anti-double-tap locks, error boundaries).
