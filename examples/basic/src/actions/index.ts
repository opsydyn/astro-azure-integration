import { defineAction } from "astro:actions";
import { z } from "astro/zod";

export const server = {
  sampleForm: defineAction({
    accept: "form",
    input: z.object({
      payload: z.string().min(1),
    }),
    handler: async ({ payload }) => {
      return {
        message: `Action received: ${payload}`,
      };
    },
  }),
};

