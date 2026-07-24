# Singularity App Integration

Integrates [Singularity App](https://singularity.app) task manager with Obsidian. Renders task links as interactive badges and provides bidirectional sync between Obsidian notes and Singularity tasks.

## Features

### Task Badge Rendering
- **Reading View**: Singularity task links are rendered as interactive badges showing task title, status, and tags
- **Live Preview**: Real-time badge rendering while editing
- **Properties View**: Task links in frontmatter are also rendered as badges

### Bidirectional Sync
- **Auto-sync**: When you modify or rename a note containing Singularity task links, the Obsidian note URL is automatically synced to the task's notes in Singularity
- **Multiple tasks**: A single note can reference multiple Singularity tasks - each will have its own link back to Obsidian
- **Multiple notes**: Multiple notes can reference the same task - each gets a unique link in Singularity

### Task States
- Active tasks: `○` indicator
- Completed tasks: `✓` green indicator with strikethrough title
- Cancelled tasks: `✗` red indicator with "Cancelled" status

### Task Registry
- **One view for a document workflow**: Combine Markdown notes, Singularity projects, kanban columns, tags, deadlines, and external issue links
- **Entity grouping**: Notes that share a task or external issue are shown together; legacy question/check files can also attach to one unambiguous specification by filename
- **Workflow stages**: See documents being prepared, ready to publish, published, waiting, under implementation review, or needing attention
- **Consistency checks**: Detect when a task was handed to a delivery project but the external issue link is missing, or vice versa
- **Batch refresh**: Load tasks, projects, statuses, mappings, and tags in paginated batches, then recover only referenced historical tasks omitted by the list endpoint
- **Persistent snapshot**: Keep an AI-readable JSON snapshot in the vault and use it when the Singularity API is unavailable

## Installation

### Manual Installation
1. Download the latest release from [Releases](https://github.com/SVS696/obsidian-singularity/releases)
2. Extract `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/singularity-app/` folder
3. Enable the plugin in Obsidian Settings → Community plugins

### From Source
```bash
git clone https://github.com/SVS696/obsidian-singularity.git
cd obsidian-singularity
npm install
npm run build
```

## Configuration

1. Open Obsidian Settings → Singularity App Integration
2. Enter your Singularity API Token (get it from Singularity App [account](https://me.singularity-app.com/rest-tokens))
3. Configure optional settings:
   - **Vault Name**: Override auto-detected vault name for Obsidian URLs
   - **Cache TTL**: How long to cache task data (default: 5 minutes)
   - **Badge Max Width**: Maximum width of task badges
   - **Auto Sync**: Enable/disable automatic sync of Obsidian URLs to Singularity
   - **Registry Folders**: Limit the registry to selected vault folders
   - **Source Project**: Singularity project used while a document is being prepared
   - **Delivery Projects**: Projects used after publication or hand-off
   - **External Link Fields**: Frontmatter fields such as `redmine` or `jira`
   - **Waiting Tags**: Tags that move an item into the Waiting view
   - **Snapshot Path**: Vault-relative path for the persistent JSON snapshot

## Usage

### Adding Task Links

Add Singularity task links to your notes in any of these formats:

**Frontmatter (recommended):**
```yaml
---
task: singularityapp://?&page=any&id=T-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
---
```

**Inline markdown link:**
```markdown
[My Task](singularityapp://?&page=any&id=T-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
```

**Plain URL:**
```
singularityapp://?&page=any&id=T-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Multiple Tasks Per Note

You can reference multiple tasks from a single note using any frontmatter property names:

```yaml
---
parent_task: singularityapp://?&page=any&id=T-xxx
subtask: singularityapp://?&page=any&id=T-yyy
related:
  - singularityapp://?&page=any&id=T-aaa
  - singularityapp://?&page=any&id=T-bbb
---
```

All referenced tasks will have links back to this Obsidian note.

### Commands

- **Refresh cache**: Clear cached task data and reload
- **Sync current note**: Manually sync the current note's URL to Singularity
- **Open task registry**: Open the registry view
- **Refresh task registry**: Refresh all registry data and the persistent snapshot

## Persistent Snapshot

The registry writes a sanitized JSON file that contains task metadata, note
paths, workflow stages, deadlines, tags, and configured external links. It does
not contain the Singularity API token.

The snapshot is replaced only after every API list has loaded and the complete
registry has been built. If the API or the snapshot write fails, the previous
successful snapshot remains available. Cached badges are marked with a clock
indicator when they use saved data.

For shared AI workflows, configure a stable project-local path and exclude the
generated file from version control, for example:

```text
projects/My Project/.workday-control/singularity-snapshot.json
```

## How Sync Works

1. When a note containing `singularityapp://` URLs is modified or renamed, the plugin syncs the Obsidian URL to each referenced task
2. A unique identifier (`#sid=uuid`) is appended to each URL in frontmatter to track which link belongs to which note
3. In Singularity, each note appears as a clickable "Obsidian: Note Title" link in the task's notes

## Requirements

- Obsidian v1.4.4+
- Singularity App account with API access

## License

MIT License - see [LICENSE](LICENSE)

## Support

- Issues: [GitHub Issues](https://github.com/SVS696/obsidian-singularity/issues)
- Singularity App: [singularity.app](https://singularity.app)
