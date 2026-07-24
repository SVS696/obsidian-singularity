import type {
	KanbanStatus,
	Language,
	SingularityProject,
	SingularityTag,
	SingularityTask,
	TaskData,
	TaskKanbanStatus,
} from '../types';
import { LOCALES } from '../types';
import type {
	RegistryDocumentType,
	RegistryExternalLink,
	RegistryItem,
	RegistryModelConfig,
	RegistryNoteSource,
	RegistryStage,
} from './types';

const TASK_URL_PATTERN =
	/singularityapp:\/\/\?&page=any&id=(T-[a-f0-9-]+)/gi;

export function splitSetting(value: string): string[] {
	return value
		.split(/[\n,;]+/)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

export function inferDocumentType(
	path: string,
	frontmatterType?: unknown
): RegistryDocumentType {
	if (typeof frontmatterType === 'string') {
		const explicit = frontmatterType.trim().toLowerCase();
		const supported: RegistryDocumentType[] = [
			'specification',
			'questions',
			'research',
			'implementation-check',
			'source-data',
			'meeting-output',
			'unknown',
		];
		if (supported.includes(explicit as RegistryDocumentType)) {
			return explicit as RegistryDocumentType;
		}
	}

	const name = path.normalize('NFKC').toLowerCase();
	if (name.includes('_вопрос') || name.includes(' вопросы')) {
		return 'questions';
	}
	if (
		name.includes('сверка реализации') ||
		name.includes('проверка реализации')
	) {
		return 'implementation-check';
	}
	if (
		name.includes('анализ') ||
		name.includes('исследован') ||
		name.includes('разбор')
	) {
		return 'research';
	}
	if (
		name.includes('исходные данные') ||
		name.includes('выгрузка') ||
		name.includes('датасет')
	) {
		return 'source-data';
	}
	if (name.includes('встреч') || name.includes('созвон')) {
		return 'meeting-output';
	}
	return 'specification';
}

export function extractTaskIds(value: unknown): string[] {
	const ids = new Set<string>();

	const visit = (current: unknown): void => {
		if (typeof current === 'string') {
			const regex = new RegExp(TASK_URL_PATTERN.source, 'gi');
			let match: RegExpExecArray | null;
			while ((match = regex.exec(current)) !== null) {
				ids.add(match[1]);
			}
			return;
		}
		if (Array.isArray(current)) {
			current.forEach(visit);
			return;
		}
		if (current && typeof current === 'object') {
			Object.values(current as Record<string, unknown>).forEach(visit);
		}
	};

	visit(value);
	return Array.from(ids);
}

function extractUrls(value: unknown): string[] {
	if (typeof value === 'string') {
		return /^https?:\/\//i.test(value.trim()) ? [value.trim()] : [];
	}
	if (Array.isArray(value)) {
		return value.flatMap(extractUrls);
	}
	if (value && typeof value === 'object') {
		return Object.values(value as Record<string, unknown>).flatMap(extractUrls);
	}
	return [];
}

export function extractExternalLinks(
	frontmatter: Record<string, unknown>,
	fields: string[]
): RegistryExternalLink[] {
	const wanted = new Set(fields.map((field) => field.toLowerCase()));
	const links: RegistryExternalLink[] = [];

	const visit = (value: unknown, path: string): void => {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return;
		}
		for (const [key, nested] of Object.entries(
			value as Record<string, unknown>
		)) {
			const fieldPath = path ? `${path}.${key}` : key;
			if (wanted.has(key.toLowerCase()) || wanted.has(fieldPath.toLowerCase())) {
				for (const url of extractUrls(nested)) {
					links.push({ field: fieldPath, url });
				}
			}
			visit(nested, fieldPath);
		}
	};

	visit(frontmatter, '');
	return links;
}

export function enrichTasks(
	tasks: SingularityTask[],
	projects: SingularityProject[],
	statuses: KanbanStatus[],
	taskStatuses: TaskKanbanStatus[],
	tags: SingularityTag[],
	language: Language,
	timestamp = Date.now()
): TaskData[] {
	const projectsById = new Map(projects.map((project) => [project.id, project]));
	const statusesById = new Map(statuses.map((status) => [status.id, status]));
	const taskStatusesByTask = new Map(
		taskStatuses.map((mapping) => [mapping.taskId, mapping])
	);
	const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
	const locale = LOCALES[language];
	const cacheUpdatedAt = new Date(timestamp).toISOString();

	return tasks.map((task) => {
		const isCompleted = task.checked === 1;
		const isCancelled = task.checked === 2;
		let status: TaskData['status'] = null;

		if (isCancelled) {
			status = { id: 'CANCELLED', name: locale.statusCancelled };
		} else if (isCompleted) {
			status = { id: 'DONE', name: locale.statusDone };
		} else {
			const mapping = taskStatusesByTask.get(task.id);
			const mappedStatus = mapping
				? statusesById.get(mapping.statusId)
				: undefined;
			const backlog = statuses.find(
				(candidate) =>
					candidate.projectId === task.projectId &&
					candidate.id.endsWith('-TODO')
			);
			const selected = mappedStatus ?? backlog;
			if (selected) {
				status = { id: selected.id, name: selected.name };
			}
		}

		return {
			id: task.id,
			title: task.title,
			projectId: task.projectId,
			projectTitle: projectsById.get(task.projectId)?.title ?? null,
			status,
			tags: (task.tags ?? [])
				.map((tagId) => tagsById.get(tagId))
				.filter((tag): tag is SingularityTag => Boolean(tag)),
			noteId: task.note,
			deadline: task.deadline ?? task.dueDate ?? null,
			isCompleted,
			isCancelled,
			cacheUpdatedAt,
			isStale: false,
		};
	});
}

function normalize(value: string): string {
	return value.normalize('NFKC').trim().toLowerCase();
}

function statusKind(task: TaskData): 'todo' | 'progress' | 'done' | 'other' {
	const id = task.status?.id ?? '';
	if (id === 'DONE' || id.endsWith('-DONE')) return 'done';
	if (id.endsWith('-IN-PROGRESS')) return 'progress';
	if (id.endsWith('-TODO')) return 'todo';
	return 'other';
}

function hasWaitingTag(task: TaskData, waitingTags: string[]): boolean {
	const wanted = waitingTags.map(normalize);
	return task.tags.some((tag) => {
		const title = normalize(tag.title);
		return wanted.some(
			(value) =>
				title === value ||
				title.startsWith(`${value} `) ||
				title.startsWith(`${value}:`)
		);
	});
}

function isOldUnlinkedNote(
	note: RegistryNoteSource,
	tasks: TaskData[],
	config: RegistryModelConfig
): boolean {
	if (tasks.length > 0 || note.externalLinks.length > 0) return false;
	const modifiedAt = Date.parse(note.modifiedAt);
	if (!Number.isFinite(modifiedAt)) return false;
	const now = config.now ?? Date.now();
	const thresholdDays = Math.max(1, config.triageAfterDays);
	return now - modifiedAt >= thresholdDays * 24 * 60 * 60 * 1000;
}

function classifyStage(
	note: RegistryNoteSource,
	tasks: TaskData[],
	conflicts: string[],
	config: RegistryModelConfig
): RegistryStage {
	if (conflicts.length > 0) {
		return 'attention';
	}
	if (note.documentType === 'implementation-check') {
		return 'implementation-check';
	}
	if (tasks.some((task) => hasWaitingTag(task, config.waitingTags))) {
		return 'waiting';
	}

	const sourceProject = normalize(config.sourceProject);
	const deliveryProjects = new Set(config.deliveryProjects.map(normalize));
	const sourceTask = tasks.find(
		(task) => normalize(task.projectTitle ?? '') === sourceProject
	);
	const deliveryTask = tasks.find((task) =>
		deliveryProjects.has(normalize(task.projectTitle ?? ''))
	);

	if (sourceTask) {
		const kind = statusKind(sourceTask);
		if (kind === 'done') return 'ready';
		if (kind === 'progress') return 'drafting';
		if (kind === 'todo') return 'planned';
	}

	if (deliveryTask?.isCompleted || deliveryTask?.isCancelled) {
		return 'archive';
	}
	if (deliveryTask || note.externalLinks.length > 0) {
		return 'published';
	}
	if (tasks.some((task) => task.isCompleted || task.isCancelled)) {
		return 'archive';
	}
	if (isOldUnlinkedNote(note, tasks, config)) {
		return 'triage';
	}
	return 'attention';
}

export function buildRegistryItems(
	notes: RegistryNoteSource[],
	taskData: TaskData[],
	config: RegistryModelConfig
): RegistryItem[] {
	const tasksById = new Map(taskData.map((task) => [task.id, task]));
	const sourceProject = normalize(config.sourceProject);
	const deliveryProjects = new Set(config.deliveryProjects.map(normalize));

	return groupRelatedNotes(notes).map((relatedNotes) => {
		const primary = choosePrimaryNote(relatedNotes);
		const taskIds = Array.from(
			new Set(relatedNotes.flatMap((note) => note.taskIds))
		);
		const externalLinks = Array.from(
			new Map(
				relatedNotes
					.flatMap((note) => note.externalLinks)
					.map((link) => [`${link.field}\n${link.url}`, link])
			).values()
		);
		const documentType = relatedNotes.some(
			(note) => note.documentType === 'implementation-check'
		)
			? 'implementation-check'
			: primary.documentType;
		const modificationDates = relatedNotes
			.map((note) => note.modifiedAt)
			.sort();
		const mergedNote: RegistryNoteSource = {
			...primary,
			modifiedAt:
				modificationDates[modificationDates.length - 1] ??
				primary.modifiedAt,
			documentType,
			taskIds,
			externalLinks,
		};
		const tasks = taskIds
			.map((taskId) => tasksById.get(taskId))
			.filter((task): task is TaskData => Boolean(task));
		const conflicts: string[] = [];
		const hasExternalLink = externalLinks.length > 0;

		for (const taskId of taskIds) {
			if (!tasksById.has(taskId)) {
				conflicts.push(`Task ${taskId} was not returned by Singularity`);
			}
		}

		const hasSourceTask = tasks.some(
			(task) => normalize(task.projectTitle ?? '') === sourceProject
		);
		const hasDeliveryTask = tasks.some((task) =>
			deliveryProjects.has(normalize(task.projectTitle ?? ''))
		);

		if (hasExternalLink && hasSourceTask && !hasDeliveryTask) {
			conflicts.push(
				'External issue exists, but the Singularity task is still in the source project'
			);
		}
		if (!hasExternalLink && hasDeliveryTask) {
			conflicts.push(
				'Singularity task is in a delivery project, but the external issue link is missing'
			);
		}

		const uniqueConflicts = Array.from(new Set(conflicts));
		return {
			id: taskIds[0] ?? externalLinks[0]?.url ?? primary.path,
			path: primary.path,
			title: primary.title,
			modifiedAt: mergedNote.modifiedAt,
			documentType,
			notes: relatedNotes,
			taskIds,
			tasks,
			externalLinks,
			stage: classifyStage(mergedNote, tasks, uniqueConflicts, config),
			conflicts: uniqueConflicts,
		};
	});
}

function choosePrimaryNote(notes: RegistryNoteSource[]): RegistryNoteSource {
	const priority: Record<RegistryDocumentType, number> = {
		specification: 0,
		questions: 1,
		'implementation-check': 2,
		research: 3,
		'meeting-output': 4,
		'source-data': 5,
		unknown: 6,
	};
	return [...notes].sort((left, right) => {
		const typeDelta =
			priority[left.documentType] - priority[right.documentType];
		if (typeDelta !== 0) return typeDelta;
		return right.modifiedAt.localeCompare(left.modifiedAt);
	})[0];
}

function companionTitleKey(note: RegistryNoteSource): string | null {
	if (
		note.documentType !== 'specification' &&
		note.documentType !== 'questions' &&
		note.documentType !== 'implementation-check'
	) {
		return null;
	}

	const key = normalize(note.title)
		.replace(
			/(?:[_\s—-]+)(?:вопрос(?:ы|ам)?|сверка реализации|проверка реализации)\s*$/,
			''
		)
		.replace(/\s*\(\d{3,}\)\s*$/, '')
		.trim();
	return key || null;
}

function groupRelatedNotes(notes: RegistryNoteSource[]): RegistryNoteSource[][] {
	const parents = notes.map((_, index) => index);
	const find = (index: number): number => {
		let root = index;
		while (parents[root] !== root) root = parents[root];
		while (parents[index] !== index) {
			const next = parents[index];
			parents[index] = root;
			index = next;
		}
		return root;
	};
	const union = (left: number, right: number): void => {
		const leftRoot = find(left);
		const rightRoot = find(right);
		if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
	};
	const firstByKey = new Map<string, number>();

	notes.forEach((note, index) => {
		const keys = [
			...note.taskIds.map((taskId) => `task:${taskId}`),
			...note.externalLinks.map(
				(link) => `url:${normalize(link.url)}`
			),
		];
		for (const key of keys) {
			const first = firstByKey.get(key);
			if (first === undefined) {
				firstByKey.set(key, index);
			} else {
				union(first, index);
			}
		}
	});

	// Older companion notes often predate frontmatter links. Attach questions
	// and implementation checks to one unambiguous specification by filename.
	const specificationsByTitle = new Map<string, number[]>();
	notes.forEach((note, index) => {
		if (note.documentType !== 'specification') return;
		const key = companionTitleKey(note);
		if (!key) return;
		const matches = specificationsByTitle.get(key) ?? [];
		matches.push(index);
		specificationsByTitle.set(key, matches);
	});
	notes.forEach((note, index) => {
		if (
			note.documentType !== 'questions' &&
			note.documentType !== 'implementation-check'
		) {
			return;
		}
		const key = companionTitleKey(note);
		if (!key) return;
		const matches = specificationsByTitle.get(key) ?? [];
		if (matches.length === 1) {
			union(matches[0], index);
		}
	});

	const groups = new Map<number, RegistryNoteSource[]>();
	notes.forEach((note, index) => {
		const root = find(index);
		const group = groups.get(root) ?? [];
		group.push(note);
		groups.set(root, group);
	});
	return Array.from(groups.values());
}
