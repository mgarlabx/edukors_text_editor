// What the AI assistant may do in the Text Editor. There are no editing tools yet: the agent reads the document's
// state (an empty list of blocks for now) and answers in the conversation.
EdukorsAiAssistant.configure({
  instructions: 'You are the assistant of the Edukors Text Editor. The text editor itself is not built yet, so you cannot change the document; help the person in the conversation.',
  tools: [],
  context: doc => ({ document: EdukorsTextEditor.toJSON(doc) }),
  documentId: doc => `text-${doc.id}`
});
