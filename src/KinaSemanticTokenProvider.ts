import {
  BaseToken,
  CommentToken,
  KinaLexer,
  TokenKind,
} from "@kina-lang/lexer";
import { TextDocument } from "vscode-languageserver-textdocument";

const TOKEN_TYPES = [
  "keyword",
  "variable",
  "type",
  "number",
  "string",
  "macro",
  "comment",
];

export enum EKinaSemanticTokenType {
  Keyword = 0,
  Variable = 1,
  Type = 2,
  Number = 3,
  String = 4,
  Macro = 5,
  Comment = 6,
}

export class KinaSemanticTokenProvider {
  private readonly lexer: KinaLexer = new KinaLexer({
    // TODO: Read that from the parsed document
    fileName: "anonymous",
    rootDir: "/anonymous",
    skipUnknownTokens: true,
  });

  private static readonly TOKEN_TYPE_MAP: {
    [key in TokenKind]: EKinaSemanticTokenType | -1;
  } = {
    [TokenKind.KeywordFunction]: EKinaSemanticTokenType.Keyword,
    [TokenKind.KeywordReturn]: EKinaSemanticTokenType.Keyword,
    [TokenKind.KeywordExtern]: EKinaSemanticTokenType.Keyword,
    [TokenKind.KeywordVariable]: EKinaSemanticTokenType.Keyword,
    [TokenKind.KeywordMutable]: EKinaSemanticTokenType.Keyword,
    [TokenKind.DirectiveInclude]: EKinaSemanticTokenType.Macro,
    [TokenKind.Identifier]: EKinaSemanticTokenType.Variable,
    [TokenKind.TypeVoid]: EKinaSemanticTokenType.Type,
    [TokenKind.TypeInt]: EKinaSemanticTokenType.Type,
    [TokenKind.TypeBool]: EKinaSemanticTokenType.Type,
    [TokenKind.Comment]: EKinaSemanticTokenType.Comment,
    [TokenKind.LiteralBoolean]: EKinaSemanticTokenType.Keyword,
    [TokenKind.LiteralInteger]: EKinaSemanticTokenType.Number,
    [TokenKind.LiteralFloat]: EKinaSemanticTokenType.Number,
    [TokenKind.LiteralString]: EKinaSemanticTokenType.String,
    [TokenKind.OperatorAssign]: -1,
    [TokenKind.BraceClose]: -1,
    [TokenKind.BraceOpen]: -1,
    [TokenKind.ParentheseOpen]: -1,
    [TokenKind.ParentheseClose]: -1,
    [TokenKind.BracketOpen]: -1,
    [TokenKind.BracketClose]: -1,
    [TokenKind.Colon]: -1,
    [TokenKind.Semicolon]: -1,
    [TokenKind.Comma]: -1,
    [TokenKind.Dot]: -1,
    [TokenKind.Newline]: -1,
    [TokenKind.Whitespace]: -1,
    [TokenKind.EOF]: -1,
  };

  constructor() {}

  public getCapabilities() {
    return {
      legend: {
        tokenTypes: TOKEN_TYPES,
        tokenModifiers: [],
      },
      full: true,
    };
  }

  // TODO: Make this only lex relevant parts of the document, we dont need to lex
  // the entire document on every key stroke, we can just lex the current line and maybe a few lines before and after it.
  public async getSemanticTokens(document: TextDocument) {
    const content = document.getText();
    let tokens: BaseToken[] = [];
    try {
      tokens = this.lexer.tokenize(content);
    } catch (e) {
      console.error("Error while lexing document:", e);
    }

    // Filter out tokens that don't map to a valid semantic token type (i.e. map to -1)
    const filteredTokens = tokens.filter((token) => {
      const type = KinaSemanticTokenProvider.TOKEN_TYPE_MAP[token.kind];
      return type !== undefined && type !== -1;
    });

    let lastLine = 0;
    let lastChar = 0;

    const data: number[] = [];

    for (const token of filteredTokens) {
      const startLine = (token.span?.start.line ?? 0) - 1;
      const startChar = (token.span?.start.column ?? 0) - 1;
      const endLine = (token.span?.end.line ?? 0) - 1;
      const endChar = (token.span?.end.column ?? 0) - 1;

      const lineDelta = startLine - lastLine;
      const charDelta = lineDelta === 0 ? startChar - lastChar : startChar;
      const tokenLength = endChar - startChar;

      if (startLine === endLine) {
        data.push(lineDelta);
        data.push(charDelta);
        data.push(tokenLength);
        data.push(KinaSemanticTokenProvider.TOKEN_TYPE_MAP[token.kind]);
        data.push(0); // No modifiers

        lastLine = startLine;
        lastChar = startChar;
      } else {
        const multilineTokens = this.parseMultilineToken(
          token,
          lastLine,
          lastChar,
        );

        data.push(...multilineTokens.data);

        lastLine = multilineTokens.lastLine;
        lastChar = multilineTokens.lastChar;
      }
    }

    return { data };
  }

  private parseMultilineToken(
    token: BaseToken,
    lastLine: number,
    lastChar: number,
  ): { data: number[]; lastLine: number; lastChar: number } {
    const index = KinaSemanticTokenProvider.TOKEN_TYPE_MAP[token.kind];

    const startLine = (token.span?.start.line ?? 0) - 1;
    const startChar = (token.span?.start.column ?? 0) - 1;
    const endLine = (token.span?.end.line ?? 0) - 1;
    const endChar = (token.span?.end.column ?? 0) - 1;

    const tokenValueLines = (token as any).value.split("\n");
    const lines: number[][] = [];

    let currentLastChar = lastChar;
    for (let line = startLine; line <= endLine; line++) {
      const content = tokenValueLines[line - startLine];
      const lineDelta = line - lastLine;
      const charDelta =
        line === startLine
          ? lineDelta === 0
            ? startChar - currentLastChar
            : startChar
          : 0;
      const tokenLength = content.length;

      lines.push([
        lineDelta,
        charDelta,
        tokenLength,
        index,
        0, // No modifiers
      ]);

      lastLine = line;
      currentLastChar = line === startLine ? startChar : 0;
    }

    return { data: lines.flat(), lastLine: endLine, lastChar: currentLastChar };
  }
}
