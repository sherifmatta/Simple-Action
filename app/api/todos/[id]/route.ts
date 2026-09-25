import type { NextRequest } from "next/server";

import {
  logSafeError,
  requestFailedResponse,
} from "@/server/http/route-failure";
import {
  privateToTheCaller,
  resolveClientIdentity,
  unauthorizedIdentityResponse,
} from "@/server/identity/request-identity";
import { deleteTodo, setTodoCompleted } from "@/server/repository/todos";
import { isCanonicalUuidV7 } from "@/server/validation/todo-id";

// The one-Todo endpoint: the path segment names the resource, so everything
// that acts on a single Todo lands here rather than on the collection route
// next door. Story 5.1's `DELETE` joined it for that reason, and shares this
// file's identity gate and id gate verbatim rather than restating them one
// segment along.
//
// Like its sibling it reads an identity and never issues one (AD-17), and
// `middleware.ts` already answers `401` for any `/api/**` request without a
// valid identity — its matcher covers everything under `app/api/`, so this new
// segment needed no change there. This handler's own `401` is the second wall,
// and the one that makes the behaviour true of the handler itself.
//
// `PATCH` and not `PUT`: the request carries one field of a Todo, and the two
// the caller may not set — `text` and `createdAt` — are absent from the `SET`
// rather than absent from the body by convention.

/**
 * The body of every failure `PATCH` reports — its own string, not a reuse.
 *
 * One message covers the `400`, the `404` and the `500` deliberately. Story 4.1
 * AC4 asks that an update refused for a foreign owner disclose nothing about
 * the row, and "that Todo exists but is not yours" is itself the disclosure; a
 * single fixed message says only that this update did not happen, which is all
 * the client is entitled to and all AD-10 lets it do anything with.
 *
 * Fixed, and never composed from the caught error: `ErrorEnvelope["error"]["message"]`
 * is an unconstrained `string` crossing the wire, so a driver error interpolated
 * here would put SQL text in the browser. The real error is logged instead.
 *
 * Exported so `route.test.ts` can assert equality rather than "some string",
 * which a driver error would also satisfy.
 */
export const UPDATE_FAILED_MESSAGE = "The Todo could not be updated.";

/**
 * The body of every failure `DELETE` reports — its own string, not a reuse.
 *
 * Its own constant rather than a second consumer of `UPDATE_FAILED_MESSAGE`,
 * for the reason that constant's own note gives: the message names the
 * operation that did not happen, and "the Todo could not be updated" is the
 * wrong sentence for a refused deletion however similar the two look today.
 * The two are free to diverge, and the client never renders either — AD-10
 * makes the envelope's `message` diagnostic only, and the interface shows the
 * shared save-failure copy instead.
 *
 * Fixed, and never composed from the caught error, for the same reason the
 * update's is: `ErrorEnvelope["error"]["message"]` is an unconstrained `string`
 * crossing the wire, so a driver error interpolated here would put SQL text in
 * the browser. The real error is logged instead.
 *
 * Exported so `route.test.ts` can assert equality rather than "some string".
 */
export const DELETE_FAILED_MESSAGE = "The Todo could not be deleted.";

/**
 * The `PATCH` body, as the wire actually delivers it.
 *
 * One field wide, and local rather than shared. `contract.test.ts` fails any
 * declaration outside `src/shared/contract/` that spells `text`, `completed`
 * and `createdAt` together and pins that directory at three modules, so a
 * shared request type has nowhere to live; this one names one of the three and
 * is safe. It is also genuinely not a `Todo` minus fields — it is the value the
 * user asked for, and the server owns everything else about the row.
 */
type SetCompletedRequest = { completed: boolean };

/**
 * Whether a parsed body carries the one thing this endpoint reads.
 *
 * `unknown` in, because `request.json()` returns whatever arrived: a JSON
 * array, a string, `null` and a number are all valid JSON and none of them is
 * an update. `completed` must be a boolean and not merely present — `"true"`
 * and `1` are how a Completion Status becomes a string column somewhere
 * downstream.
 *
 * Extra keys are not policed, and that is deliberate rather than an omission.
 * The predicate reads one field and `setTodoCompleted` names one column, so a
 * body smuggling `text` or `createdAt` writes nothing at all — a stronger
 * guarantee than a rejection branch that has to remember to exist.
 */
function isSetCompletedRequest(body: unknown): body is SetCompletedRequest {
  if (typeof body !== "object" || body === null) return false;

  return "completed" in body && typeof body.completed === "boolean";
}

/**
 * `PATCH /api/todos/:id` — store the Completion Status the caller asked for.
 *
 * A **set** and never a toggle (AC1, AC2): the body carries the value the user
 * asked for, so a retry stores that same value rather than flipping it a second
 * time, and no answer this endpoint gives depends on what is currently stored.
 *
 * The order of the gates is load-bearing, and is the collection route's order.
 * Identity first, so a request carrying no Client Identity is `401` whatever
 * else is wrong with it and an unidentified caller learns nothing about this
 * endpoint's validation. The path id's *form* second, so a segment that is not
 * a lowercase-canonical UUIDv7 is refused before any query runs — Postgres's
 * `uuid` type would otherwise turn a typo into a driver error and a `500`. The
 * body third. The repository last, which is the only thing here that touches
 * the database: this handler builds no query (AD-2).
 *
 * The id is read from the awaited `params` and the owner from the cookie, never
 * the other way round (AD-7, AD-17). Nothing in the path or the body may name
 * an owner, which is why `setTodoCompleted` is passed `identity.id` rather than
 * anything that arrived with the request.
 *
 * Next 16: the second argument's `params` is a `Promise` and must be awaited.
 * It is typed inline rather than with the global `RouteContext<'/api/todos/[id]'>`
 * helper, which is generated into `.next/types` — and `npm run build` runs
 * `lint` and `typecheck` *before* `next build` regenerates it, so a typecheck on
 * a clean checkout would fail on a type that does not exist yet.
 *
 * Success is the updated Todo bare, with no envelope (SPINE "Error shape").
 * `undefined` from the repository is a `404` covering both "no such Todo" and
 * "not the caller's Todo": the owner-scoped `WHERE` makes those one result, and
 * any status that told them apart would itself be the disclosure AC4 forbids.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const identity = await resolveClientIdentity(request);
    // Already marked private by the helper, which is also what `middleware.ts`
    // answers with — so the `401` a browser receives carries the same headers
    // whether or not it ever reaches this handler.
    if (!identity) return unauthorizedIdentityResponse(request.method);

    const { id } = await params;

    if (!isCanonicalUuidV7(id)) {
      return privateToTheCaller(
        requestFailedResponse(request.method, 400, UPDATE_FAILED_MESSAGE),
      );
    }

    // Swallowed rather than thrown into the catch below, and not merely for
    // tidiness: `SyntaxError` from `JSON.parse` quotes the offending input, so
    // logging it would put a fragment of the submitted body in a log line,
    // which SPINE "Logging" forbids. A body that is not JSON is a caller error,
    // not a server failure, and answers `400`.
    const submitted: unknown = await request.json().catch(() => undefined);

    if (!isSetCompletedRequest(submitted)) {
      return privateToTheCaller(
        requestFailedResponse(request.method, 400, UPDATE_FAILED_MESSAGE),
      );
    }

    const updated = await setTodoCompleted(
      identity.id,
      id,
      submitted.completed,
    );

    if (!updated) {
      return privateToTheCaller(
        requestFailedResponse(request.method, 404, UPDATE_FAILED_MESSAGE),
      );
    }

    return privateToTheCaller(Response.json(updated));
  } catch (error) {
    // The statement summary only — never the error object, which carries the
    // query, and never the message whole, which carries the bound parameters
    // (SPINE "Logging"). This statement binds the Completion Status, the
    // Todo's id and the owner id; `RETURNING` names columns and binds nothing,
    // so no Todo text rides along here as it does on the create path. The
    // owner id is reason enough on its own: it is the Client Identity every
    // one of this person's rows is keyed by. See `logSafeError`.
    console.error("PATCH /api/todos/[id] failed:", logSafeError(error));

    return privateToTheCaller(
      requestFailedResponse(request.method, 500, UPDATE_FAILED_MESSAGE),
    );
  }
}

/**
 * `DELETE /api/todos/:id` — remove the caller's Todo, permanently.
 *
 * The same gate order as `PATCH` above, minus the body step, and the order is
 * load-bearing for the same three reasons. Identity first, so a request
 * carrying no Client Identity is `401` whatever else is wrong with it. The path
 * id's *form* second, so a segment that is not a lowercase-canonical UUIDv7 is
 * refused before any query runs — Postgres's `uuid` type would otherwise turn a
 * typo into a driver error and a `500`. The repository last, which is the only
 * thing here that touches the database: this handler builds no query (AD-2).
 *
 * `204` with no body, and unconditionally so. Three cases answer identically —
 * a row that was there and is now gone, a row that was already gone, and a row
 * another identity owns — because `deleteTodo` returns `void` and there is
 * nothing here to branch on. That is the point rather than a simplification: a
 * retry of a delete whose answer the browser never saw must succeed (Story 5.1
 * AC2), and a delete aimed at somebody else's row must disclose nothing about
 * it (AC3), and any status that told the three apart would be an existence
 * oracle serving both failures at once. The property is structural — this
 * handler *could not* distinguish them if a later change wanted it to.
 *
 * `new Response(null, { status: 204 })` rather than `Response.json`: a `204`
 * carries no body by definition, and a JSON envelope on a success would also
 * contradict SPINE "Error shape", where only failures are enveloped. It is
 * still wrapped in `privateToTheCaller` — the answer is decided by the identity
 * cookie like every other response under `app/api/`, and a shared cache keying
 * on the URL alone is the bug that wrap exists to prevent.
 *
 * The id is read from the awaited `params` and the owner from the cookie, never
 * the other way round (AD-7, AD-17). Next 16's `params` is a `Promise` and is
 * typed inline for the same reason `PATCH`'s is: `RouteContext<'/api/todos/[id]'>`
 * is generated into `.next/types`, which `npm run build` writes only after
 * `lint` and `typecheck` have already run.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const identity = await resolveClientIdentity(request);
    if (!identity) return unauthorizedIdentityResponse(request.method);

    const { id } = await params;

    if (!isCanonicalUuidV7(id)) {
      return privateToTheCaller(
        requestFailedResponse(request.method, 400, DELETE_FAILED_MESSAGE),
      );
    }

    await deleteTodo(identity.id, id);

    return privateToTheCaller(new Response(null, { status: 204 }));
  } catch (error) {
    // The statement summary only — never the error object, which carries the
    // query, and never the message whole, which carries the bound parameters
    // (SPINE "Logging"). This statement binds the Todo's id and the owner id;
    // there is no `RETURNING` and no text among them, but the owner id is the
    // Client Identity every one of this person's rows is keyed by, which is
    // reason enough on its own. See `logSafeError`.
    console.error("DELETE /api/todos/[id] failed:", logSafeError(error));

    return privateToTheCaller(
      requestFailedResponse(request.method, 500, DELETE_FAILED_MESSAGE),
    );
  }
}
