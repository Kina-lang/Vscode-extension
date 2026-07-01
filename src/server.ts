import { TextDocument } from "vscode-languageserver-textdocument";
import {
  createConnection,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { KinaSemanticTokenProvider } from "./KinaSemanticTokenProvider";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

const semanticTokensProvider = new KinaSemanticTokenProvider();

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  connection.console.log("Kina LSP initializing…");

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      semanticTokensProvider: semanticTokensProvider.getCapabilities(),
    },
  };
});

connection.languages.semanticTokens.on(async (params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return { data: [] };

  const data = await semanticTokensProvider.getSemanticTokens(doc);

  return data;
});

connection.onInitialized(() => {
  connection.console.log("Kina LSP initialized");
});

documents.listen(connection);
connection.listen();
