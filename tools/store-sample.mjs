// Sample document for the store screenshots (tools/store-screenshots.mjs): a one-page lesson handout on photosynthesis
// in the interface's language, with headings, formatting, lists, a table, a shape, and a saved conversation with the
// assistant. Written as a real .etex by document.js, as Save would write it.
import { writeFile } from "node:fs/promises";
import "edukors-common-ux/src/package/package.js";
import "edukors-common-ux/src/ai/ui/ai-conversations.js";
import { docFromJSON, media } from "../src/editor/schema.js";
import { fromMarkdown } from "../src/editor/convert.js";

const text = {
  pt: {
    file: "Fotossíntese.etex", title: "Fotossíntese", subtitle: "Ciências · 7º ano · Aula 5",
    md: `Como as plantas transformam **luz**, **água** e **gás carbônico** em alimento, e por que isso importa para toda a vida na Terra.

## Objetivos da aula

- Explicar o que a planta precisa para fazer fotossíntese.
- Identificar o papel da clorofila e das folhas.
- Relacionar a fotossíntese ao oxigênio que respiramos.

## O que entra e o que sai

| Entra na planta | Sai da planta |
| --- | --- |
| Luz do sol | Glicose (alimento) |
| Água, pelas raízes | Oxigênio, pelas folhas |
| Gás carbônico, pelo ar | |

> Quase todo o oxigênio que respiramos foi produzido por plantas e algas.

## Atividade

1. Coloque uma planta no escuro e outra na luz por uma semana.
2. Anote, a cada dois dias, a cor e o tamanho das folhas.
3. Explique a diferença usando as palavras do quadro acima.
`,
    ask: "Escreva uma ficha de uma página sobre fotossíntese para o 7º ano, com objetivos, um quadro do que entra e sai da planta e uma atividade.",
    answer: "Pronto! A ficha tem o título centralizado, três objetivos, um quadro com o que entra e o que sai da planta, uma curiosidade em destaque e uma atividade em três passos. Quer que eu acrescente perguntas de revisão no fim?",
  },
  en: {
    file: "Photosynthesis.etex", title: "Photosynthesis", subtitle: "Science · Grade 7 · Lesson 5",
    md: `How plants turn **light**, **water** and **carbon dioxide** into food, and why it matters for all life on Earth.

## Lesson goals

- Explain what a plant needs to carry out photosynthesis.
- Identify the role of chlorophyll and leaves.
- Connect photosynthesis to the oxygen we breathe.

## What goes in and what comes out

| Into the plant | Out of the plant |
| --- | --- |
| Sunlight | Glucose (food) |
| Water, through the roots | Oxygen, through the leaves |
| Carbon dioxide, from the air | |

> Almost all the oxygen we breathe was made by plants and algae.

## Activity

1. Put one plant in the dark and another in the light for a week.
2. Every two days, note the color and size of the leaves.
3. Explain the difference using the words in the table above.
`,
    ask: "Write a one-page handout on photosynthesis for grade 7, with goals, a table of what goes into and out of the plant, and an activity.",
    answer: "Done! The handout has a centered title, three goals, a table of what goes into and out of the plant, a highlighted fact and a three-step activity. Shall I add review questions at the end?",
  },
  es: {
    file: "Fotosíntesis.etex", title: "Fotosíntesis", subtitle: "Ciencias · 7.º grado · Clase 5",
    md: `Cómo las plantas transforman **luz**, **agua** y **dióxido de carbono** en alimento, y por qué eso importa para toda la vida en la Tierra.

## Objetivos de la clase

- Explicar qué necesita la planta para hacer la fotosíntesis.
- Identificar el papel de la clorofila y de las hojas.
- Relacionar la fotosíntesis con el oxígeno que respiramos.

## Lo que entra y lo que sale

| Entra en la planta | Sale de la planta |
| --- | --- |
| Luz del sol | Glucosa (alimento) |
| Agua, por las raíces | Oxígeno, por las hojas |
| Dióxido de carbono, del aire | |

> Casi todo el oxígeno que respiramos fue producido por plantas y algas.

## Actividad

1. Pon una planta en la oscuridad y otra en la luz durante una semana.
2. Cada dos días, anota el color y el tamaño de las hojas.
3. Explica la diferencia con las palabras del cuadro de arriba.
`,
    ask: "Escribe una ficha de una página sobre la fotosíntesis para 7.º grado, con objetivos, un cuadro de lo que entra y sale de la planta y una actividad.",
    answer: "¡Listo! La ficha tiene el título centrado, tres objetivos, un cuadro con lo que entra y lo que sale de la planta, un dato destacado y una actividad en tres pasos. ¿Agrego preguntas de repaso al final?",
  },
};

const GREEN = "#1e7a46", MUTED = "#5b6475";

/** The sample's file name in the interface's language. */
export const sampleFile = (lang) => text[lang].file;
/** The text the find panel looks for in the screenshots (a word that appears several times). */
export const searchWord = { pt: "planta", en: "plant", es: "planta" };

function sampleDoc(lang) {
  const t = text[lang];
  const body = fromMarkdown(t.md).toJSON().content;
  // Header colors, table fill, and a leaf-green shape beside the fact.
  for (const block of body) {
    if (block.type === "heading") for (const run of block.content ?? []) run.marks = [{ type: "color", attrs: { color: GREEN } }];
    if (block.type === "table") block.content[0].content.forEach((cell) => { cell.attrs = { ...cell.attrs, background: "#e3f2e8" }; });
  }
  const quote = body.findIndex((b) => b.type === "blockquote");
  body.splice(quote, 0, { type: "shape", attrs: { shapeType: "rounded", width: 642, height: 14, fill: "#8cc9a0", lineColor: "transparent", lineWidth: 0, keepRatio: false, align: "center" } });
  return docFromJSON({ type: "doc", content: [
    { type: "heading", attrs: { level: 1, align: "center" }, content: [{ type: "text", text: t.title, marks: [{ type: "color", attrs: { color: GREEN } }, { type: "size", attrs: { size: 30 } }] }] },
    { type: "paragraph", attrs: { align: "center" }, content: [{ type: "text", text: t.subtitle, marks: [{ type: "em" }, { type: "color", attrs: { color: MUTED } }] }] },
    ...body,
  ] }).toJSON();
}

function conversation(lang, accountId) {
  const t = text[lang];
  return { format: 1, id: `store-sample-${lang}`, updated: new Date().toISOString(), accountId, resumeId: null,
    tokens: { input: 0, output: 0, cached: 0, known: false },
    items: [
      { kind: "user", text: t.ask },
      { kind: "tool", tool: "insert_content", state: "ok" },
      { kind: "tool", tool: "set_block_style", state: "ok" },
      { kind: "tool", tool: "format_text", state: "ok" },
      { kind: "tool", tool: "insert_shape", state: "ok" },
      { kind: "assistant", text: t.answer },
    ] };
}

let appDocument;
async function documentScript() {
  if (appDocument) return appDocument;
  // The page's globals the document script uses (as in tests/document.test.mjs), with the sample's conversation.
  globalThis.EdukorsAppConfig ??= { version: "store-sample" };
  globalThis.EdukorsAiAssistant = { conversationsOf: (doc) => doc.conversations ?? [], restoreConversations: () => {} };
  globalThis.EdukorsTextEditor = { toJSON: (doc) => doc.text, check: (json) => docFromJSON(json).toJSON(), adopt: (doc, json) => { doc.text = json; }, media };
  await import("../document.js");
  return (appDocument = globalThis.EdukorsAppDocument);
}

/** Writes the sample .etex to file, its conversation tied to the given AI account. */
export async function writeSample(file, lang, accountId) {
  const D = await documentScript();
  const { bytes } = await D.toBytes({ id: `sample-${lang}`, text: sampleDoc(lang), conversations: [conversation(lang, accountId)] }, { name: text[lang].title });
  await writeFile(file, bytes);
}
