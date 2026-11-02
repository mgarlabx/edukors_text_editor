// What the AI assistant may do in the Text Editor: read the document and change it through the editor
// (EdukorsTextEditor.ai, src/editor/ai.js), each change one undo step of the document the conversation belongs to.
// In "review before applying" mode each change waits for the person's approval (Common's assistant panel).
(() => {
  const ed = EdukorsTextEditor;
  const lang = () => document.documentElement.lang;
  // Names of the tools as the conversation shows them.
  const LABELS = {
    read_document: { en: 'Read the document', pt: 'Leu o documento', es: 'Leyó el documento', zh: '读取文档', hi: 'दस्तावेज़ पढ़ा' },
    insert_content: { en: 'Inserted text', pt: 'Inseriu texto', es: 'Insertó texto', zh: '插入文本', hi: 'टेक्स्ट जोड़ा' },
    replace_blocks: { en: 'Replaced paragraphs', pt: 'Substituiu parágrafos', es: 'Reemplazó párrafos', zh: '替换段落', hi: 'अनुच्छेद बदले' },
    set_block_style: { en: 'Changed paragraph style', pt: 'Mudou o estilo do parágrafo', es: 'Cambió el estilo del párrafo', zh: '更改段落样式', hi: 'अनुच्छेद शैली बदली' },
    format_text: { en: 'Formatted text', pt: 'Formatou texto', es: 'Dio formato al texto', zh: '设置文本格式', hi: 'टेक्स्ट स्वरूपित किया' },
    replace_text: { en: 'Replaced text', pt: 'Trocou texto', es: 'Reemplazó texto', zh: '替换文本', hi: 'टेक्स्ट बदला' },
    insert_shape: { en: 'Inserted a shape', pt: 'Inseriu uma forma', es: 'Insertó una forma', zh: '插入形状', hi: 'आकृति जोड़ी' },
    insert_image: { en: 'Inserted a picture', pt: 'Inseriu uma imagem', es: 'Insertó una imagen', zh: '插入图片', hi: 'चित्र जोड़ा' }
  };
  const label = name => () => LABELS[name][lang()] || LABELS[name].en;
  const documentId = d => `text-${d.id}`;

  // Arguments come from the model: their types are checked here; the editor checks their meaning.
  function check(args, schema) {
    if (!args || typeof args !== 'object') throw new Error('Arguments must be an object.');
    for (const key of schema.required || []) if (args[key] === undefined) throw new Error(`Missing "${key}".`);
    for (const [key, value] of Object.entries(args)) {
      const rule = schema.properties[key];
      if (!rule) throw new Error(`Unknown argument "${key}".`);
      const ok = (r, v) => r.anyOf ? r.anyOf.some(x => ok(x, v))
        : r.type === 'string' ? typeof v === 'string' && (!r.enum || r.enum.includes(v)) && (r.maxLength === undefined || v.length <= r.maxLength)
        : r.type === 'integer' ? Number.isInteger(v) && (r.minimum === undefined || v >= r.minimum)
        : r.type === 'number' ? Number.isFinite(v) && (r.minimum === undefined || v >= r.minimum) && (r.maximum === undefined || v <= r.maximum)
        : r.type === 'boolean' ? typeof v === 'boolean' : false;
      if (!ok(rule, value)) throw new Error(`"${key}" has an invalid value.`);
    }
    return args;
  }
  const tool = (name, description, properties, required, run, changes = true) => {
    const inputSchema = { type: 'object', properties, required, additionalProperties: false };
    return { name, description, inputSchema, label: label(name), changes, run: (d, args) => run(d, check(args ?? {}, inputSchema)) };
  };
  const change = name => (d, args) => ed.ai.change(d, name, args);

  const block = { type: 'integer', minimum: 0, description: 'A block number from read_document (0 is the first block).' };
  const at = { anyOf: [{ type: 'string', enum: ['start', 'end'] }, { type: 'integer', minimum: 0 }], description: '"start", "end" (the default), or a block number to insert after.' };
  const occurrence = { anyOf: [{ type: 'string', enum: ['all', 'first'] }, { type: 'integer', minimum: 1 }], description: '"all" (the default), "first", or which occurrence (1 is the first).' };
  const markdown = { type: 'string', maxLength: 200000, description: 'Markdown: # to ### headings, paragraphs, - or 1. lists, > quotes, ``` code blocks, ---, **bold**, *italic*, ~~strikethrough~~, `code`, [links](https://…).' };
  const color = { anyOf: [{ type: 'string', maxLength: 7 }], description: 'A color as #RRGGBB; "" removes it.' };
  const align = { type: 'string', enum: ['left', 'center', 'right', 'justify'] };

  // A picture from a file in the document's folder or an attachment (path), the web (url), or SVG the agent writes.
  async function pictureFrom(d, args) {
    const given = ['path', 'url', 'svg'].filter(key => args[key] !== undefined);
    if (given.length !== 1) throw new Error('Give exactly one of "path", "url", or "svg".');
    let blob;
    if (args.svg !== undefined) {
      if (!/<svg[\s>]/i.test(args.svg)) throw new Error('"svg" must contain an <svg> element.');
      blob = new Blob([args.svg.includes('xmlns') ? args.svg : args.svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')], { type: 'image/svg+xml' });
    } else {
      const file = args.path !== undefined
        ? await EdukorsAiHost.call('workspace.readFile', { documentId: documentId(d), path: args.path })
        : await EdukorsAiHost.call('workspace.fetchUrl', { url: args.url });
      const bytes = Uint8Array.from(atob(file.data), c => c.charCodeAt(0));
      blob = new Blob([bytes], { type: file.mimeType?.startsWith('image/') ? file.mimeType : /\.svg$/i.test(file.name) ? 'image/svg+xml' : file.mimeType });
    }
    const key = ed.media.put(blob);
    if (!key) throw new Error('This is not a picture the editor can show (PNG, JPEG, GIF, WebP, SVG, BMP, or AVIF, up to 50 MB).');
    return key;
  }

  EdukorsAiAssistant.configure({
    instructions: [
      'You are the assistant of the Edukors Text Editor and you can change the document the user has open, with the tools below; do it when the user asks, and change only what they asked.',
      'The document is a list of blocks numbered from 0 (paragraphs, headings 1–3, lists, quotes, code blocks, rules, pictures, shapes). Call read_document first to see the blocks and their numbers; numbers change after you insert or delete blocks, so read again before using them.',
      'To write or rewrite text, use insert_content or replace_blocks with Markdown. To format words without rewriting them (bold, italic, underline, strikethrough, color, size in points, font, link), use format_text with the exact text. For headings, quotes, code, and alignment use set_block_style. To fix words use replace_text.',
      'Pictures: insert_image with a file in your folder (path), a web address (url), or SVG markup you write (svg). Shapes: insert_shape.',
      'Each change appears at once and the user can undo it. Answer briefly, in the language the user writes in.'
    ].join(' '),
    documentId,
    documentPath: d => (d.saved && d.path ? d.path : undefined),
    context: d => { const content = ed.ai.read(d); return content.blocks.length > 300 ? { ...content, blocks: content.blocks.slice(0, 300), more: 'Use read_document for the rest.' } : content; },
    tools: [
      tool('read_document', 'Reads the document as numbered blocks, each with its type, alignment, and Markdown.', {}, [], d => ed.ai.read(d), false),
      tool('insert_content', 'Inserts new blocks written in Markdown at the start, at the end, or after a block.', { markdown, at }, ['markdown'], change('insert_content')),
      tool('replace_blocks', 'Replaces blocks from–to (inclusive) with new Markdown; an empty markdown deletes them.', { from: block, to: block, markdown }, ['from'], change('replace_blocks')),
      tool('set_block_style', 'Changes blocks from–to to a style (paragraph, heading1–3, quote, code) and/or alignment (pictures and shapes: left, center, right).',
        { from: block, to: block, style: { type: 'string', enum: ['paragraph', 'heading1', 'heading2', 'heading3', 'quote', 'code'] }, align }, ['from'], change('set_block_style')),
      tool('format_text', 'Formats every occurrence (or one) of exact text, or whole blocks from–to when no text is given. true or a value applies; false or "" removes.',
        { text: { type: 'string', maxLength: 5000 }, occurrence, from: block, to: block, bold: { type: 'boolean' }, italic: { type: 'boolean' }, underline: { type: 'boolean' }, strike: { type: 'boolean' }, code: { type: 'boolean' },
          color, fontSize: { anyOf: [{ type: 'number', minimum: 1, maximum: 400 }, { type: 'integer', minimum: 0 }], description: 'Points (12 is the normal size); 0 removes.' },
          fontFamily: { type: 'string', maxLength: 80, description: 'For example Arial, Georgia, Times New Roman; "" removes.' },
          link: { type: 'string', maxLength: 2000, description: 'An http, https, or mailto address; "" removes the link.' },
          clear: { type: 'boolean', description: 'Remove all character formatting first.' } }, [], change('format_text')),
      tool('replace_text', 'Replaces exact text (every occurrence, or one) with other text, keeping its formatting; an empty replacement deletes it.',
        { find: { type: 'string', maxLength: 5000 }, replace: { type: 'string', maxLength: 20000 }, occurrence, from: block, to: block }, ['find', 'replace'], change('replace_text')),
      tool('insert_shape', 'Inserts a shape (a block between paragraphs).',
        { shapeType: { type: 'string', enum: EdukorsShapes.types }, at, width: { type: 'number', minimum: 8, maximum: 642, description: 'Pixels; the text is 642 wide.' }, height: { type: 'number', minimum: 8, maximum: 2000 },
          fill: { type: 'string', maxLength: 11, description: '#RRGGBB or "transparent".' }, lineColor: { type: 'string', maxLength: 11 }, lineWidth: { type: 'number', minimum: 0, maximum: 50 },
          lineStyle: { type: 'string', enum: ['solid', 'dashed', 'dotted'] }, opacity: { type: 'number', minimum: 0, maximum: 100 }, shadow: { type: 'boolean' }, align: { type: 'string', enum: ['left', 'center', 'right'] } },
        ['shapeType'], change('insert_shape')),
      tool('insert_image', 'Inserts a picture (PNG, JPEG, GIF, WebP, SVG; animations play). Give one source: path, url, or svg.',
        { path: { type: 'string', maxLength: 1000, description: 'A file in the document\'s folder, or an attached file.' }, url: { type: 'string', maxLength: 2000, description: 'An http or https address of a picture.' },
          svg: { type: 'string', maxLength: 200000, description: 'SVG markup (a full <svg> element).' }, at, width: { type: 'number', minimum: 8, maximum: 642, description: 'Pixels; at most the text width (642).' },
          align: { type: 'string', enum: ['left', 'center', 'right'] }, alt: { type: 'string', maxLength: 500, description: 'What the picture shows.' } },
        [], async (d, a) => { const { path, url, svg, ...rest } = a; return ed.ai.change(d, 'insert_image', { ...rest, key: await pictureFrom(d, { path, url, svg }) }); })
    ]
  });
})();
