// The one fixture for "what a failing query actually rejects with".
//
// It encodes drizzle-orm's private message format, which is the sort of fact
// that must have exactly one home: every log-safety assertion in this
// repository is only worth what this fixture is, and a made-up separator or
// made-up params would let those rows pass green against a leak production
// still has. Three test files were carrying byte-identical copies before
// Story 4.1 collected them here.

/**
 * A driver failure shaped exactly as Drizzle constructs one.
 *
 * `DrizzleQueryError` is `` new Error(`Failed query: ${query}\nparams: ${params}`) ``
 * (`node_modules/drizzle-orm/errors.js`, `DrizzleQueryError`'s constructor),
 * thrown around every statement by `drizzle-orm/pg-core/session.js`'s
 * `queryWithCache` — so the bound parameters are part of `error.message` itself
 * and not merely of some property a caller could decline to read.
 *
 * `${params}` on an array is `Array.prototype.join(",")`, which is what the
 * template above does too.
 *
 * @param query The statement, as Drizzle would print it.
 * @param params The values actually bound to it, in order. Pass what the
 *   statement really binds: a fixture listing a value the query never bound
 *   proves nothing about the redaction of the values it does.
 */
export function drizzleQueryError(query: string, params: string[]): Error {
  return Object.assign(new Error(`Failed query: ${query}\nparams: ${params}`), {
    query,
    params,
  });
}
