/** Minimal shape of a Gmail API `messages.get` response we actually read. */
export interface GmailMessagePart {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string };
  parts?: GmailMessagePart[];
}

export interface GmailMessageResource {
  id: string;
  threadId: string;
  labelIds?: string[];
  payload?: GmailMessagePart;
  internalDate?: string;
}

export interface ParsedGmailMessage {
  messageId: string;
  threadId: string;
  from: string | null;
  to: string | null;
  subject: string | null;
  date: string | null;
  inReplyTo: string | null;
  references: string[];
  bodyHtml: string | null;
  bodyPlainText: string | null;
  isFromSentFolder: boolean;
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf-8');
}

function getHeader(headers: { name: string; value: string }[] | undefined, name: string): string | null {
  if (!headers) return null;
  const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? null;
}

/** Extract the email address portion from a header like `"Jane Doe" <jane@example.com>`. */
export function extractEmailAddress(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = headerValue.match(/<([^>]+)>/);
  return (match ? match[1] : headerValue).trim().toLowerCase();
}

/** Extract the display name portion from a header like `"Jane Doe" <jane@example.com>`. */
export function extractDisplayName(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = headerValue.match(/^"?([^"<]*)"?\s*</);
  const name = match?.[1]?.trim();
  return name && name.length > 0 ? name : null;
}

/** Recursively find the first part matching a given MIME type. */
function findBodyPart(part: GmailMessagePart | undefined, mimeType: string): string | null {
  if (!part) return null;

  if (part.mimeType === mimeType && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  if (part.parts) {
    for (const child of part.parts) {
      const found = findBodyPart(child, mimeType);
      if (found) return found;
    }
  }

  return null;
}

/** Parse `References` header (space-separated message-ids) into a clean list. */
function parseReferences(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/\s+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Parse a Gmail `messages.get` response into the fields reply-sync matching needs.
 * `isFromSentFolder` is true when the message carries Gmail's SENT label — used to
 * exclude the account's own outbound mail (including its own manual replies) from matching.
 */
export function parseGmailMessage(message: GmailMessageResource): ParsedGmailMessage {
  const headers = message.payload?.headers;

  return {
    messageId: message.id,
    threadId: message.threadId,
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    subject: getHeader(headers, 'Subject'),
    date: getHeader(headers, 'Date'),
    inReplyTo: getHeader(headers, 'In-Reply-To'),
    references: parseReferences(getHeader(headers, 'References')),
    bodyHtml: findBodyPart(message.payload, 'text/html'),
    bodyPlainText: findBodyPart(message.payload, 'text/plain'),
    isFromSentFolder: (message.labelIds ?? []).includes('SENT'),
  };
}
