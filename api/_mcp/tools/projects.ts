import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readData, writeData, getActiveProjectOrNull, type McpContext, liveThemes, liveProjects } from '../store.js';
import type { AppUserData, Project } from '../../../src/types/index.js';
import { ok, okEmpty, err } from '../envelope.js';

const NO_PROJECTS_MSG =
  'No projects yet — use journal_add_project to create one.';

// Mirrors iconOptions/colorOptions in src/views/ManageProjectsView.tsx.
// Icon.tsx renders nothing for an unrecognised name, so this is an enum rather
// than a free string: an unconstrained icon would create a project with an
// invisible glyph in the sidebar.
const ICONS = [
  'brain', 'book-open', 'clipboard', 'notebook', 'search',
  'zap', 'orbit', 'flame', 'cpu', 'lightbulb', 'star',
] as const;

const DEFAULT_ICON = ICONS[0];
const DEFAULT_COLOR = '#7B61FF';

interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  isActive: boolean;
  createdAt: string;
  themeCount: number;
  questionCount: number;
  articleCount: number;
  journalEntryCount: number;
}

function summarize(project: Project, activeId: string): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    icon: project.icon,
    color: project.color,
    isActive: project.id === activeId,
    createdAt: project.createdAt,
    themeCount: liveThemes(project).length,
    questionCount: liveThemes(project).reduce((n, t) => n + t.questions.length, 0),
    articleCount: project.library.length,
    journalEntryCount: project.journal.length,
  };
}

/** "Linguistics" (id) · "Random SLA/CALL" (id) — for disambiguating errors. */
function listNames(data: AppUserData): string {
  return liveProjects(data).map((p) => `"${p.name}" (${p.id})`).join(' · ');
}

export function registerProjectTools(server: McpServer, ctx: McpContext): void {
  // --- journal_list_projects ---
  server.registerTool(
    'journal_list_projects',
    {
      title: 'List Projects',
      description:
        'Returns every top-level project with its icon, color, description, and content counts, ' +
        'and marks which one is currently active. All other journal_* tools operate on the ' +
        'active project, so call this first when you are unsure where a write will land.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
      },
    },
    async () => {
      const data = await readData(ctx.userId);
      const active = getActiveProjectOrNull(data);
      if (!active) return okEmpty(NO_PROJECTS_MSG, { projects: [] });

      const projects = liveProjects(data).map((p) => summarize(p, active.id));
      return ok(active, JSON.stringify(projects, null, 2), { projects });
    }
  );

  // --- journal_set_active_project ---
  server.registerTool(
    'journal_set_active_project',
    {
      title: 'Switch Active Project',
      description:
        'Changes which project every other journal_* tool reads and writes. ' +
        'Takes a project ID from journal_list_projects. The switch persists — it also ' +
        'changes the project selected in the web app.',
      inputSchema: z.object({
        projectId: z.string().describe('The project ID to make active'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ projectId }) => {
      const data = await readData(ctx.userId);
      const current = getActiveProjectOrNull(data);
      if (!current) return okEmpty(NO_PROJECTS_MSG, { projects: [] });

      const target = liveProjects(data).find((p) => p.id === projectId);
      if (!target) {
        return err(
          `No project with ID ${projectId}. Available: ${listNames(data)}`,
          current,
        );
      }

      if (data.activeProjectId === projectId) {
        return ok(target, `"${target.name}" is already the active project.`, {
          activeProjectId: projectId,
          changed: false,
        });
      }

      const previousName = current.name;
      data.activeProjectId = projectId;
      await writeData(ctx.userId, data);

      return ok(
        target,
        `Switched active project from "${previousName}" to "${target.name}". ` +
          `Subsequent reads and writes land in "${target.name}".`,
        { activeProjectId: projectId, changed: true },
      );
    }
  );

  // --- journal_add_project ---
  server.registerTool(
    'journal_add_project',
    {
      title: 'Create Project',
      description:
        'Creates a new top-level project — an isolated container with its own themes, ' +
        'questions, library, and journal. Makes it active by default, so anything written ' +
        'afterwards lands in it.',
      inputSchema: z.object({
        name: z.string().min(1).describe('Project name'),
        description: z.string().default('').describe('What this project is for'),
        icon: z
          .enum(ICONS)
          .default(DEFAULT_ICON)
          .describe('Sidebar icon name'),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a 6-digit hex colour like #7B61FF')
          .default(DEFAULT_COLOR)
          .describe('Accent colour as a hex string, e.g. #7B61FF'),
        setActive: z
          .boolean()
          .default(true)
          .describe('Make this the active project immediately (default true)'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ name, description, icon, color, setActive }) => {
      const data = await readData(ctx.userId);

      const project: Project = {
        id: randomUUID(),
        name,
        description,
        icon,
        color,
        createdAt: new Date().toISOString(),
        themes: [],
        questions: {},
        journal: [],
        library: [],
      };

      data.projects.push(project);
      // The app's addProject always activates the new project; match that unless
      // the caller explicitly opted out. A first project must always be active,
      // or every subsequent tool call would have nothing to resolve to.
      const activate = setActive || liveProjects(data).length === 1;
      if (activate) data.activeProjectId = project.id;

      await writeData(ctx.userId, data);

      return ok(
        activate ? project : getActiveProjectOrNull(data)!,
        `Created project "${name}" (ID: ${project.id}).` +
          (activate
            ? ' It is now the active project.'
            : ` The active project is unchanged — call journal_set_active_project with ${project.id} to write into it.`),
        { projectId: project.id, isActive: activate },
      );
    }
  );

  // --- journal_update_project ---
  server.registerTool(
    'journal_update_project',
    {
      title: 'Update Project',
      description:
        "Renames a project or changes its description, icon or color. Only the fields you " +
        'provide change. Works on any live project, not just the active one.',
      inputSchema: z.object({
        projectId: z.string().describe('The project ID to update'),
        name: z.string().min(1).optional().describe('New project name'),
        description: z.string().optional().describe('New description'),
        icon: z.enum(ICONS).optional().describe('New sidebar icon name'),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a 6-digit hex colour like #7B61FF')
          .optional()
          .describe('New accent colour as a hex string'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ projectId, name, description, icon, color }) => {
      const data = await readData(ctx.userId);
      const current = getActiveProjectOrNull(data);
      if (!current) return okEmpty(NO_PROJECTS_MSG, { projects: [] });

      const target = liveProjects(data).find((p) => p.id === projectId);
      if (!target) {
        return err(`No project with ID ${projectId}. Available: ${listNames(data)}`, current);
      }

      const changed: string[] = [];
      if (name !== undefined) {
        changed.push(`name "${target.name}" → "${name}"`);
        target.name = name;
      }
      if (description !== undefined) {
        target.description = description;
        changed.push('description');
      }
      if (icon !== undefined) {
        target.icon = icon;
        changed.push(`icon → ${icon}`);
      }
      if (color !== undefined) {
        target.color = color;
        changed.push(`color → ${color}`);
      }

      if (changed.length === 0) {
        return ok(current, 'No fields provided to update.', { projectId, changed: [] });
      }

      await writeData(ctx.userId, data);
      return ok(current, `Updated project "${target.name}" (${projectId}): ${changed.join(', ')}.`, {
        projectId,
        changed,
      });
    }
  );

  // --- journal_delete_project ---
  server.registerTool(
    'journal_delete_project',
    {
      title: 'Delete Project',
      description:
        'Soft-deletes a project, matching the app: it disappears from every read but keeps its ' +
        'whole subtree, so journal_restore_project (or Recently deleted in Manage Projects) ' +
        'brings it back intact. Refuses to delete the last remaining project. If the deleted ' +
        'project was active, another live project becomes active — the result says which.',
      inputSchema: z.object({
        projectId: z.string().describe('The project ID to delete'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ projectId }) => {
      const data = await readData(ctx.userId);
      const current = getActiveProjectOrNull(data);
      if (!current) return okEmpty(NO_PROJECTS_MSG, { projects: [] });

      const target = liveProjects(data).find((p) => p.id === projectId);
      if (!target) {
        return err(`No project with ID ${projectId}. Available: ${listNames(data)}`, current);
      }
      // Every other tool resolves against an active project, so the last one
      // cannot go — the same guard as deleteProject in the app.
      if (liveProjects(data).length <= 1) {
        return err(
          `"${target.name}" is the only project, so it was not deleted. Create another project first.`,
          current,
        );
      }

      target.deletedAt = new Date().toISOString();
      const wasActive = data.activeProjectId === projectId;
      if (wasActive) data.activeProjectId = liveProjects(data)[0].id;
      await writeData(ctx.userId, data);

      const nowActive = getActiveProjectOrNull(data)!;
      return ok(
        nowActive,
        `Deleted project "${target.name}" (${projectId}). Restore it with journal_restore_project.` +
          (wasActive ? ` "${nowActive.name}" is now the active project.` : ''),
        { deletedProjectId: projectId, activeProjectId: nowActive.id },
      );
    }
  );

  // --- journal_restore_project ---
  server.registerTool(
    'journal_restore_project',
    {
      title: 'Restore Project',
      description:
        'Restores a soft-deleted project with everything it held, and makes it the active ' +
        'project, matching the app. Deleted project IDs are listed in the error when the ID ' +
        'given is not a deleted project.',
      inputSchema: z.object({
        projectId: z.string().describe('The deleted project ID to restore'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ projectId }) => {
      const data = await readData(ctx.userId);
      const current = getActiveProjectOrNull(data);
      if (!current) return okEmpty(NO_PROJECTS_MSG, { projects: [] });

      const deleted = (data.projects ?? []).filter((p) => p.deletedAt);
      const target = deleted.find((p) => p.id === projectId);
      if (!target) {
        const list = deleted.map((p) => `"${p.name}" (${p.id})`).join(' · ');
        return err(
          `No deleted project with ID ${projectId}. ` +
            (list ? `Deleted projects: ${list}` : 'There are no deleted projects.'),
          current,
        );
      }

      target.deletedAt = null;
      data.activeProjectId = projectId;
      await writeData(ctx.userId, data);

      return ok(target, `Restored project "${target.name}" (${projectId}). It is now the active project.`, {
        projectId,
        activeProjectId: projectId,
      });
    }
  );
}
