import * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import * as Atom from "effect/unstable/reactivity/Atom";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { useAtom } from "@effect/atom-react";
import { client } from "../lib/eden-client";

class EdenRequestError extends Data.TaggedError("EdenRequestError")<{ readonly cause: unknown }> {}

const ErrorMessage = Schema.Struct({ message: Schema.String });

const describeRaw = (cause: unknown): string =>
  Schema.decodeUnknownOption(ErrorMessage)(cause).pipe(
    Option.match({
      onNone: () => JSON.stringify(cause),
      onSome: ({ message }) => message,
    }),
  );

const describeCause = (cause: Cause.Cause<EdenRequestError>): string =>
  Match.value(Cause.squash(cause)).pipe(
    Match.when(Match.instanceOf(EdenRequestError), (error) => describeRaw(error.cause)),
    Match.orElse(describeRaw),
  );

// The Elysia app registers a catch-all onError handler (see elysia-app.ts),
// so Eden widens every route's success type to include that handler's
// return shape too. Decode the expected shape explicitly with Schema
// instead of assuming `data` always matches the success type.
const unwrapEden = <K extends string>(
  result: { data: unknown; error: { value: unknown } | null },
  key: K,
): Effect.Effect<string, EdenRequestError> => {
  const successShape = Schema.Struct({ [key]: Schema.String } as Record<K, typeof Schema.String>) as Schema.Struct<
    Record<K, typeof Schema.String>
  >;
  const isError: Predicate.Refinement<typeof result.error, { value: unknown }> = Predicate.isNotNull;

  return Match.value(result.error).pipe(
    Match.when(isError, (error) => Effect.fail(new EdenRequestError({ cause: error.value }))),
    Match.orElse(() =>
      Schema.decodeUnknownOption(successShape)(result.data).pipe(
        Option.match({
          onNone: () => Effect.fail(new EdenRequestError({ cause: result.data })),
          onSome: (decoded) => Effect.succeed((decoded as unknown as Record<K, string>)[key]),
        }),
      ),
    ),
  );
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
