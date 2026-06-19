import * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { useAtom } from "@effect/atom-react";
import { client } from "../lib/eden-client";

class EdenRequestError extends Data.TaggedError("EdenRequestError")<{ readonly cause: unknown }> {}

const describeRaw = (cause: unknown): string =>
  typeof cause === "object" && cause !== null && "message" in cause && cause.message
    ? String(cause.message)
    : JSON.stringify(cause);

const describeCause = (cause: Cause.Cause<EdenRequestError>): string => {
  const squashed = Cause.squash(cause);
  return squashed instanceof EdenRequestError ? describeRaw(squashed.cause) : describeRaw(squashed);
};

// The Elysia app registers a catch-all onError handler (see elysia-app.ts),
// so Eden widens every route's success type to include that handler's
// return shape too. Narrow explicitly instead of assuming `data` always
// matches the expected success shape.
const unwrapEden = <K extends string>(
  result: { data: unknown; error: { value: unknown } | null },
  key: K,
): Effect.Effect<string, EdenRequestError> => {
  if (result.error) {
    return Effect.fail(new EdenRequestError({ cause: result.error.value }));
  }
  if (
    typeof result.data !== "object" ||
    result.data === null ||
    !(key in result.data) ||
    typeof (result.data as Record<K, unknown>)[key] !== "string"
  ) {
    return Effect.fail(new EdenRequestError({ cause: result.data }));
  }
  return Effect.succeed((result.data as Record<K, string>)[key]);
};

const nameAtom = Atom.make("world");
const messageAtom = Atom.make("hello from eden");

const greetAtom = Atom.fn((name: string) =>
  Effect.tryPromise({
    try: () => client.api.elysia.greet({ name }).get(),
    catch: (cause) => new EdenRequestError({ cause }),
  }).pipe(Effect.flatMap((result) => unwrapEden(result, "greeting"))),
);

const echoAtom = Atom.fn((message: string) =>
  Effect.tryPromise({
    try: () => client.api.elysia.echo.post({ message }),
    catch: (cause) => new EdenRequestError({ cause }),
  }).pipe(Effect.flatMap((result) => unwrapEden(result, "message"))),
);

export default function EdenGreeter() {
  const [name, setName] = useAtom(nameAtom);
  const [message, setMessage] = useAtom(messageAtom);
  const [greetResult, greet] = useAtom(greetAtom);
  const [echoResult, echo] = useAtom(echoAtom);

  return (
    <section className="demo-panel" data-demo="eden-island">
      <p className="eyebrow">Eden type-safe client island</p>
      <h2>Eden type-safe client island</h2>
      <p>
        Calls the Elysia app through <code>@elysiajs/eden</code>'s treaty client, with request
        state managed by <code>effect</code>'s reactive <code>Atom</code> module instead of{" "}
        <code>useState</code> — request/response types are still inferred straight from the
        server route definitions.
      </p>
      <div className="eden-row">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Name"
        />
        <button type="button" onClick={() => greet(name)}>
          GET /greet/:name
        </button>
        {AsyncResult.builder(greetResult)
          .onInitial(() => null)
          .onSuccess((value) => <span data-testid="eden-greeting">{value}</span>)
          .onFailure((cause) => <p className="eden-error">{describeCause(cause)}</p>)
          .render()}
      </div>
      <div className="eden-row">
        <input
          type="text"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          aria-label="Message"
        />
        <button type="button" onClick={() => echo(message)}>
          POST /echo
        </button>
        {AsyncResult.builder(echoResult)
          .onInitial(() => null)
          .onSuccess((value) => <span data-testid="eden-echo">{value || "(empty)"}</span>)
          .onFailure((cause) => <p className="eden-error">{describeCause(cause)}</p>)
          .render()}
      </div>
    </section>
  );
}
