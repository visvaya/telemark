// Rules of the documentation link check: every relative Markdown link and every backticked path that starts
// with a directory of the repository must name something that exists. Pure functions: scripts/check-doc-links.mjs
// lists the documents and answers whether a path exists.
//
// A document is { file, text } with a repository-relative path that uses forward slashes. A problem is a
// string "file:line: message".
import { posix } from "node:path";

/**
 * An inline Markdown link or image, [text](target) or ![alt](target), with an optional title after the target in
 * double quotes, single quotes or parentheses, where a backslash escapes the closing character.
 */
const LINK = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.)*\)))?\)/g;
/**
 * A code span: a run of backticks up to the next run of the same length. A link written inside one is an example,
 * not a link. Backticks without such a closing run are text, and so is a backtick after an odd number of
 * backslashes, which escape it.
 */
const CODE_SPAN = /(?<!(?<!\\)\\(?:\\\\)*)(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)/g;
/** A backticked token without white space. */
const BACKTICKED = /`([^`\s]+)`/g;
/** A scheme (https:, mailto:) marks an address, not a file of the repository. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** Globs and placeholders name a family of files, not one path. */
const PATTERN_CHARACTERS = /[*?<>{}[\]$]/;
/** A line that opens or closes a fenced code block: the fence and what follows it. */
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;

/** The path inside a backticked token: without a line number or the punctuation of the sentence around it. */
function pathOfToken(token) {
  return token
    .replace(/[,;.)]+$/, "")
    .replace(/:\d+(-\d+)?$/, "")
    .replace(/\/+$/, "");
}

/** The repository path a relative link points to, or null for an address or an anchor in the same document. */
function pathOfLink(file, target) {
  if (SCHEME.test(target) || target.startsWith("#") === true) return null;
  const withoutSuffix = target.replace(/[?#].*$/, "");
  const path = posix.normalize(posix.join(posix.dirname(file), decodeURIComponent(withoutSuffix)));
  return path.replace(/\/+$/, "");
}

/** A fence closes a block opened by `opening` when it uses the same character, is no shorter and has no text after it. */
const closesFence = (opening, fence, rest) =>
  fence[0] === opening[0] && fence.length >= opening.length && rest.trim() === "";

/** The lines of a document outside fenced code blocks, with their numbers. */
function proseLines(text) {
  let opening = null;
  return text.split("\n").flatMap((content, index) => {
    const match = FENCE.exec(content);
    if (match === null) return opening === null ? [{ line: index + 1, content }] : [];
    const [, fence, rest] = match;
    if (opening === null) opening = fence;
    else if (closesFence(opening, fence, rest)) opening = null;
    return [];
  });
}

function lineProblems(file, { line, content }, { exists, roots }) {
  // A code span becomes a space, not nothing, so that [x]`a`(b.md) does not join into a link.
  const links = [...content.replaceAll(CODE_SPAN, " ").matchAll(LINK)].flatMap(([, target]) => {
    const path = pathOfLink(file, target);
    return path === null || exists(path) === true ? [] : [`${file}:${line}: link \`${target}\` does not exist`];
  });
  const paths = [...content.matchAll(BACKTICKED)].flatMap(([, token]) => {
    const path = pathOfToken(token);
    const isRepositoryPath = roots.includes(path.split("/")[0]) === true && !PATTERN_CHARACTERS.test(path);
    return !isRepositoryPath || exists(path) === true ? [] : [`${file}:${line}: \`${path}\` does not exist`];
  });
  return [...links, ...paths];
}

/**
 * The dead references of the documents, in document and line order. `roots` are the top-level directories of
 * the repository: a backticked token counts as a path only when it starts with one of them.
 */
export function findDocLinkProblems(docs, facts) {
  return docs.flatMap(({ file, text }) => proseLines(text).flatMap((line) => lineProblems(file, line, facts)));
}
