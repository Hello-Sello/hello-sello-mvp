// Empty stand-in for Next's vendored `server-only` marker package so vitest (the
// pure-node unit runner, no Next bundler) can import 'use server' action modules
// that transitively pull it in — e.g. src/app/team/actions.ts → @/shared/db/admin
// → import 'server-only'. Aliased in vitest.config.ts.
//
// The real `server-only` package is a build-time guard that throws ONLY when a
// module is bundled into a Client Component. That never happens under the unit
// runner (we import the action module directly, server-side), so an empty module
// is the correct, zero-effect stand-in. Added in 12-01 (Wave-0) so the Path-B
// server-action unit specs can assert their validation contract against the real
// modules; they go GREEN when 12-03/12-04 export the new actions.
export {}
