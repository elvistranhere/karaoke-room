import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}

export const roomRouter = createTRPCRouter({
  generateCode: publicProcedure.query(() => {
    return { code: generateRoomCode() };
  }),

  validateCode: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => {
      const code = input.code.toUpperCase().trim();
      const valid =
        code.length === CODE_LENGTH &&
        [...code].every((c) => CHARSET.includes(c));
      return { valid, code };
    }),
});
