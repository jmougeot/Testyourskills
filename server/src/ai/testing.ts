// Client factice pour les tests : rend des réponses préparées et garde les requêtes.

import type { ChatClient, ChatRequest } from "./client";

export type FakeReply =
  | unknown
  | { raw: string }
  | { error: Error }
  | { stop: string; body?: unknown }
  | { toolArgs: unknown };

export function fakeClient(replies: FakeReply[]) {
  const calls: { body: ChatRequest; options?: { signal?: AbortSignal } }[] = [];
  const client: ChatClient = {
    async complete(body, options) {
      calls.push({ body, options });
      const r = replies[Math.min(calls.length - 1, replies.length - 1)];
      if (r && typeof r === "object" && "error" in r) throw (r as { error: Error }).error;
      const usage = { prompt_tokens: 5000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 4000 } };
      if (r && typeof r === "object" && "toolArgs" in r) {
        const args = JSON.stringify((r as { toolArgs: unknown }).toolArgs);
        return {
          choices: [{ message: { content: null, tool_calls: [{ function: { name: "x", arguments: args } }] }, finish_reason: "tool_calls" }],
          usage,
        };
      }
      let text: string;
      let finish = "stop";
      if (r && typeof r === "object" && "raw" in r) text = (r as { raw: string }).raw;
      else if (r && typeof r === "object" && "stop" in r) {
        finish = (r as { stop: string }).stop;
        text = JSON.stringify((r as { body?: unknown }).body ?? {});
      } else text = JSON.stringify(r);
      return { choices: [{ message: { content: text }, finish_reason: finish }], usage };
    },
  };
  return { client, calls };
}

/** Texte du message utilisateur envoyé lors d'un appel. */
export function userText(call: { body: ChatRequest }): string {
  const content = call.body.messages[1].content;
  if (typeof content === "string") return content;
  return content.map((b) => b.text).join("\n");
}
