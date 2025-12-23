import { requestUrl, RequestUrlParam } from 'obsidian';
import type {
	SingularityTask,
	SingularityTag,
	SingularityNote,
	KanbanStatus,
	TaskKanbanStatus,
	DeltaOp,
} from '../types';

const API_BASE_URL = 'https://api.singularity-app.com';

export class SingularityAPI {
	private token: string;

	constructor(token: string) {
		this.token = token;
	}

	setToken(token: string): void {
		this.token = token;
	}

	private async request<T>(
		endpoint: string,
		method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
		body?: unknown
	): Promise<T> {
		if (!this.token) {
			throw new Error('Singularity API token not configured');
		}

		const params: RequestUrlParam = {
			url: `${API_BASE_URL}${endpoint}`,
			method,
			headers: {
				Authorization: `Bearer ${this.token}`,
				'Content-Type': 'application/json',
			},
		};

		if (body) {
			params.body = JSON.stringify(body);
		}

		const response = await requestUrl(params);

		if (response.status >= 400) {
			throw new Error(`Singularity API error: ${response.status} ${response.text}`);
		}

		return response.json as T;
	}

	/**
	 * Normalize API response - extract array from wrapper if needed
	 */
	private normalizeArrayResponse<T>(response: unknown): T[] {
		if (Array.isArray(response)) {
			return response as T[];
		}
		// Handle wrapped responses from Singularity API
		if (response && typeof response === 'object') {
			const obj = response as Record<string, unknown>;
			// Singularity API specific keys
			if (Array.isArray(obj.tags)) return obj.tags as T[];
			if (Array.isArray(obj.kanbanStatuses)) return obj.kanbanStatuses as T[];
			if (Array.isArray(obj.kanbanTaskStatuses)) return obj.kanbanTaskStatuses as T[];
			// Generic keys
			if (Array.isArray(obj.data)) return obj.data as T[];
			if (Array.isArray(obj.items)) return obj.items as T[];
			if (Array.isArray(obj.results)) return obj.results as T[];
		}
		console.warn('[Singularity] Unexpected API response format:', response);
		return [];
	}

	/**
	 * Get task by ID
	 */
	async getTask(taskId: string): Promise<SingularityTask> {
		return this.request<SingularityTask>(`/v2/task/${taskId}`);
	}

	/**
	 * Get note content by note ID
	 */
	async getNote(noteId: string): Promise<SingularityNote> {
		return this.request<SingularityNote>(`/v2/note/${noteId}`);
	}

	/**
	 * Update task note with Delta operations
	 * @param taskId - Task ID (T-{uuid})
	 * @param deltaOps - Array of Delta operations (NOT wrapped in {ops: ...})
	 */
	async updateTaskNote(taskId: string, deltaOps: DeltaOp[]): Promise<SingularityTask> {
		return this.request<SingularityTask>(`/v2/task/${taskId}`, 'PATCH', {
			note: JSON.stringify(deltaOps),
		});
	}

	/**
	 * Get kanban statuses for a project
	 */
	async getKanbanStatuses(projectId: string): Promise<KanbanStatus[]> {
		const response = await this.request<unknown>(`/v2/kanban-status?projectId=${projectId}`);
		return this.normalizeArrayResponse<KanbanStatus>(response);
	}

	/**
	 * Get kanban status for a specific task
	 * Returns empty array if task is in "Backlog" (TODO)
	 */
	async getTaskKanbanStatus(taskId: string): Promise<TaskKanbanStatus[]> {
		const response = await this.request<unknown>(`/v2/kanban-task-status?taskId=${taskId}`);
		return this.normalizeArrayResponse<TaskKanbanStatus>(response);
	}

	/**
	 * Get all tags
	 */
	async getTags(): Promise<SingularityTag[]> {
		const response = await this.request<unknown>('/v2/tag');
		return this.normalizeArrayResponse<SingularityTag>(response);
	}

	/**
	 * Parse note content from JSON string to Delta operations
	 */
	parseNoteContent(content: string): DeltaOp[] {
		try {
			return JSON.parse(content) as DeltaOp[];
		} catch {
			return [];
		}
	}

	/**
	 * Marker prefix for singularity_id in URL fragment
	 */
	private readonly SID_FRAGMENT = '#sid=';

	/**
	 * Find Obsidian link by singularity_id in Delta operations
	 * ID is stored in URL fragment: obsidian://...#sid=uuid
	 */
	findObsidianLinkById(
		deltaOps: DeltaOp[],
		singularityId: string
	): { index: number; op: DeltaOp } | null {
		const sidFragment = `${this.SID_FRAGMENT}${singularityId}`;

		for (let i = 0; i < deltaOps.length; i++) {
			const op = deltaOps[i];
			if (op.attributes?.link?.includes(sidFragment)) {
				return { index: i, op };
			}
		}
		return null;
	}

	/**
	 * Find any Obsidian link (legacy, without ID)
	 */
	findObsidianLink(deltaOps: DeltaOp[]): { index: number; op: DeltaOp } | null {
		for (let i = 0; i < deltaOps.length; i++) {
			const op = deltaOps[i];
			if (op.attributes?.link?.startsWith('obsidian://')) {
				return { index: i, op };
			}
		}
		return null;
	}

	/**
	 * Check if link with given URL exists (regardless of ID)
	 */
	hasObsidianUrl(deltaOps: DeltaOp[], obsidianUrl: string): boolean {
		return deltaOps.some(op => op.attributes?.link === obsidianUrl);
	}

	/**
	 * Find any obsidian:// link without ID (for migration from legacy format)
	 */
	findAnyObsidianLink(deltaOps: DeltaOp[]): { index: number; op: DeltaOp } | null {
		for (let i = 0; i < deltaOps.length; i++) {
			const op = deltaOps[i];
			if (op.attributes?.link?.startsWith('obsidian://')) {
				// Check it's not already marked with sid in URL
				if (op.attributes.link.includes(this.SID_FRAGMENT)) {
					continue; // Skip already migrated links
				}
				return { index: i, op };
			}
		}
		return null;
	}

	/**
	 * Create Delta ops for a single Obsidian note link with ID
	 * Format: Obsidian: "Note Title" [link with #sid=uuid]\n
	 */
	createNoteLinkOps(noteTitle: string, obsidianUrl: string, singularityId: string): DeltaOp[] {
		const urlWithSid = `${obsidianUrl}${this.SID_FRAGMENT}${singularityId}`;
		const linkText = `Obsidian: "${noteTitle}"`;
		return [
			{ insert: linkText, attributes: { link: urlWithSid } },
			{ insert: '\n' },
		];
	}

	/**
	 * Update or add Obsidian link by singularity_id
	 * @returns updated delta ops
	 */
	updateObsidianLinkById(
		deltaOps: DeltaOp[],
		noteTitle: string,
		obsidianUrl: string,
		singularityId: string
	): DeltaOp[] {
		const ops = [...deltaOps];
		const existing = this.findObsidianLinkById(ops, singularityId);
		const urlWithSid = `${obsidianUrl}${this.SID_FRAGMENT}${singularityId}`;

		if (existing) {
			// Update existing link URL and text
			const linkText = `Obsidian: "${noteTitle}"`;
			ops[existing.index] = {
				...existing.op,
				insert: linkText,
				attributes: { ...existing.op.attributes, link: urlWithSid },
			};
		} else {
			// Add new link at the end
			const newLinkOps = this.createNoteLinkOps(noteTitle, obsidianUrl, singularityId);

			// Remove trailing newline if exists, we'll add our own
			if (ops.length > 0) {
				const lastOp = ops[ops.length - 1];
				if (this.isOnlyNewline(lastOp)) {
					ops.pop();
				}
			}

			// Add separator newline if there's existing content
			if (ops.length > 0) {
				ops.push({ insert: '\n' });
			}

			ops.push(...newLinkOps);
		}

		return ops;
	}

	/**
	 * Add sid fragment to existing Obsidian link URL
	 * Keeps existing link text, only adds #sid=uuid to the URL
	 */
	addSidToLink(
		deltaOps: DeltaOp[],
		linkIndex: number,
		singularityId: string
	): DeltaOp[] {
		const ops = [...deltaOps];
		const op = ops[linkIndex];

		if (op.attributes?.link) {
			const newUrl = `${op.attributes.link}${this.SID_FRAGMENT}${singularityId}`;
			ops[linkIndex] = {
				...op,
				attributes: { ...op.attributes, link: newUrl },
			};
		}

		return ops;
	}

	/**
	 * Create initial Delta with Obsidian link (with ID)
	 */
	createInitialDelta(noteTitle: string, obsidianUrl: string, singularityId: string): DeltaOp[] {
		return this.createNoteLinkOps(noteTitle, obsidianUrl, singularityId);
	}

	/**
	 * Check if Delta op is only a newline
	 */
	private isOnlyNewline(op: DeltaOp | undefined): boolean {
		return op?.insert === '\n' && !op.attributes;
	}
}
