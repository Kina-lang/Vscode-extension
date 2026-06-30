import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import { KinaLexer, EKinaLexerTokenKind } from "@kina-lang/lexer";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Intercept all standard console output methods and redirect them through the LSP connection console.
// This prevents console.log statements inside @kina-lang/lexer (which uses KinaLogger) from writing
// directly to stdout and corrupting the stdio JSON-RPC stream.
const formatConsoleArgs = (args: any[]): string => {
  return args
    .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
    .join(" ");
};
console.log = (...args: any[]) =>
  connection.console.log(formatConsoleArgs(args));
console.error = (...args: any[]) =>
  connection.console.error(formatConsoleArgs(args));
console.warn = (...args: any[]) =>
  connection.console.warn(formatConsoleArgs(args));
console.info = (...args: any[]) =>
  connection.console.info(formatConsoleArgs(args));

const tokenTypes = ["keyword", "variable", "type", "number", "string", "macro"];
const tokenModifiers: string[] = [];

const tokenTypeMap: Record<EKinaLexerTokenKind, number> = {
  [EKinaLexerTokenKind.KeywordFunction]: 0,
  [EKinaLexerTokenKind.KeywordReturn]: 0,
  [EKinaLexerTokenKind.KeywordExtern]: 0,
  [EKinaLexerTokenKind.DirectiveInclude]: 5,
  [EKinaLexerTokenKind.Identifier]: 1,
  [EKinaLexerTokenKind.TypeInt32]: 2,
  [EKinaLexerTokenKind.TypeBool]: 2,
  [EKinaLexerTokenKind.TypeString]: 2,
  [EKinaLexerTokenKind.LiteralInt]: 3,
  [EKinaLexerTokenKind.LiteralFloat]: 3,
  [EKinaLexerTokenKind.LiteralBool]: 0,
  [EKinaLexerTokenKind.LiteralString]: 4,

  // Ignore punctuators and EOF from semantic token representation
  [EKinaLexerTokenKind.ParentheseOpen]: -1,
  [EKinaLexerTokenKind.ParentheseClose]: -1,
  [EKinaLexerTokenKind.BracketOpen]: -1,
  [EKinaLexerTokenKind.BracketClose]: -1,
  [EKinaLexerTokenKind.BraceOpen]: -1,
  [EKinaLexerTokenKind.BraceClose]: -1,
  [EKinaLexerTokenKind.Colon]: -1,
  [EKinaLexerTokenKind.Semicolon]: -1,
  [EKinaLexerTokenKind.Comma]: -1,
  [EKinaLexerTokenKind.Dot]: -1,
  [EKinaLexerTokenKind.EOF]: -1,
};

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  connection.console.log("Kina language server initializing…");

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      semanticTokensProvider: {
        legend: {
          tokenTypes,
          tokenModifiers,
        },
        full: true,
      },
    },
  };
});

const lexer = new KinaLexer();

connection.languages.semanticTokens.on(async (params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return { data: [] };

  const content = doc.getText();
  try {
    const tokens = await lexer.process(params.textDocument.uri, content);
    const data: number[] = [];

    let lastLine = 0;
    let lastChar = 0;

    for (const token of tokens) {
      const typeIndex = tokenTypeMap[token.kind];
      if (typeIndex === undefined || typeIndex === -1) continue;

      const line = token.line;
      const char = token.col;

      const deltaLine = line - lastLine;
      const deltaChar = deltaLine === 0 ? char - lastChar : char;

      data.push(
        deltaLine,
        deltaChar,
        token.len,
        typeIndex,
        0, // tokenModifiers
      );

      lastLine = line;
      lastChar = char;
    }

    return { data };
  } catch (err) {
    connection.console.error(`Lexer failed to process document: ${err}`);
    return { data: [] };
  }
});

connection.onInitialized(() => {
  connection.console.log("Kina language server initialized.");
});

documents.listen(connection);
connection.listen();
