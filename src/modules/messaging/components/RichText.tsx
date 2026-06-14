import { Fragment, type ReactNode } from "react";

/**
 * Renders a plain-text message body with lightweight, SAFE inline formatting -
 * the marks the composer's toolbar inserts (5A.3). This is the Slack/WhatsApp
 * pattern: the body stays plain text (`**hi**` is just characters), and we turn
 * the marks into React elements here. We never use dangerouslySetInnerHTML, so
 * there is no HTML-injection surface - text runs are React strings (auto-escaped)
 * and only these specific marks become elements:
 *   **bold**  _italic_  ++underline++  ~~strike~~  [text](url)
 * Links are restricted to http(s) (or a bare domain we prefix); anything else
 * falls back to literal text. Newlines render via `whitespace-pre-line` on the
 * container, so we don't touch them here.
 */
const TOKEN =
  /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|~~([^~]+)~~|\+\+([^+]+)\+\+|_([^_]+)_/g;

/** Allow only http(s) links, or a bare domain we upgrade to https. Else null. */
function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(url)) return `https://${url}`;
  return null;
}

export function RichText({ body }: { body: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;

  while ((m = TOKEN.exec(body)) !== null) {
    if (m.index > last) nodes.push(body.slice(last, m.index));

    if (m[1] !== undefined) {
      const href = safeUrl(m[2]);
      nodes.push(
        href ? (
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {m[1]}
          </a>
        ) : (
          m[0]
        ),
      );
    } else if (m[3] !== undefined) {
      nodes.push(<strong key={key++}>{m[3]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(<s key={key++}>{m[4]}</s>);
    } else if (m[5] !== undefined) {
      nodes.push(<u key={key++}>{m[5]}</u>);
    } else if (m[6] !== undefined) {
      nodes.push(<em key={key++}>{m[6]}</em>);
    }

    last = m.index + m[0].length;
  }
  if (last < body.length) nodes.push(body.slice(last));

  return <Fragment>{nodes}</Fragment>;
}
