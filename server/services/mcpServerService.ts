import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthTokenPayload } from '../middleware/authMiddleware';
import {
  canDeleteRecords,
  formatBdtPlain,
  sanitizeProjectForMcp,
} from '../utils/businessLogic';
import { listActivityLogs, logActivity } from './auditService';
import {
  createPaymentSchedule,
  listPaymentSchedules,
} from './notificationService';
import {
  addProjectNote,
  addProjectTask,
  createProject,
  deleteProject,
  findCustomerIdByCode,
  findProjectIdByCode,
  getProjectById,
  listProjects,
  toggleProjectTask,
  updateProject,
} from './projectService';
import { getMcpFinancialReport } from './reportService';

function jsonResult(payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: message }),
      },
    ],
  };
}

async function resolveProjectId(input: {
  project_id?: number;
  project_code?: string;
}): Promise<number | null> {
  if (input.project_id && Number.isInteger(input.project_id) && input.project_id > 0) {
    return input.project_id;
  }
  if (input.project_code) {
    return findProjectIdByCode(input.project_code);
  }
  return null;
}

/**
 * Creates a user-bound GrowDeshIT OS MCP server.
 *
 * Security guarantees:
 * 1. Customer PII (name, email, phone, company, raw customer CRM records) is NEVER exposed.
 *    Projects and reports only surface the anonymized `customer_code` (e.g. CU-101).
 * 2. Every tool enforces the authenticated user's role (`superadmin` vs `employee`).
 * 3. Every tool invocation (including denied attempts) is logged to `activity_logs` with source = 'MCP'.
 */
export function createGrowDeshMcpServer(user: AuthTokenPayload): McpServer {
  const server = new McpServer({
    name: 'growdeshit-os-mcp',
    version: '1.0.0',
  });

  const auditMcp = async (
    action: string,
    entityType: string,
    entityId: string,
    details: string
  ) => {
    await logActivity({
      user_id: user.userId,
      user_name: user.name,
      user_role: user.role,
      action,
      entity_type: entityType,
      entity_id: entityId,
      source: 'MCP',
      details,
    });
  };

  server.registerTool(
    'list_projects',
    {
      description:
        'List agency projects with BDT financial progress and anonymized customer_code only (customer personal information is never exposed).',
      inputSchema: {
        status: z.enum(['Pending', 'In Progress', 'Review', 'Completed', 'All']).optional(),
        search: z.string().optional(),
      },
    },
    async ({ status, search }) => {
      const projects = await listProjects({ status, search });
      const sanitized = projects.map((p) => sanitizeProjectForMcp(p));
      await auditMcp(
        'mcp.list_projects',
        'Project',
        'LIST',
        `Listed ${sanitized.length} projects via MCP (status=${status || 'All'})`
      );
      return jsonResult({
        currency: 'BDT',
        count: sanitized.length,
        projects: sanitized,
      });
    }
  );

  server.registerTool(
    'get_project_details',
    {
      description:
        'Get a single project workspace including tasks, categorized notes, payment schedules, and BDT billing summary. Customer PII is strictly stripped.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().optional(),
      },
    },
    async ({ project_id, project_code }) => {
      const resolvedId = await resolveProjectId({ project_id, project_code });
      if (!resolvedId) {
        await auditMcp(
          'mcp.get_project_details',
          'Project',
          String(project_code || project_id || 'UNKNOWN'),
          'Project lookup failed: not found'
        );
        return errorResult('Project not found. Provide a valid project_id or project_code (e.g. PRJ-101).');
      }

      const detail = await getProjectById(resolvedId);
      if (!detail) {
        return errorResult('Project not found.');
      }

      const sanitizedProject = sanitizeProjectForMcp(detail);
      const safePayments = detail.payments.map((pm) => ({
        id: pm.id,
        invoice_number: pm.invoice_number,
        milestone_title: pm.milestone_title,
        amount: pm.amount,
        payment_date: pm.payment_date,
        payment_method: pm.payment_method,
      }));
      const safeSchedules = detail.schedules.map((s) => ({
        id: s.id,
        milestone_title: s.milestone_title,
        amount: s.amount,
        due_date: s.due_date,
        status: s.status,
        notes: s.notes,
      }));

      await auditMcp(
        'mcp.get_project_details',
        'Project',
        detail.project_code,
        `Viewed sanitized workspace for ${detail.project_code}`
      );

      return jsonResult({
        currency: 'BDT',
        project: sanitizedProject,
        tasks: detail.tasks,
        notes: detail.notes,
        payments: safePayments,
        payment_schedules: safeSchedules,
      });
    }
  );

  server.registerTool(
    'create_project',
    {
      description:
        'Create a new agency project linked to an existing anonymized customer_code (e.g., CU-101). Budget is in BDT.',
      inputSchema: {
        customer_code: z.string().min(3),
        title: z.string().min(2),
        budget: z.number().nonnegative(),
        status: z.enum(['Pending', 'In Progress', 'Review', 'Completed']).optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        description: z.string().optional(),
      },
    },
    async ({ customer_code, title, budget, status, start_date, end_date, description }) => {
      const customerId = await findCustomerIdByCode(customer_code);
      if (!customerId) {
        await auditMcp(
          'mcp.create_project',
          'Project',
          customer_code,
          `Failed to create project: customer_code ${customer_code} not found`
        );
        return errorResult(`Customer code "${customer_code}" not found.`);
      }

      const created = await createProject({
        customer_id: customerId,
        title,
        budget,
        status,
        start_date: start_date ?? null,
        end_date: end_date ?? null,
        description,
      });
      const detail = await getProjectById(created.id);

      await auditMcp(
        'mcp.create_project',
        'Project',
        created.project_code,
        `Created project "${created.title}" (${customer_code.toUpperCase()}, Budget ${formatBdtPlain(created.budget)})`
      );

      return jsonResult({
        currency: 'BDT',
        project: detail ? sanitizeProjectForMcp(detail) : {
          id: created.id,
          project_code: created.project_code,
          customer_code: customer_code.toUpperCase(),
          title: created.title,
          status: created.status,
          budget: created.budget,
        },
      });
    }
  );

  server.registerTool(
    'update_project',
    {
      description: 'Update an existing project status, title, BDT budget, dates, or scope description.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().optional(),
        title: z.string().min(1).optional(),
        status: z.enum(['Pending', 'In Progress', 'Review', 'Completed']).optional(),
        budget: z.number().nonnegative().optional(),
        start_date: z.string().nullable().optional(),
        end_date: z.string().nullable().optional(),
        description: z.string().optional(),
      },
    },
    async ({ project_id, project_code, title, status, budget, start_date, end_date, description }) => {
      const resolvedId = await resolveProjectId({ project_id, project_code });
      if (!resolvedId) return errorResult('Project not found.');

      const updated = await updateProject(resolvedId, {
        title,
        status,
        budget,
        start_date,
        end_date,
        description,
      });
      const detail = await getProjectById(updated.id);

      await auditMcp(
        'mcp.update_project',
        'Project',
        updated.project_code,
        `Updated project ${updated.project_code} (status=${updated.status}, budget=${formatBdtPlain(updated.budget)})`
      );

      return jsonResult({
        currency: 'BDT',
        project: detail ? sanitizeProjectForMcp(detail) : updated,
      });
    }
  );

  server.registerTool(
    'delete_project',
    {
      description: 'Delete a project permanently. Restricted to superadmin role only.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().optional(),
      },
    },
    async ({ project_id, project_code }) => {
      const targetLabel = project_code || String(project_id || 'UNKNOWN');
      if (!canDeleteRecords(user.role)) {
        await auditMcp(
          'mcp.delete_project.denied',
          'Project',
          targetLabel,
          `Permission denied: role "${user.role}" attempted to delete project ${targetLabel}`
        );
        return errorResult('Permission denied. Only superadmin users can delete projects.');
      }

      const resolvedId = await resolveProjectId({ project_id, project_code });
      if (!resolvedId) return errorResult('Project not found.');

      const detail = await getProjectById(resolvedId);
      const code = detail?.project_code || targetLabel;
      await deleteProject(resolvedId);

      await auditMcp(
        'mcp.delete_project',
        'Project',
        code,
        `Deleted project ${code} via MCP`
      );

      return jsonResult({ deleted: true, project_code: code });
    }
  );

  server.registerTool(
    'add_project_task',
    {
      description: 'Add a checklist task to a project.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().optional(),
        title: z.string().min(1),
        assignee_name: z.string().optional(),
        due_date: z.string().optional(),
      },
    },
    async ({ project_id, project_code, title, assignee_name, due_date }) => {
      const resolvedId = await resolveProjectId({ project_id, project_code });
      if (!resolvedId) return errorResult('Project not found.');

      const detail = await getProjectById(resolvedId);
      const task = await addProjectTask(resolvedId, {
        title,
        assignee_name,
        due_date: due_date ?? null,
      });

      await auditMcp(
        'mcp.add_project_task',
        'Task',
        `${detail?.project_code || resolvedId}#${task.id}`,
        `Added task "${task.title}" to ${detail?.project_code || resolvedId}`
      );

      return jsonResult({ task });
    }
  );

  server.registerTool(
    'toggle_project_task',
    {
      description: 'Mark a project task as completed or incomplete.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().optional(),
        task_id: z.number().int().positive(),
        is_completed: z.boolean(),
      },
    },
    async ({ project_id, project_code, task_id, is_completed }) => {
      const resolvedId = await resolveProjectId({ project_id, project_code });
      if (!resolvedId) return errorResult('Project not found.');

      const task = await toggleProjectTask(resolvedId, task_id, is_completed);
      await auditMcp(
        'mcp.toggle_project_task',
        'Task',
        String(task.id),
        `Marked task "${task.title}" as ${task.is_completed ? 'completed' : 'incomplete'}`
      );

      return jsonResult({ task });
    }
  );

  server.registerTool(
    'list_project_notes',
    {
      description: 'Read categorized project notes (Client Discussion, Development, Work/General).',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().optional(),
        category: z.enum(['Client Discussion', 'Development', 'Work/General']).optional(),
      },
    },
    async ({ project_id, project_code, category }) => {
      const resolvedId = await resolveProjectId({ project_id, project_code });
      if (!resolvedId) return errorResult('Project not found.');

      const detail = await getProjectById(resolvedId);
      if (!detail) return errorResult('Project not found.');

      const notes = category
        ? detail.notes.filter((n) => n.category === category)
        : detail.notes;

      await auditMcp(
        'mcp.list_project_notes',
        'Note',
        detail.project_code,
        `Read ${notes.length} notes from ${detail.project_code}`
      );

      return jsonResult({ project_code: detail.project_code, notes });
    }
  );

  server.registerTool(
    'add_project_note',
    {
      description:
        'Add a categorized note (Client Discussion, Development, or Work/General) to a project.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().optional(),
        category: z.enum(['Client Discussion', 'Development', 'Work/General']),
        content: z.string().min(1),
      },
    },
    async ({ project_id, project_code, category, content }) => {
      const resolvedId = await resolveProjectId({ project_id, project_code });
      if (!resolvedId) return errorResult('Project not found.');

      const detail = await getProjectById(resolvedId);
      const note = await addProjectNote(resolvedId, {
        category,
        content,
        author_name: user.name,
        author_id: user.userId,
      });

      await auditMcp(
        'mcp.add_project_note',
        'Note',
        `${detail?.project_code || resolvedId}#${note.id}`,
        `Added "${category}" note to ${detail?.project_code || resolvedId}`
      );

      return jsonResult({ note });
    }
  );

  server.registerTool(
    'list_payment_schedules',
    {
      description:
        'List upcoming, due, overdue, or paid BDT payment schedule reminders (customer PII is never exposed).',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().optional(),
      },
    },
    async ({ project_id, project_code }) => {
      let resolvedId: number | undefined;
      if (project_id || project_code) {
        const found = await resolveProjectId({ project_id, project_code });
        if (!found) return errorResult('Project not found.');
        resolvedId = found;
      }

      const schedules = await listPaymentSchedules(resolvedId);
      await auditMcp(
        'mcp.list_payment_schedules',
        'PaymentSchedule',
        resolvedId ? String(resolvedId) : 'ALL',
        `Listed ${schedules.length} payment schedules via MCP`
      );

      return jsonResult({
        currency: 'BDT',
        count: schedules.length,
        schedules,
      });
    }
  );

  server.registerTool(
    'add_payment_schedule',
    {
      description: 'Schedule a future or due BDT payment reminder on a project.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().optional(),
        milestone_title: z.string().min(1),
        amount: z.number().positive(),
        due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        notes: z.string().optional(),
      },
    },
    async ({ project_id, project_code, milestone_title, amount, due_date, notes }) => {
      const resolvedId = await resolveProjectId({ project_id, project_code });
      if (!resolvedId) return errorResult('Project not found.');

      const schedule = await createPaymentSchedule({
        project_id: resolvedId,
        milestone_title,
        amount,
        due_date,
        notes,
      });

      await auditMcp(
        'mcp.add_payment_schedule',
        'PaymentSchedule',
        `${schedule.project_code}#${schedule.id}`,
        `Scheduled ${formatBdtPlain(schedule.amount)} due ${schedule.due_date} (${schedule.milestone_title})`
      );

      return jsonResult({ currency: 'BDT', schedule });
    }
  );

  server.registerTool(
    'get_financial_report',
    {
      description:
        'Get agency BDT financial summary (Income, Expenses, Net Profit, Pending Dues, monthly cashflow, project balances). Strictly excludes customer PII.',
      inputSchema: {
        month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      },
    },
    async ({ month, start_date, end_date }) => {
      const report = await getMcpFinancialReport({
        month,
        startDate: start_date,
        endDate: end_date,
      });
      await auditMcp(
        'mcp.get_financial_report',
        'Report',
        month || 'ALL',
        `Generated BDT financial report via MCP (Net Profit ${formatBdtPlain(report.summary.netProfit)})`
      );
      return jsonResult(report);
    }
  );

  server.registerTool(
    'list_activity_logs',
    {
      description:
        'List recent audit and activity logs scoped to the authenticated user role (superadmin sees all, employee sees personal activity).',
      inputSchema: {
        source: z.enum(['Web', 'MCP']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ source, limit }) => {
      const result = await listActivityLogs({ source, limit: limit ?? 30 }, user);
      await auditMcp(
        'mcp.list_activity_logs',
        'AuditLog',
        result.scope.toUpperCase(),
        `Viewed ${result.logs.length} activity log entries via MCP`
      );
      return jsonResult(result);
    }
  );

  return server;
}
