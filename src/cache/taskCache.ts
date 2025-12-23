import type {
	TaskData,
	SingularityTag,
	KanbanStatus,
	CacheEntry,
	Language,
} from '../types';
import { SingularityAPI } from '../api/singularity';
import { LOCALES } from '../types';

export class TaskCache {
	private api: SingularityAPI;
	private cacheTTL: number; // minutes
	private language: Language;

	private taskCache: Map<string, CacheEntry<TaskData>> = new Map();
	private kanbanCache: Map<string, CacheEntry<KanbanStatus[]>> = new Map();
	private tagsCache: CacheEntry<SingularityTag[]> | null = null;

	constructor(api: SingularityAPI, cacheTTL: number = 5, language: Language = 'en') {
		this.api = api;
		this.cacheTTL = cacheTTL;
		this.language = language;
	}

	setCacheTTL(ttl: number): void {
		this.cacheTTL = ttl;
	}

	setLanguage(language: Language): void {
		this.language = language;
		// Invalidate task cache when language changes to re-fetch with new locale
		this.taskCache.clear();
	}

	private isExpired(timestamp: number): boolean {
		return Date.now() - timestamp > this.cacheTTL * 60 * 1000;
	}

	/**
	 * Get all tags (cached)
	 */
	async getTags(): Promise<SingularityTag[]> {
		if (this.tagsCache && !this.isExpired(this.tagsCache.timestamp)) {
			return this.tagsCache.data;
		}

		const tags = await this.api.getTags();
		this.tagsCache = {
			data: tags,
			timestamp: Date.now(),
		};

		return tags;
	}

	/**
	 * Get tags by IDs
	 */
	async getTagsByIds(tagIds: string[]): Promise<SingularityTag[]> {
		const allTags = await this.getTags();
		return allTags.filter((tag) => tagIds.includes(tag.id));
	}

	/**
	 * Get kanban statuses for a project (cached)
	 */
	async getKanbanStatuses(projectId: string): Promise<KanbanStatus[]> {
		const cached = this.kanbanCache.get(projectId);
		if (cached && !this.isExpired(cached.timestamp)) {
			return cached.data;
		}

		const statuses = await this.api.getKanbanStatuses(projectId);
		this.kanbanCache.set(projectId, {
			data: statuses,
			timestamp: Date.now(),
		});

		return statuses;
	}

	/**
	 * Get enriched task data (cached)
	 */
	async getTaskData(taskId: string): Promise<TaskData> {
		const cached = this.taskCache.get(taskId);
		if (cached && !this.isExpired(cached.timestamp)) {
			return cached.data;
		}

		// Fetch task
		const task = await this.api.getTask(taskId);

		// Fetch kanban status
		const [taskKanbanStatus, projectStatuses, tags] = await Promise.all([
			this.api.getTaskKanbanStatus(taskId),
			this.getKanbanStatuses(task.projectId),
			this.getTagsByIds(task.tags || []),
		]);

		// Determine status
		let status: { id: string; name: string } | null = null;
		const isCompleted = task.checked === 1;
		const isCancelled = task.checked === 2; // checked=2 means cancelled
		const locale = LOCALES[this.language];

		// If task is cancelled, force "Cancelled" status
		if (isCancelled) {
			status = { id: 'CANCELLED', name: locale.statusCancelled };
		}
		// If task is completed, force "Done" status (always use locale)
		else if (isCompleted) {
			status = { id: 'DONE', name: locale.statusDone };
		} else if (taskKanbanStatus.length > 0) {
			const statusId = taskKanbanStatus[0].statusId;
			const kanbanStatus = projectStatuses.find((s) => s.id === statusId);
			if (kanbanStatus) {
				status = { id: kanbanStatus.id, name: kanbanStatus.name };
			}
		} else {
			// Default to "Backlog" (TODO)
			const todoStatus = projectStatuses.find((s) => s.id.endsWith('-TODO'));
			if (todoStatus) {
				status = { id: todoStatus.id, name: todoStatus.name };
			}
		}

		const taskData: TaskData = {
			id: task.id,
			title: task.title,
			projectId: task.projectId,
			status,
			tags,
			noteId: task.note,
			isCompleted: task.checked === 1,
			isCancelled,
		};

		this.taskCache.set(taskId, {
			data: taskData,
			timestamp: Date.now(),
		});

		return taskData;
	}

	/**
	 * Invalidate task cache
	 */
	invalidateTask(taskId: string): void {
		this.taskCache.delete(taskId);
	}

	/**
	 * Invalidate all caches
	 */
	invalidateAll(): void {
		this.taskCache.clear();
		this.kanbanCache.clear();
		this.tagsCache = null;
	}

	/**
	 * Preload tags on startup
	 */
	async preloadTags(): Promise<void> {
		try {
			await this.getTags();
		} catch (error) {
			console.error('Failed to preload tags:', error);
		}
	}
}
