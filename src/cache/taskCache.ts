import type {
	TaskData,
	SingularityTag,
	KanbanStatus,
	CacheEntry,
} from '../types';
import { SingularityAPI } from '../api/singularity';

export class TaskCache {
	private api: SingularityAPI;
	private cacheTTL: number; // minutes

	private taskCache: Map<string, CacheEntry<TaskData>> = new Map();
	private kanbanCache: Map<string, CacheEntry<KanbanStatus[]>> = new Map();
	private tagsCache: CacheEntry<SingularityTag[]> | null = null;

	constructor(api: SingularityAPI, cacheTTL: number = 5) {
		this.api = api;
		this.cacheTTL = cacheTTL;
	}

	setCacheTTL(ttl: number): void {
		this.cacheTTL = ttl;
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

		// If task is cancelled, force "Отменена" status
		if (isCancelled) {
			status = { id: 'CANCELLED', name: 'Отменена' };
		}
		// If task is completed, force "Готово" status
		else if (isCompleted) {
			const doneStatus = projectStatuses.find((s) => s.id.endsWith('-DONE'));
			if (doneStatus) {
				status = { id: doneStatus.id, name: doneStatus.name };
			} else {
				status = { id: 'DONE', name: 'Готово' };
			}
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
