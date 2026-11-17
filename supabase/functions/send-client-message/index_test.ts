// Tests de la mise en forme et de l'enveloppe de send-client-message.
// Lancer depuis ce dossier :
//   deno test --node-modules-dir=none --allow-env --allow-net --allow-read index_test.ts
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

Deno.env.set("SEND_CLIENT_MESSAGE_TEST", "1");
const { buildEnvelope, escapeHtml, startOfParisDay, textToHtml } = await import("./index.ts");

Deno.test("HTML échappé, retours à la ligne conservés, liens https cliquables", () => {
  const html = textToHtml("Bonjour <Claire> & co,\nVotre avis : https://g.page/r/abc/review?x=1&y=2.\nhttp://non.fr");
  assertStringIncludes(html, "Bonjour &lt;Claire&gt; &amp; co,<br>\n");
  assertStringIncludes(
    html,
    '<a href="https://g.page/r/abc/review?x=1&amp;y=2">https://g.page/r/abc/review?x=1&amp;y=2</a>.<br>'
  );
  assertStringIncludes(html, "http://non.fr");
  assertEquals(html.includes('href="http://'), false);
});

Deno.test("escapeHtml : guillemets et apostrophes", () => {
  assertEquals(escapeHtml(`"l'avis"`), "&quot;l&#39;avis&quot;");
});

const base = {
  senderFirst: "Louis",
  senderLast: "Ferbos",
  clientEmail: "claire@exemple.fr",
  subject: "Votre recherche avec 18 Avenue",
  fromDomain: "18avenue.fr",
};

Deno.test("commercial sur le domaine : expéditeur à son nom, Reply-To et Bcc", () => {
  const e = buildEnvelope({ ...base, senderEmail: "louis@18Avenue.fr" });
  assertEquals(e.from, '"Louis Ferbos" <louis@18Avenue.fr>');
  assertEquals(e.to, ["claire@exemple.fr"]);
  assertEquals(e.bcc, ["louis@18Avenue.fr"]);
  assertEquals(e.reply_to, "louis@18Avenue.fr");
  assertEquals(e.subject, "Votre recherche avec 18 Avenue");
});

Deno.test("autre domaine : expéditeur des rappels, Reply-To = commercial", () => {
  const e = buildEnvelope({ ...base, senderEmail: "louis@gmail.com" });
  assertEquals(e.from, "Keepintouch <keepintouch@18avenue.fr>");
  assertEquals(e.reply_to, "louis@gmail.com");
  assertEquals(e.bcc, ["louis@gmail.com"]);
});

Deno.test("sous-domaine trompeur refusé", () => {
  const e = buildEnvelope({ ...base, senderEmail: "louis@mail.18avenue.fr.evil.com" });
  assertEquals(e.from, "Keepintouch <keepintouch@18avenue.fr>");
});

Deno.test("DEV : redirection sans Bcc, objet préfixé", () => {
  const e = buildEnvelope({ ...base, senderEmail: "louis@18avenue.fr", redirectTo: "dev@18avenue.fr" });
  assertEquals(e.to, ["dev@18avenue.fr"]);
  assertEquals(e.bcc, []);
  assertEquals(e.subject, "[DEV → claire@exemple.fr] Votre recherche avec 18 Avenue");
});

Deno.test("début de journée à Paris (heure d'hiver et d'été)", () => {
  // 22 h 30 UTC = 23 h 30 à Paris le 15 : la journée a commencé le 14 à 23 h UTC
  assertEquals(startOfParisDay(new Date("2026-11-15T22:30:00Z")), "2026-11-14T23:00:00.000Z");
  // 23 h 30 UTC = 0 h 30 à Paris le 16
  assertEquals(startOfParisDay(new Date("2026-11-15T23:30:00Z")), "2026-11-15T23:00:00.000Z");
  assertEquals(startOfParisDay(new Date("2026-07-01T10:00:00Z")), "2026-06-30T22:00:00.000Z");
});
