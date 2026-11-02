// What makes this app the Text Editor inside the shared shell (Edukors Common, docs/common-shell.md "App integration").
globalThis.EdukorsAppConfig = {
  name: 'Edukors Text Editor',
  version: 'v.26.11.02',            // the release date; package.json holds the same date as 26.11.2
  // Version of the terms of use below. The app asks once per version; change it when the terms change.
  termsVersion: '2026-11-02.2',
  // Insert group of the main toolbar: tables, shapes (Common's catalog), and pictures.
  insert: ['table', 'shape', 'image'],
  // Documents are .etex packages (docs/document-package.md in Common). Export offers these formats in this order (the
  // first is preselected). Open also reads the importFormats (desktop/main.mjs, openExtensions); a PDF gives its text only.
  file: {
    extension: '.etex',
    exportFormats: ['html', 'pdf', 'md', 'txt', 'docx'],
    importFormats: [
      { id: 'docx', extensions: ['.docx'] },
      { id: 'html', extensions: ['.html', '.htm'] },
      { id: 'md', extensions: ['.md', '.markdown'] },
      { id: 'text', extensions: ['.txt'] },
      { id: 'pdf', extensions: ['.pdf'] }
    ],
    // No Import command: Open opens these formats directly (desktop/main.mjs, openExtensions); importFormats stay as the
    // converters Open uses.
    importCommand: false,
    // Files opened in these formats are saved back into themselves (import format → export format). Not PDF: it opens
    // as text only, so writing it back would replace the original with that text; Save asks for an .etex instead.
    saveOriginal: { docx: 'docx', md: 'md', text: 'txt', html: 'html' }
  },
  // Help (Markdown, by interface language; a language without its own text shows English).
  help: {
    quickGuide: {
      en: `# Quick guide

The Edukors Text Editor writes documents laid out like Word's: an A4 page with 20 mm margins. Its own files are **.etex**; it also opens and saves DOCX, Markdown, text, and HTML files.

## Start

- **New** creates an empty document; each document gets a tab, and the dot on a tab means unsaved changes.
- **Open** reads an .etex, DOCX, Markdown, text, PDF, or HTML file. A double-click on an .etex in the Finder or Explorer opens it here too.
- **Recent** lists the documents saved or opened most recently.

## Write and format

- The bar above the page holds the style (paragraph, headings, quote, code), font, size, color, bold, italic, underline, alignment, lists, and links.
- While typing: **# **, **## **, or **### ** start a heading; **- ** a bulleted list; **1. ** a numbered list; **> ** a quote; three backticks a code block.
- In a list, **Tab** and **Shift+Tab** change the level.
- With the cursor in a link, a bubble shows its address; **Cmd+click** (Ctrl+click on Windows and Linux) opens it in the browser.
- Dashed marks show where each PDF page ends; the switch at the end of the bar hides them.

## Insert

- **Table**: pick the rows and columns in the grid. Tab moves between cells; drag a border to change a column's width; the Table menu in the bar adds, deletes, merges, and splits rows and columns.
- **Shape** and **Picture** (PNG, JPEG, GIF, WebP, SVG, BMP, AVIF): select one to resize it, align it, and, for shapes, change line, fill, shadow, and opacity.

## Save and export

- **Save** (Cmd+S) writes an .etex; **Shift+Cmd+S** saves under another name or folder.
- A DOCX, Markdown, text, or HTML file is saved back into itself. The first Save asks, because what the editor does not support is lost (in a DOCX: colors, fonts, and sizes). A PDF opens as text only: Save asks where to save an .etex.
- In a Markdown file, the **Markdown source** switch shows and edits the file's own text.
- **Export** makes an HTML page, a PDF (A4), Markdown, plain text, or a Word DOCX. **Show in folder** opens the document's folder.

## AI assistant

Connect an account in **Settings → AI assistant** (Claude Code or Codex, installed on the computer). Then ask the assistant in its panel to write, rewrite, format, or illustrate the document. With **Review before applying**, each change waits for your approval; every change can be undone.

## Shortcuts

| Action | macOS | Windows and Linux |
| --- | --- | --- |
| Save, Save as | Cmd+S, Shift+Cmd+S | Ctrl+S, Shift+Ctrl+S |
| Undo, Redo | Cmd+Z, Shift+Cmd+Z | Ctrl+Z, Ctrl+Y |
| Bold, Italic, Underline | Cmd+B, Cmd+I, Cmd+U | Ctrl+B, Ctrl+I, Ctrl+U |
| Strikethrough, Inline code | Shift+Cmd+X, Cmd+E | Shift+Ctrl+X, Ctrl+E |
| Paragraph, Heading 1–3 | Option+Cmd+0, Option+Cmd+1–3 | Alt+Ctrl+0, Alt+Ctrl+1–3 |
| Close tab | Cmd+W | Ctrl+W |`,
      pt: `# Guia rápido

O Edukors Text Editor escreve documentos com a página do Word: A4, margens de 20 mm. Os arquivos próprios dele são **.etex**; ele também abre e salva arquivos DOCX, Markdown, texto e HTML.

## Começar

- **Novo** cria um documento vazio; cada documento fica numa aba, e o ponto na aba indica alterações não salvas.
- **Abrir** lê um arquivo .etex, DOCX, Markdown, texto, PDF ou HTML. Um duplo clique num .etex no Finder ou no Explorer também o abre aqui.
- **Recentes** lista os documentos salvos ou abertos mais recentemente.

## Escrever e formatar

- A barra acima da página tem o estilo (parágrafo, títulos, citação, código), fonte, tamanho, cor, negrito, itálico, sublinhado, alinhamento, listas e links.
- Enquanto digita: **# **, **## ** ou **### ** começam um título; **- ** uma lista com marcadores; **1. ** uma lista numerada; **> ** uma citação; três crases um bloco de código.
- Numa lista, **Tab** e **Shift+Tab** mudam o nível.
- Com o cursor num link, um balão mostra o endereço; **Cmd+clique** (Ctrl+clique no Windows e no Linux) abre o link no navegador.
- Marcas tracejadas mostram onde termina cada página do PDF; a chave no fim da barra as esconde.

## Inserir

- **Tabela**: escolha linhas e colunas na grade. Tab passa de uma célula a outra; arrastar uma borda muda a largura da coluna; o menu Tabela da barra acrescenta, exclui, mescla e divide linhas e colunas.
- **Forma** e **Imagem** (PNG, JPEG, GIF, WebP, SVG, BMP, AVIF): selecione para redimensionar, alinhar e, nas formas, mudar linha, preenchimento, sombra e opacidade.

## Salvar e exportar

- **Salvar** (Cmd+S) grava um .etex; **Shift+Cmd+S** salva com outro nome ou em outra pasta.
- Um arquivo DOCX, Markdown, texto ou HTML é salvo nele mesmo. O primeiro Salvar pergunta antes, porque o que o editor não suporta se perde (num DOCX: cores, fontes e tamanhos). Um PDF abre só como texto: Salvar pergunta onde salvar um .etex.
- Num arquivo Markdown, a chave **Fonte Markdown** mostra e edita o texto do próprio arquivo.
- **Exportar** gera uma página HTML, um PDF (A4), Markdown, texto simples ou um DOCX do Word. **Mostrar na pasta** abre a pasta do documento.

## Assistente de IA

Conecte uma conta em **Configurações → Assistente de IA** (Claude Code ou Codex, instalados no computador). Depois, peça no painel do assistente para escrever, reescrever, formatar ou ilustrar o documento. Com **Revisar antes de aplicar**, cada alteração espera sua aprovação; toda alteração pode ser desfeita.

## Atalhos

| Ação | macOS | Windows e Linux |
| --- | --- | --- |
| Salvar, Salvar como | Cmd+S, Shift+Cmd+S | Ctrl+S, Shift+Ctrl+S |
| Desfazer, Refazer | Cmd+Z, Shift+Cmd+Z | Ctrl+Z, Ctrl+Y |
| Negrito, Itálico, Sublinhado | Cmd+B, Cmd+I, Cmd+U | Ctrl+B, Ctrl+I, Ctrl+U |
| Tachado, Código | Shift+Cmd+X, Cmd+E | Shift+Ctrl+X, Ctrl+E |
| Parágrafo, Título 1–3 | Option+Cmd+0, Option+Cmd+1–3 | Alt+Ctrl+0, Alt+Ctrl+1–3 |
| Fechar aba | Cmd+W | Ctrl+W |`,
      es: `# Guía rápida

Edukors Text Editor escribe documentos con la página de Word: A4, márgenes de 20 mm. Sus archivos propios son **.etex**; también abre y guarda archivos DOCX, Markdown, texto y HTML.

## Empezar

- **Nuevo** crea un documento vacío; cada documento ocupa una pestaña, y el punto en la pestaña indica cambios sin guardar.
- **Abrir** lee un archivo .etex, DOCX, Markdown, texto, PDF o HTML. Un doble clic en un .etex en el Finder o el Explorador también lo abre aquí.
- **Recientes** lista los documentos guardados o abiertos más recientemente.

## Escribir y dar formato

- La barra sobre la página tiene el estilo (párrafo, títulos, cita, código), fuente, tamaño, color, negrita, cursiva, subrayado, alineación, listas y enlaces.
- Al escribir: **# **, **## ** o **### ** empiezan un título; **- ** una lista con viñetas; **1. ** una lista numerada; **> ** una cita; tres acentos graves un bloque de código.
- En una lista, **Tab** y **Shift+Tab** cambian el nivel.
- Con el cursor en un enlace, un globo muestra su dirección; **Cmd+clic** (Ctrl+clic en Windows y Linux) lo abre en el navegador.
- Marcas discontinuas muestran dónde termina cada página del PDF; el interruptor al final de la barra las oculta.

## Insertar

- **Tabla**: elija filas y columnas en la cuadrícula. Tab pasa de una celda a otra; arrastrar un borde cambia el ancho de la columna; el menú Tabla de la barra agrega, elimina, combina y divide filas y columnas.
- **Forma** e **Imagen** (PNG, JPEG, GIF, WebP, SVG, BMP, AVIF): selecciónela para cambiar su tamaño, alinearla y, en las formas, cambiar línea, relleno, sombra y opacidad.

## Guardar y exportar

- **Guardar** (Cmd+S) escribe un .etex; **Shift+Cmd+S** guarda con otro nombre o en otra carpeta.
- Un archivo DOCX, Markdown, texto o HTML se guarda en sí mismo. El primer Guardar pregunta antes, porque lo que el editor no admite se pierde (en un DOCX: colores, fuentes y tamaños). Un PDF se abre solo como texto: Guardar pregunta dónde guardar un .etex.
- En un archivo Markdown, el interruptor **Código Markdown** muestra y edita el texto del propio archivo.
- **Exportar** genera una página HTML, un PDF (A4), Markdown, texto sin formato o un DOCX de Word. **Mostrar en la carpeta** abre la carpeta del documento.

## Asistente de IA

Conecte una cuenta en **Configuración → Asistente de IA** (Claude Code o Codex, instalados en la computadora). Luego, pida en el panel del asistente que escriba, reescriba, dé formato o ilustre el documento. Con **Revisar antes de aplicar**, cada cambio espera su aprobación; todo cambio se puede deshacer.

## Atajos

| Acción | macOS | Windows y Linux |
| --- | --- | --- |
| Guardar, Guardar como | Cmd+S, Shift+Cmd+S | Ctrl+S, Shift+Ctrl+S |
| Deshacer, Rehacer | Cmd+Z, Shift+Cmd+Z | Ctrl+Z, Ctrl+Y |
| Negrita, Cursiva, Subrayado | Cmd+B, Cmd+I, Cmd+U | Ctrl+B, Ctrl+I, Ctrl+U |
| Tachado, Código | Shift+Cmd+X, Cmd+E | Shift+Ctrl+X, Ctrl+E |
| Párrafo, Título 1–3 | Option+Cmd+0, Option+Cmd+1–3 | Alt+Ctrl+0, Alt+Ctrl+1–3 |
| Cerrar pestaña | Cmd+W | Ctrl+W |`
    },
    termsOfUse: {
      en: `# Terms of use

The Edukors Text Editor is free software, distributed under the **MIT license**. To use it, you must accept these terms, which summarize what the license allows and what it does not offer.

## What you can do

- Use the editor free of charge, for any purpose, including commercial use.
- Copy, modify, combine with other programs, publish, distribute, sublicense, and sell copies of the software.
- The license covers the software. It claims no rights over the documents you create with it.

## Free and without support

The editor is free. There is no technical support, help desk, deadline for fixing errors, or commitment to new versions.

## No warranty

The software is provided "as is", without warranty of any kind, express or implied, including merchantability, fitness for a particular purpose, and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability arising from the software or its use. Keep copies of your documents, especially before saving a DOCX, Markdown, text, or HTML file back into itself: what the editor does not support is lost.

## Your documents and third-party services

Your documents stay on your computer; the editor sends them nowhere on its own. Two features use the internet:

- The **AI assistant** uses the account you connect in Settings → AI assistant. What you ask and the content of the document it works on go to that service. Its use follows that service's terms, and any costs are yours.
- The editor checks the project's page on GitHub for new versions.

## Source code

The source code is available at [github.com/mgarlabx/edukors_text_editor](https://github.com/mgarlabx/edukors_text_editor).

## License text

> MIT License
>
> Copyright (c) 2026 Edukors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`,
      pt: `# Termos de uso

O Edukors Text Editor é um software livre, distribuído sob a **licença MIT**. Para usá-lo, é preciso aceitar estes termos, que resumem o que a licença permite e o que ela não oferece.

## O que você pode fazer

- Usar o editor gratuitamente, para qualquer finalidade, inclusive comercial.
- Copiar, modificar, combinar com outros programas, publicar, distribuir, sublicenciar e vender cópias do software.
- A licença trata do software. Ela não reivindica nenhum direito sobre os documentos que você cria com ele.

## Gratuito e sem suporte

O editor é gratuito. Não há suporte técnico, atendimento, prazo de correção de erros nem compromisso de novas versões.

## Sem garantia

O software é fornecido "no estado em que se encontra", sem garantia de nenhum tipo, expressa ou implícita, inclusive de comercialização, de adequação a um fim específico e de não violação de direitos. Em nenhuma hipótese os autores ou titulares dos direitos respondem por reclamações, danos ou outras responsabilidades decorrentes do software ou do seu uso. Guarde cópias dos seus documentos, principalmente antes de salvar um arquivo DOCX, Markdown, texto ou HTML nele mesmo: o que o editor não suporta se perde.

## Seus documentos e serviços de terceiros

Seus documentos ficam no seu computador; o editor não os envia a lugar nenhum por conta própria. Dois recursos usam a internet:

- O **assistente de IA** usa a conta que você conecta em Configurações → Assistente de IA. O que você pede e o conteúdo do documento em que ele trabalha vão para esse serviço. O uso segue os termos do serviço, e os custos ficam com você.
- O editor consulta a página do projeto no GitHub para saber de novas versões.

## Código-fonte

O código-fonte está disponível em [github.com/mgarlabx/edukors_text_editor](https://github.com/mgarlabx/edukors_text_editor).

## Texto da licença

O texto que vale é o original, em inglês:

> MIT License
>
> Copyright (c) 2026 Edukors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`,
      es: `# Términos de uso

Edukors Text Editor es software libre, distribuido bajo la **licencia MIT**. Para usarlo, es necesario aceptar estos términos, que resumen lo que la licencia permite y lo que no ofrece.

## Lo que puede hacer

- Usar el editor gratuitamente, para cualquier fin, incluso comercial.
- Copiar, modificar, combinar con otros programas, publicar, distribuir, sublicenciar y vender copias del software.
- La licencia trata del software. No reclama ningún derecho sobre los documentos que usted crea con él.

## Gratuito y sin soporte

El editor es gratuito. No hay soporte técnico, atención, plazo para corregir errores ni compromiso de nuevas versiones.

## Sin garantía

El software se proporciona "tal cual", sin garantía de ningún tipo, expresa o implícita, incluidas las de comerciabilidad, idoneidad para un fin determinado y no infracción. En ningún caso los autores o titulares de los derechos serán responsables de reclamaciones, daños u otras responsabilidades derivadas del software o de su uso. Guarde copias de sus documentos, sobre todo antes de guardar un archivo DOCX, Markdown, texto o HTML en sí mismo: lo que el editor no admite se pierde.

## Sus documentos y servicios de terceros

Sus documentos se quedan en su computadora; el editor no los envía a ningún lugar por su cuenta. Dos funciones usan internet:

- El **asistente de IA** usa la cuenta que usted conecta en Configuración → Asistente de IA. Lo que usted pide y el contenido del documento en el que trabaja van a ese servicio. Su uso sigue los términos de ese servicio, y los costos corren por su cuenta.
- El editor consulta la página del proyecto en GitHub para saber de nuevas versiones.

## Código fuente

El código fuente está disponible en [github.com/mgarlabx/edukors_text_editor](https://github.com/mgarlabx/edukors_text_editor).

## Texto de la licencia

El texto que vale es el original, en inglés:

> MIT License
>
> Copyright (c) 2026 Edukors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`
    }
  }
};
