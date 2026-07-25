import assert from 'node:assert/strict';
import test from 'node:test';
import type { SingularityAPI } from '../src/api/singularity';
import { TaskCache } from '../src/cache/taskCache';
import {
	buildRegistryItems,
	enrichTasks,
	inferDocumentType,
} from '../src/registry/model';
import {
	duplicateSnapshotProfile,
	enabledRegistryProfiles,
	migrateRegistryProfiles,
} from '../src/registry/profiles';
import {
	RegistrySnapshotStore,
	type SnapshotAdapter,
} from '../src/registry/snapshotStore';
import {
	pathMatchesRegistryFolders,
	recoverMissingTasks,
} from '../src/registry/service';
import type {
	RegistryNoteSource,
	RegistrySnapshot,
} from '../src/registry/types';
import {
	DEFAULT_SETTINGS,
	type SingularityPluginSettings,
	type TaskData,
} from '../src/types';

test('registry is opt-in for new vaults', () => {
	assert.equal(DEFAULT_SETTINGS.registryEnabled, false);
	assert.deepEqual(DEFAULT_SETTINGS.registryProfiles, []);
});

test('legacy single registry migrates into an independent profile', () => {
	const profiles = migrateRegistryProfiles({
		registryEnabled: true,
		registryTitle: 'RTL — Контроль постановок',
		registryFolders: 'projects/RTL/Постановки',
		registrySourceProject: 'RTL',
		registryDeliveryProjects: 'Redmine',
		registryExternalLinkFields: 'redmine',
		registryWaitingTags: 'Ожидание',
		registryTriageAfterDays: 90,
		registrySnapshotPath:
			'projects/RTL/.workday-control/singularity-snapshot.json',
	});

	assert.equal(profiles.length, 1);
	assert.equal(profiles[0].id, 'legacy-default');
	assert.equal(profiles[0].name, 'RTL — Контроль постановок');
	assert.equal(profiles[0].folders, 'projects/RTL/Постановки');
	assert.equal(
		profiles[0].snapshotPath,
		'projects/RTL/.workday-control/singularity-snapshot.json'
	);
});

test('profiles stay independent inside one vault', () => {
	const profiles = migrateRegistryProfiles({
		registryProfiles: [
			{
				id: 'rtl',
				name: 'RTL',
				enabled: true,
				folders: 'projects/RTL/Постановки',
				sourceProject: 'RTL',
				deliveryProjects: 'Redmine',
				externalLinkFields: 'redmine',
				waitingTags: 'Ожидание',
				triageAfterDays: 90,
				snapshotPath: 'projects/RTL/.workday-control/registry.json',
			},
			{
				id: 'haeze',
				name: 'HÆZE',
				enabled: true,
				folders: 'projects/HÆZE/Specifications',
				sourceProject: 'HÆZE',
				deliveryProjects: 'Delivery',
				externalLinkFields: 'jira',
				waitingTags: 'waiting',
				triageAfterDays: 45,
				snapshotPath: 'projects/HÆZE/.workday-control/registry.json',
			},
		],
	});
	const settings = {
		...DEFAULT_SETTINGS,
		registryEnabled: true,
		registryProfiles: profiles,
	} satisfies SingularityPluginSettings;

	assert.deepEqual(
		enabledRegistryProfiles(settings).map((profile) => profile.id),
		['rtl', 'haeze']
	);
	assert.notEqual(profiles[0].folders, profiles[1].folders);
	assert.notEqual(profiles[0].snapshotPath, profiles[1].snapshotPath);
	assert.equal(duplicateSnapshotProfile(profiles[0], profiles), null);
	assert.equal(
		pathMatchesRegistryFolders(
			'projects/RTL/Постановки/spec.md',
			['projects/RTL/Постановки']
		),
		true
	);
	assert.equal(
		pathMatchesRegistryFolders(
			'projects/HÆZE/Specifications/spec.md',
			['projects/RTL/Постановки']
		),
		false
	);
});

test('profiles cannot silently overwrite the same AI snapshot', () => {
	const profiles = migrateRegistryProfiles({
		registryProfiles: [
			{
				id: 'first',
				name: 'First',
				enabled: true,
				folders: 'projects/First',
				sourceProject: '',
				deliveryProjects: '',
				externalLinkFields: '',
				waitingTags: '',
				triageAfterDays: 90,
				snapshotPath: 'projects/shared/registry.json',
			},
			{
				id: 'second',
				name: 'Second',
				enabled: true,
				folders: 'projects/Second',
				sourceProject: '',
				deliveryProjects: '',
				externalLinkFields: '',
				waitingTags: '',
				triageAfterDays: 90,
				snapshotPath: '/Projects/Shared/Registry.json/',
			},
		],
	});

	assert.equal(duplicateSnapshotProfile(profiles[0], profiles)?.id, 'second');
});

function task(overrides: Partial<TaskData> = {}): TaskData {
	return {
		id: 'T-1',
		title: 'Prepare specification',
		projectId: 'P-source',
		projectTitle: 'RTL',
		status: {
			id: 'KS-P-source-IN-PROGRESS',
			name: 'В работе',
		},
		tags: [],
		noteId: null,
		deadline: null,
		isCompleted: false,
		isCancelled: false,
		...overrides,
	};
}

function note(overrides: Partial<RegistryNoteSource> = {}): RegistryNoteSource {
	return {
		path: 'projects/RTL/Постановки/spec.md',
		title: 'Specification',
		modifiedAt: '2026-07-24T10:00:00.000Z',
		documentType: 'specification',
		taskIds: ['T-1'],
		externalLinks: [],
		...overrides,
	};
}

test('batch enrichment resolves project, status, tags, and deadline', () => {
	const enriched = enrichTasks(
		[
			{
				id: 'T-1',
				title: 'Prepare specification',
				note: null,
				projectId: 'P-source',
				tags: ['A-wait'],
				checked: 0,
				complete: 0,
				state: 1,
				priority: 1,
				deadline: '2026-07-30',
			},
		],
		[{ id: 'P-source', title: 'RTL', parent: null }],
		[
			{
				id: 'KS-P-source-IN-PROGRESS',
				name: 'В работе',
				projectId: 'P-source',
				kanbanOrder: 1,
			},
		],
		[
			{
				taskId: 'T-1',
				statusId: 'KS-P-source-IN-PROGRESS',
			},
		],
		[{ id: 'A-wait', title: 'waiting', color: null, parent: null }],
		'ru',
		Date.parse('2026-07-24T12:00:00.000Z')
	);

	assert.equal(enriched[0].projectTitle, 'RTL');
	assert.equal(enriched[0].status?.name, 'В работе');
	assert.equal(enriched[0].tags[0].title, 'waiting');
	assert.equal(enriched[0].deadline, '2026-07-30');
	assert.equal(enriched[0].cacheUpdatedAt, '2026-07-24T12:00:00.000Z');
});

test('registry derives workflow stages and flags project/link conflicts', () => {
	const items = buildRegistryItems(
		[
			note(),
			note({
				path: 'ready.md',
				title: 'Ready',
				taskIds: ['T-2'],
			}),
			note({
				path: 'completed.md',
				title: 'Completed',
				taskIds: ['T-5'],
			}),
			note({
				path: 'published.md',
				title: 'Published',
				taskIds: ['T-3'],
				externalLinks: [
					{ field: 'redmine', url: 'https://redmine.example/1' },
				],
			}),
			note({
				path: 'conflict.md',
				title: 'Conflict',
				taskIds: ['T-4'],
				externalLinks: [
					{ field: 'redmine', url: 'https://redmine.example/2' },
				],
			}),
		],
		[
			task(),
			task({
				id: 'T-2',
				status: { id: 'KS-P-source-DONE', name: 'Готово' },
				isCompleted: false,
			}),
			task({
				id: 'T-5',
				status: { id: 'DONE', name: 'Завершено' },
				isCompleted: true,
			}),
			task({
				id: 'T-3',
				projectId: 'P-delivery',
				projectTitle: 'Redmine',
				status: { id: 'KS-P-delivery-IN-PROGRESS', name: 'В работе' },
			}),
			task({ id: 'T-4' }),
		],
		{
			sourceProject: 'RTL',
			deliveryProjects: ['Redmine'],
			waitingTags: ['waiting'],
			triageAfterDays: 90,
			now: Date.parse('2026-07-24T12:00:00.000Z'),
		}
	);

	assert.equal(items[0].stage, 'drafting');
	assert.equal(items[1].stage, 'ready');
	assert.equal(items[2].stage, 'archive');
	assert.equal(items[3].stage, 'published');
	assert.equal(items[4].stage, 'attention');
	assert.match(items[4].conflicts[0], /External issue exists/);
});

test('notes that share a task are rendered as one entity', () => {
	const items = buildRegistryItems(
		[
			note(),
			note({
				path: 'projects/RTL/Постановки/spec_вопросы.md',
				title: 'Specification questions',
				documentType: 'questions',
			}),
		],
		[task()],
		{
			sourceProject: 'RTL',
			deliveryProjects: ['Redmine'],
			waitingTags: [],
			triageAfterDays: 90,
			now: Date.parse('2026-07-24T12:00:00.000Z'),
		}
	);

	assert.equal(items.length, 1);
	assert.equal(items[0].notes.length, 2);
	assert.equal(items[0].title, 'Specification');
	assert.deepEqual(items[0].conflicts, []);
});

test('legacy question note is paired with one specification by filename', () => {
	const items = buildRegistryItems(
		[
			note({
				path: '2026-06-03 — Report (CRM) (14874).md',
				title: '2026-06-03 — Report (CRM) (14874)',
			}),
			note({
				path: '2026-06-03 — Report (CRM)_вопросы.md',
				title: '2026-06-03 — Report (CRM)_вопросы',
				documentType: 'questions',
				taskIds: [],
			}),
		],
		[task()],
		{
			sourceProject: 'RTL',
			deliveryProjects: ['Redmine'],
			waitingTags: [],
			triageAfterDays: 90,
			now: Date.parse('2026-07-24T12:00:00.000Z'),
		}
	);

	assert.equal(items.length, 1);
	assert.equal(items[0].notes.length, 2);
	assert.equal(items[0].title, '2026-06-03 — Report (CRM) (14874)');
});

test('an unmatched questions note is a sublink of its external issue card', () => {
	const items = buildRegistryItems(
		[
			note({
				path: '2026-07-22 — Feature (16020)_вопросы.md',
				title: '2026-07-22 — Feature (16020)_вопросы',
				documentType: 'questions',
				taskIds: [],
				externalLinks: [
					{
						field: 'redmine',
						url: 'https://redmine.example/issues/16020',
					},
				],
			}),
		],
		[],
		{
			sourceProject: 'RTL',
			deliveryProjects: ['Redmine'],
			waitingTags: [],
			triageAfterDays: 90,
			now: Date.parse('2026-07-24T12:00:00.000Z'),
		}
	);

	assert.equal(items.length, 1);
	assert.equal(items[0].title, '2026-07-22 — Feature (16020)');
	assert.equal(items[0].stage, 'published');
	assert.equal(items[0].companionOnly, true);
	assert.equal(items[0].notes[0].documentType, 'questions');
});

test('old unlinked notes move out of attention into triage', () => {
	const items = buildRegistryItems(
		[
			note({
				path: 'old.md',
				title: 'Old orphan',
				modifiedAt: '2026-03-01T12:00:00.000Z',
				taskIds: [],
			}),
			note({
				path: 'recent.md',
				title: 'Recent orphan',
				modifiedAt: '2026-07-20T12:00:00.000Z',
				taskIds: [],
			}),
		],
		[],
		{
			sourceProject: 'RTL',
			deliveryProjects: ['Redmine'],
			waitingTags: [],
			triageAfterDays: 90,
			now: Date.parse('2026-07-24T12:00:00.000Z'),
		}
	);

	assert.equal(items.find((item) => item.title === 'Old orphan')?.stage, 'triage');
	assert.equal(
		items.find((item) => item.title === 'Recent orphan')?.stage,
		'attention'
	);
});

test('document type inference keeps old notes out of a manual migration', () => {
	assert.equal(
		inferDocumentType('2026-07-22 — ДПУф_вопросы.md'),
		'questions'
	);
	assert.equal(
		inferDocumentType('2026-04-16 — Периоды — сверка реализации.md'),
		'implementation-check'
	);
	assert.equal(
		inferDocumentType('2026-05-07 — Импорт — анализ-сравнение.md'),
		'research'
	);
	assert.equal(
		inferDocumentType('Catalog implementation review.md'),
		'implementation-check'
	);
	assert.equal(inferDocumentType('Catalog questions.md'), 'questions');
});

test('each profile can use its own related note prefixes and suffixes', () => {
	assert.equal(
		inferDocumentType(
			'Appendix — Billing.md',
			undefined,
			['appendix'],
			[]
		),
		'questions'
	);
	assert.equal(
		inferDocumentType(
			'Billing_follow-up.md',
			undefined,
			[],
			['follow-up']
		),
		'questions'
	);
	assert.equal(
		inferDocumentType('Billing_follow-up.md', undefined, [], ['questions']),
		'specification'
	);

	const items = buildRegistryItems(
		[
			note({
				path: 'Appendix — Billing.md',
				title: 'Appendix — Billing',
				documentType: 'questions',
				taskIds: [],
				externalLinks: [
					{ field: 'jira', url: 'https://jira.example/BILL-1' },
				],
			}),
		],
		[],
		{
			sourceProject: 'Docs',
			deliveryProjects: ['Delivery'],
			waitingTags: [],
			companionPrefixes: ['appendix'],
			companionSuffixes: [],
			triageAfterDays: 90,
		}
	);
	assert.equal(items[0].title, 'Billing');
	assert.equal(items[0].companionOnly, true);
});

test('task cache returns the persistent value when the API is offline', async () => {
	const offlineApi = {
		getTask: async () => {
			throw new Error('offline');
		},
	} as unknown as SingularityAPI;
	const cache = new TaskCache(offlineApi, 0, 'en');
	cache.putTaskData(task(), Date.now() - 1000);

	const cached = await cache.getTaskData('T-1');
	assert.equal(cached.title, 'Prepare specification');
	assert.equal(cached.isStale, true);
	assert.ok(cached.cacheUpdatedAt);
});

test('registry recovers only missing linked tasks with bounded concurrency', async () => {
	const listedTask = {
		id: 'T-1',
		title: 'Listed',
		note: null,
		projectId: 'P-source',
		tags: [],
		checked: 0,
		complete: 0,
		state: 1,
		priority: 1,
		deadline: null,
	};
	const calls: string[] = [];
	let active = 0;
	let maxActive = 0;

	const tasks = await recoverMissingTasks(
		[listedTask],
		['T-1', 'T-2', 'T-2', 'T-3', 'T-gone'],
		async (taskId) => {
			calls.push(taskId);
			active += 1;
			maxActive = Math.max(maxActive, active);
			await new Promise((resolve) => setTimeout(resolve, 5));
			active -= 1;
			if (taskId === 'T-gone') throw new Error('not found');
			return { ...listedTask, id: taskId, title: taskId };
		},
		2
	);

	assert.deepEqual(calls.sort(), ['T-2', 'T-3', 'T-gone']);
	assert.equal(maxActive, 2);
	assert.deepEqual(
		tasks.map((item) => item.id).sort(),
		['T-1', 'T-2', 'T-3']
	);
});

class MemoryAdapter implements SnapshotAdapter {
	files = new Map<string, string>();
	folders = new Set<string>();
	failWrites = false;

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.folders.has(path);
	}

	async read(path: string): Promise<string> {
		const value = this.files.get(path);
		if (value === undefined) throw new Error('missing');
		return value;
	}

	async write(path: string, data: string): Promise<void> {
		if (this.failWrites) throw new Error('disk full');
		this.files.set(path, data);
	}

	async mkdir(path: string): Promise<void> {
		this.folders.add(path);
	}
}

function snapshot(generatedAt: string): RegistrySnapshot {
	return {
		schemaVersion: 1,
		generatedAt,
		scope: {
			folders: ['projects/RTL/Постановки'],
			sourceProject: 'RTL',
			deliveryProjects: ['Redmine'],
			externalLinkFields: ['redmine'],
		},
		taskEntries: {},
		items: [],
	};
}

test('failed snapshot replacement preserves the last successful file', async () => {
	const adapter = new MemoryAdapter();
	const store = new RegistrySnapshotStore(
		adapter,
		'projects/RTL/.workday-control/singularity-snapshot.json'
	);
	const first = snapshot('2026-07-24T12:00:00.000Z');
	await store.save(first);

	adapter.failWrites = true;
	await assert.rejects(
		store.save(snapshot('2026-07-24T13:00:00.000Z')),
		/disk full/
	);

	assert.deepEqual(await store.load(), first);
	assert.ok(adapter.folders.has('projects/RTL/.workday-control'));
});
