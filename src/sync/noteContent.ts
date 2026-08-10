import type { DeltaOp } from '../types';

const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

function ensureTrailingNewline(ops: DeltaOp[]): DeltaOp[] {
	if (ops.length === 0) return ops;
	const last = ops[ops.length - 1];
	if (typeof last.insert !== 'string' || !last.insert.endsWith('\n')) {
		return [...ops, { insert: '\n' }];
	}
	return ops;
}

/**
 * Parse the task note mirror returned by the live API.
 *
 * Current tasks mirror serialized Delta in `task.note`; older tasks can still
 * contain plain text or Markdown links. Preserve plain text and migrate
 * Markdown links to native Delta attributes so a repair sync never drops data.
 */
export function parseTaskNoteOps(content: string): DeltaOp[] {
	if (!content) return [];

	try {
		const parsed = JSON.parse(content) as unknown;
		if (Array.isArray(parsed)) {
			return ensureTrailingNewline(parsed as DeltaOp[]);
		}
	} catch {
		// Legacy plain text is handled below.
	}

	const ops: DeltaOp[] = [];
	let cursor = 0;
	for (const match of content.matchAll(MARKDOWN_LINK)) {
		const index = match.index ?? 0;
		if (index > cursor) {
			ops.push({ insert: content.slice(cursor, index) });
		}
		ops.push({ insert: match[1], attributes: { link: match[2] } });
		cursor = index + match[0].length;
	}
	if (cursor < content.length) {
		ops.push({ insert: content.slice(cursor) });
	}
	if (ops.length === 0) {
		ops.push({ insert: content });
	}

	return ensureTrailingNewline(ops);
}
