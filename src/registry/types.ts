import type { CacheEntry, TaskData } from '../types';

export type RegistryDocumentType =
	| 'specification'
	| 'questions'
	| 'research'
	| 'implementation-check'
	| 'source-data'
	| 'meeting-output'
	| 'unknown';

export type RegistryStage =
	| 'drafting'
	| 'ready'
	| 'published'
	| 'waiting'
	| 'implementation-check'
	| 'planned'
	| 'attention'
	| 'archive';

export interface RegistryExternalLink {
	field: string;
	url: string;
}

export interface RegistryNoteSource {
	path: string;
	title: string;
	modifiedAt: string;
	documentType: RegistryDocumentType;
	taskIds: string[];
	externalLinks: RegistryExternalLink[];
}

export interface RegistryItem {
	id: string;
	path: string;
	title: string;
	modifiedAt: string;
	documentType: RegistryDocumentType;
	notes: RegistryNoteSource[];
	taskIds: string[];
	tasks: TaskData[];
	externalLinks: RegistryExternalLink[];
	stage: RegistryStage;
	conflicts: string[];
}

export interface RegistryModelConfig {
	sourceProject: string;
	deliveryProjects: string[];
	waitingTags: string[];
}

export interface RegistrySnapshot {
	schemaVersion: 1;
	generatedAt: string;
	scope: {
		folders: string[];
		sourceProject: string;
		deliveryProjects: string[];
		externalLinkFields: string[];
	};
	taskEntries: Record<string, CacheEntry<TaskData>>;
	items: RegistryItem[];
}

export interface RegistryResult {
	snapshot: RegistrySnapshot;
	source: 'live' | 'snapshot';
	error?: string;
}
