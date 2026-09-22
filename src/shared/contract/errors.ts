// The one error envelope every failure path on the crossing uses (AD-10,
// epics.md Story 1.5 AC2).
//
// All four kinds are present from the outset rather than grown one at a time,
// so the single error slot (AD-9) can classify any failure the moment it sees
// one. A transport failure is classified by the operation attempted, not by a
// response that never arrived.
//
// Success responses carry no envelope: they are the bare resource or a bare
// array (AC6, SPINE "Error shape"). That standing rule binds Epics 2-5; this
// story adds no endpoint to apply it to.
//
// The `kind` -> HTTP response-code mapping and the client's `kind` -> copy
// mapping both live with the stories that need them, not here.
export type ErrorKind = "load" | "create" | "update" | "delete";

export type ErrorEnvelope = {
  error: {
    kind: ErrorKind;
    /** Diagnostic only. The client never forwards or composes this (AD-10). */
    message: string;
  };
};
