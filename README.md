# Obsidian Singularity Plugin

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

## Installation

### Manual Installation
1. Download the latest release from [Releases](https://github.com/SVS696/obsidian-singularity/releases)
2. Extract `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/obsidian-singularity/` folder
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
2. Enter your Singularity API Token (get it from Singularity App settings)
3. Configure optional settings:
   - **Vault Name**: Override auto-detected vault name for Obsidian URLs
   - **Cache TTL**: How long to cache task data (default: 5 minutes)
   - **Badge Max Width**: Maximum width of task badges
   - **Auto Sync**: Enable/disable automatic sync of Obsidian URLs to Singularity

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

## How Sync Works

1. When a note containing `singularityapp://` URLs is modified or renamed, the plugin syncs the Obsidian URL to each referenced task
2. A unique identifier (`#sid=uuid`) is appended to each URL in frontmatter to track which link belongs to which note
3. In Singularity, each note appears as a clickable "Obsidian: Note Title" link in the task's notes

## Requirements

- Obsidian v1.0.0+
- Singularity App account with API access

## License

MIT License - see [LICENSE](LICENSE)

## Support

- Issues: [GitHub Issues](https://github.com/SVS696/obsidian-singularity/issues)
- Singularity App: [singularity.app](https://singularity.app)
