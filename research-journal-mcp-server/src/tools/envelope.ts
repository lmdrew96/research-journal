import type { Project } from '../types.js';

export interface ActiveProjectInfo {
  id: string;
  name: string;
}

export function activeProjectInfo(project: Project): ActiveProjectInfo {
  return { id: project.id, name: project.name };
}

function prefix(project: Project | null): string {
  if (!project) return '[Active project: (none)]\n\n';
  return `[Active project: "${project.name}" (${project.id})]\n\n`;
}

type StructuredExtras = Record<string, unknown>;

export function ok(
  project: Project,
  text: string,
  structured?: StructuredExtras,
): {
  content: { type: 'text'; text: string }[];
  structuredContent: { activeProject: ActiveProjectInfo } & StructuredExtras;
} {
  const active = activeProjectInfo(project);
  return {
    content: [{ type: 'text' as const, text: prefix(project) + text }],
    structuredContent: { activeProject: active, ...(structured ?? {}) },
  };
}

/**
 * Success envelope for read-only tools when the user has no projects yet.
 * Returns activeProject: null in structuredContent and a friendly message
 * instead of an error.
 */
export function okEmpty(
  text: string,
  structured?: StructuredExtras,
): {
  content: { type: 'text'; text: string }[];
  structuredContent: { activeProject: null } & StructuredExtras;
} {
  return {
    content: [{ type: 'text' as const, text: prefix(null) + text }],
    structuredContent: { activeProject: null, ...(structured ?? {}) },
  };
}

export function err(
  text: string,
  project: Project | null = null,
): {
  content: { type: 'text'; text: string }[];
  isError: true;
  structuredContent: { activeProject: ActiveProjectInfo | null };
} {
  return {
    content: [{ type: 'text' as const, text: prefix(project) + text }],
    isError: true,
    structuredContent: {
      activeProject: project ? activeProjectInfo(project) : null,
    },
  };
}

export function notFound(
  entity: string,
  id: string,
  project: Project,
): ReturnType<typeof err> {
  return err(
    `${entity} ${id} not found in current project "${project.name}". ` +
      `It may exist in another project — switch projects in the app if you expected to find it here.`,
    project,
  );
}

