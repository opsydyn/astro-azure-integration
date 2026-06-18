import { Match as M, Schema as S } from "effect";
import type { Command } from "foldkit";
import type { Document } from "foldkit/html";
import { html } from "foldkit/html";
import { m } from "foldkit/message";

// MODEL

export const Model = S.Struct({ count: S.Number });
export type Model = typeof Model.Type;

// MESSAGE

export const ClickedIncrement = m("ClickedIncrement");

export const Message = S.Union([ClickedIncrement]);
export type Message = typeof Message.Type;

// UPDATE

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      ClickedIncrement: () => [{ count: model.count + 1 }, []],
    }),
  );

// INIT

export const init = (): readonly [Model, ReadonlyArray<Command.Command<Message>>] => [
  { count: 0 },
  [],
];

// VIEW

const h = html<Message>();

export const view = (model: Model): Document => ({
  title: `FoldKit counter: ${model.count}`,
  body: h.section(
    [h.Class("demo-panel"), h.DataAttribute("demo", "foldkit-counter-island")],
    [
      h.p([h.Class("eyebrow")], ["FoldKit client island"]),
      h.h2([], ["FoldKit client island"]),
      h.p(
        [],
        [
          "This component hydrates in the browser via the Elm-architecture runtime from ",
          h.code([], ["foldkit"]),
          ".",
        ],
      ),
      h.button([h.OnClick(ClickedIncrement())], [`Count ${model.count.toString()}`]),
    ],
  ),
});
