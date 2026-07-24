/**
 * Singularity API Types
 */

// Task from Singularity API
export interface SingularityTask {
	id: string; // T-{uuid}
	title: string;
	note: string | null; // N-T-{uuid} or null
	projectId: string; // P-{uuid}
	tags: string[]; // A-{uuid}[]
	checked: number; // 1 = completed, 0 = not completed
	complete: number;
	state: number;
	priority: number;
	journalDate?: string;
	deadline?: string | null;
	dueDate?: string | null;
	modificatedDate?: string;
	createdDate?: string;
	removed?: boolean;
}

// Project from Singularity API
export interface SingularityProject {
	id: string; // P-{uuid}
	title: string;
	parent: string | null;
	archived?: boolean;
	removed?: boolean;
}

// Tag from Singularity API
export interface SingularityTag {
	id: string; // A-{uuid}
	title: string;
	color: string | null;
	parent: string | null; // A-{uuid} or null
}

// Kanban status from Singularity API
export interface KanbanStatus {
	id: string; // KS-P-{uuid}-TODO | KS-P-{uuid}-IN-PROGRESS | KS-P-{uuid}-DONE | KS-{uuid}
	name: string;
	projectId?: string;
	kanbanOrder: number;
}

// Task kanban status mapping
export interface TaskKanbanStatus {
	taskId: string;
	statusId: string;
}

// Note content from Singularity API
export interface SingularityNote {
	id: string; // N-T-{uuid}
	content: string; // JSON string of DeltaOp[]
}

/**
 * Delta format (Quill.js)
 */
export interface DeltaOp {
	insert: string;
	attributes?: {
		link?: string;
		bold?: boolean;
		italic?: boolean;
		[key: string]: unknown;
	};
}

/**
 * Enriched task data for rendering
 */
export interface TaskData {
	id: string;
	title: string;
	projectId: string;
	projectTitle: string | null;
	status: {
		id: string;
		name: string;
	} | null;
	tags: SingularityTag[];
	noteId: string | null;
	deadline: string | null;
	isCompleted: boolean;
	isCancelled: boolean;
	cacheUpdatedAt?: string;
	isStale?: boolean;
}

/**
 * Cache entry with timestamp
 */
export interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

/**
 * Supported languages
 */
export type Language = 'ru' | 'en';

/**
 * Plugin settings
 */
export interface SingularityPluginSettings {
	apiToken: string;
	vaultName: string;
	autoSync: boolean;
	cacheTTL: number; // minutes
	badgeMaxWidth: number; // pixels
	language: Language;
	registryEnabled: boolean;
	registryTitle: string;
	registryFolders: string;
	registrySourceProject: string;
	registryDeliveryProjects: string;
	registryExternalLinkFields: string;
	registryWaitingTags: string;
	registrySnapshotPath: string;
}

export const DEFAULT_SETTINGS: SingularityPluginSettings = {
	apiToken: '',
	vaultName: '',
	autoSync: true,
	cacheTTL: 5,
	badgeMaxWidth: 300,
	language: 'en',
	registryEnabled: true,
	registryTitle: 'Task registry',
	registryFolders: '',
	registrySourceProject: '',
	registryDeliveryProjects: '',
	registryExternalLinkFields: 'redmine',
	registryWaitingTags: 'waiting,wait,жду,ждём,ожидание',
	registrySnapshotPath: '.singularity/task-registry.json',
};

/**
 * Localization strings
 */
export const LOCALES: Record<Language, {
	statusDone: string;
	statusCancelled: string;
	statusBacklog: string;
	tooltipCompleted: string;
	tooltipCancelled: string;
	tooltipActive: string;
	loading: string;
	error: string;
	stale: string;
}> = {
	ru: {
		statusDone: 'Готово',
		statusCancelled: 'Отменена',
		statusBacklog: 'Backlog',
		tooltipCompleted: 'Завершена',
		tooltipCancelled: 'Отменена',
		tooltipActive: 'Не завершена',
		loading: 'Загрузка...',
		error: 'Ошибка',
		stale: 'Сохранённые данные',
	},
	en: {
		statusDone: 'Done',
		statusCancelled: 'Cancelled',
		statusBacklog: 'Backlog',
		tooltipCompleted: 'Completed',
		tooltipCancelled: 'Cancelled',
		tooltipActive: 'Active',
		loading: 'Loading...',
		error: 'Error',
		stale: 'Cached data',
	},
};

/**
 * Singularity URL regex pattern
 */
export const SINGULARITY_URL_REGEX = /singularityapp:\/\/\?&page=any&id=(T-[a-f0-9-]+)/gi;
export const SINGULARITY_URL_REGEX_SINGLE = /singularityapp:\/\/\?&page=any&id=(T-[a-f0-9-]+)/i;

/**
 * Extract task ID from Singularity URL
 */
export function extractTaskId(url: string): string | null {
	const match = url.match(SINGULARITY_URL_REGEX_SINGLE);
	return match ? match[1] : null;
}

/**
 * Build Obsidian URL for a file
 */
export function buildObsidianUrl(vaultName: string, filePath: string): string {
	return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filePath)}`;
}

/**
 * Build Singularity App URL for a task
 */
export function buildSingularityUrl(taskId: string): string {
	return `singularityapp://?&page=any&id=${taskId}`;
}
