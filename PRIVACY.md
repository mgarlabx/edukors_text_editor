# Privacy

Edukors Text Editor collects **no data**. It has no telemetry, analytics, crash reporting or account of its own. Your documents stay on your computer, in the `.etex` files you save.

## Connections the app makes

| When | Where | What is sent |
| --- | --- | --- |
| At startup and every few hours | GitHub (`api.github.com`) | A request for the latest release, to offer updates. Not done in the Microsoft Store version, which is updated by the store. |
| Only if you set up an AI account and use the assistant | The AI CLI you chose (Claude Code or Codex), which talks to its own vendor | Your requests and the parts of the document the assistant needs. This is governed by that vendor's terms and privacy policy, under your own account. |
| Only when the assistant downloads a file from the web | The web address requested | An ordinary file request. |
| Only if you add MCP servers to an AI account | The servers you added | What the assistant asks those servers, under their own policies. |
| When you click the logo or a help link | `edukors.org` or GitHub, in your browser | An ordinary page visit. |

The app sends nothing else.

## AI accounts

Sign-in to the AI services is handled entirely by their CLIs, each account in its own folder kept by the shared EDUKORS AI library on this computer (`~/Library/Application Support/EDUKORS` on macOS); your personal `~/.claude` and `~/.codex` are never used. The app does not keep passwords or tokens. Conversations with the assistant are saved inside the `.etex` file, with no account data.

## Contact

Questions about privacy: open an issue at <https://github.com/mgarlabx/edukors_text_editor/issues>.
