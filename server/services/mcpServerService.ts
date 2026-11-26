import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthTokenPayload } from '../middleware/authMiddleware';
import {
  canDeleteRecords,
  classifyScheduleDueState,
  formatBdtPlain,
  isValidIsoDate,
  isValidYearMonth,
  roundMoney,
  sanitizeProjectForMcp,
} from '../utils/businessLogic';
import { listActivityLogs, logActivity } from './auditService';
import {
  ServiceError,
  createCustomer,
  listAnonymizedCustomerSummaries,
} from './customerService';
import {
  createTransaction,
  deleteTransaction,
  listPayments,
  listTransactions,
  recordProjectPayment,
} from './financeService';
import {
  createPaymentSchedule,
  getPaymentScheduleById,
  linkPaymentToSchedule,
  listPaymentSchedules,
  syncDuePaymentNotifications,
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
import { getMcpBusinessAnalytics, getMcpFinancialReport } from './reportService';

export const AGENCY_MCP_INSTRUCTIONS = `# GrowDeshIT OS — Agency Operations MCP Assistant Guide

You are connected to **GrowDeshIT OS**, the internal agency operations system for GrowDeshIT. Follow these mandatory operating rules on every request so all records, financial math, and privacy guarantees remain 100% accurate:

## Core Operating Rules
1. **ID-First Conversation Rule:**
   - Always reference customers by anonymized **Customer Code** (e.g. \`CU-101\`) and projects by **Project Code** (e.g. \`PRJ-101\`).
   - NEVER guess, invent, or assume a \`customer_code\`, \`project_code\`, \`task_id\`, \`schedule_id\`, or \`transaction_id\`.
   - Always call \`list_customer_codes\`, \`list_projects\`, or \`get_project_details\` first when you need to verify an ID.

2. **Strict BDT Currency & Math Accuracy:**
   - Every monetary amount in GrowDeshIT OS is in **Bangladeshi Taka (BDT / ৳)**.
   - NEVER manually calculate or estimate balances, paid totals, dues, or profit margins. Always read the authoritative server-computed \`budget\`, \`paid_amount\`, \`due_amount\`, \`payment_percentage\`, \`payment_status\`, and report summary metrics returned by the tools.

3. **Right Tool for the Right Action:**
   - **Client payment received on a project:** Call \`record_project_payment\` (NEVER log a received payment solely as a project note). If the user also wants context saved in notes, call \`add_project_note\` in addition.
   - **New customer + new project together:** Call \`create_customer\` first, read the returned \`customer_code\`, then call \`create_project\` using that \`customer_code\`.
   - **Project status, dues, tasks, schedules, or history:** Call \`get_project_details\` for a single authoritative workspace snapshot.
   - **General agency income or expense (office rent, salaries, hosting, retainer, tools):** Call \`record_transaction\`.
   - **Profitability, dues, overdue reminders, or executive analysis:** Call \`get_business_analytics\` or \`get_financial_report\`.

4. **Zero-Error Validation & Clarification:**
   - If required parameters (such as amount, project code, category, or description) are missing or ambiguous, ask the user to clarify BEFORE calling any write tool.
   - Use strict ISO dates (\`YYYY-MM-DD\`) and year-month strings (\`YYYY-MM\`). Never fabricate dates or amounts.
   - If \`record_project_payment\` warns about an overpayment (amount exceeds remaining \`due_amount\`), confirm with the user before passing \`allow_overpayment: true\`.

5. **Strict Customer Privacy (Zero PII Policy):**
   - Customer PII (personal names, phone numbers, email addresses, company names) is NEVER returned by MCP read, list, report, or log tools.
   - \`create_customer\` is write-only for PII and intentionally returns ONLY \`customer_code\`, \`status\`, and \`created_at\`. Never attempt to read or expose personal customer details via MCP.

6. **Role-Based Permissions:**
   - Destructive tools (\`delete_project\`, \`delete_transaction\`) are restricted to \`superadmin\` accounts. \`employee\` accounts receive a permission denial logged to \`activity_logs\`.
`;

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

function errorResult(message: string, details?: Record<string, unknown>) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(details ? { error: message, ...details } : { error: message }, null, 2),
      },
    ],
  };
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function resolveProjectId(input: {
  project_id?: number;
  project_code?: string;
}): Promise<number | null> {
  if (input.project_id && Number.isInteger(input.project_id) && input.project_id > 0) {
    return input.project_id;
  }
  if (input.project_code && input.project_code.trim()) {
    return findProjectIdByCode(input.project_code.trim());
  }
  return null;
}

function formatToolError(err: unknown): ReturnType<typeof errorResult> {
  if (err instanceof ServiceError) {
    return errorResult(err.message);
  }
  if (err instanceof Error) {
    return errorResult(err.message || 'An unexpected error occurred.');
  }
  return errorResult('An unexpected error occurred while executing the tool.');
}

/**
 * Creates a user-bound GrowDeshIT OS MCP server (v2.0).
 *
 * Security & Reliability Guarantees:
 * 1. Customer PII (name, email, phone, company, raw customer CRM records) is NEVER exposed in any
 *    MCP read/list/report/log response. `create_customer` is write-only for PII and returns only
 *    the anonymized `customer_code`.
 * 2. Every tool enforces the authenticated user's role (`superadmin` vs `employee`).
 * 3. Every tool invocation (including permission denials & validation blocks) is logged to
 *    `activity_logs` with `source = 'MCP'` and zero customer PII.
 * 4. Strict server-side date, amount, ID, and overpayment validations prevent silent data errors.
 */
export function createGrowDeshMcpServer(user: AuthTokenPayload): McpServer {
  const server = new McpServer(
    {
      name: 'growdeshit-os-mcp',
      version: '2.0.0',
    },
    {
      instructions: AGENCY_MCP_INSTRUCTIONS,
    }
  );

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

  // Built-in MCP Resource exposing agency operating rules & skills
  server.registerResource(
    'agency-skills',
    'growdeshit://agency-skills',
    {
      title: 'GrowDeshIT OS Agency Operating Guide & Skills',
      description:
        'Authoritative agency operating rules, BDT finance rules, privacy constraints, and tool workflows for GrowDeshIT OS.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: AGENCY_MCP_INSTRUCTIONS,
        },
      ],
    })
  );

  // 1. Callable Operating Guide Tool (so clients that don't auto-read resources can always inspect rules)
  server.registerTool(
    'get_agency_mcp_guide',
    {
      description:
        'Read the GrowDeshIT OS operating rules, BDT financial accuracy guidelines, privacy policy, tool selection workflows, and current user role permissions. Call this if unsure how to perform an agency operation.',
      inputSchema: {},
    },
    async () => {
      await auditMcp(
        'mcp.get_agency_mcp_guide',
        'System',
        'GUIDE',
        `Loaded GrowDeshIT OS MCP operating guide (role=${user.role})`
      );
      return jsonResult({
        server: 'growdeshit-os-mcp',
        version: '2.0.0',
        currency: 'BDT',
        authenticated_role: user.role,
        can_delete_records: canDeleteRecords(user.role),
        resource_uri: 'growdeshit://agency-skills',
        operating_rules: [
          'ID-First: Always reference customers by customer_code (CU-101) and projects by project_code (PRJ-101). Verify IDs via list_customer_codes or list_projects first.',
          'BDT Math: All amounts are in BDT (৳). Never calculate balances manually—use server-computed budget, paid_amount, due_amount, and payment_percentage.',
          'Payments: Always record client payments with record_project_payment (never only add_project_note).',
          'New Customer + Project: Call create_customer first, then create_project with the returned customer_code.',
          'Validation: Ask the user before calling write tools if required fields are missing or ambiguous.',
          'Zero PII: Never expect or expose customer names, phones, emails, or company names via MCP.',
        ],
        recommended_workflows: {
          record_client_payment: [
            '1. Verify project_code via list_projects or get_project_details.',
            '2. Call record_project_payment with project_code, amount (BDT), payment_date (YYYY-MM-DD), payment_method, optional schedule_id.',
            '3. Optionally call add_project_note if additional discussion context is needed.',
          ],
          onboard_customer_and_project: [
            '1. Call create_customer (returns anonymized customer_code only).',
            '2. Call create_project using the returned customer_code and BDT budget.',
          ],
          agency_expense_or_income: [
            'Call record_transaction with type (Income|Expense), amount (BDT), category, date (YYYY-MM-DD), and description.',
          ],
          executive_analysis: [
            'Call get_business_analytics or get_financial_report (optionally filtered by month YYYY-MM or start_date/end_date).',
          ],
        },
        instructions_markdown: AGENCY_MCP_INSTRUCTIONS,
      });
    }
  );

  // 2. Customer Management (Write-Only PII, Privacy-Safe Read)
  server.registerTool(
    'create_customer',
    {
      description:
        'Create a new agency customer record (write-only for PII). Returns ONLY the anonymized customer_code, status, and created_at—customer PII is never echoed back or logged.',
      inputSchema: {
        name: z.string().trim().min(2, 'Customer name must be at least 2 characters.'),
        phone: z.string().trim().optional(),
        email: z.string().trim().email('Provide a valid email address.').optional().or(z.literal('')),
        company: z.string().trim().optional(),
        status: z.enum(['Active', 'Lead', 'Inactive']).optional(),
        notes: z.string().trim().optional(),
      },
    },
    async ({ name, phone, email, company, status, notes }) => {
      try {
        const created = await createCustomer({
          name,
          phone: phone || '',
          email: email || '',
          company: company || '',
          status: status ?? 'Active',
          notes: notes || '',
        });

        // Strictly zero PII in audit logs
        await auditMcp(
          'mcp.create_customer',
          'Customer',
          created.customer_code,
          `Created customer record ${created.customer_code} (status=${created.status}) via MCP`
        );

        // Strictly zero PII in MCP response
        return jsonResult({
          customer_code: created.customer_code,
          status: created.status,
          created_at: created.created_at,
          next_step: `Use customer_code "${created.customer_code}" when calling create_project.`,
        });
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    'list_customer_codes',
    {
      description:
        'List anonymized customer codes (CU-101, CU-102, ...) with status, project count, and BDT financial totals. Strictly excludes all customer PII (names, phones, emails, company names).',
      inputSchema: {
        status: z.enum(['All', 'Active', 'Lead', 'Inactive']).optional(),
      },
    },
    async ({ status }) => {
      try {
        const summaries = await listAnonymizedCustomerSummaries(status);
        await auditMcp(
          'mcp.list_customer_codes',
          'Customer',
          'LIST',
          `Listed ${summaries.length} anonymized customer codes via MCP (status=${status || 'All'})`
        );
        return jsonResult({
          currency: 'BDT',
          count: summaries.length,
          customers: summaries,
        });
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  // 3. Project Workspace Tools
  server.registerTool(
    'list_projects',
    {
      description:
        'List agency projects with authoritative BDT financial progress (budget, paid_amount, due_amount, payment_status) and anonymized customer_code only. Customer PII is never exposed or searchable.',
      inputSchema: {
        status: z.enum(['Pending', 'In Progress', 'Review', 'Completed', 'All']).optional(),
        customer_code: z.string().trim().optional(),
        search: z.string().trim().optional(),
      },
    },
    async ({ status, customer_code, search }) => {
      try {
        // Fetch by status only so `search` never acts as an oracle over customer PII columns
        const rawProjects = await listProjects({ status });
        const customerCodeFilter = customer_code?.trim().toUpperCase() || '';
        const safeSearch = search?.trim().toLowerCase() || '';

        const filtered = rawProjects.filter((p) => {
          if (customerCodeFilter && p.customer_code.toUpperCase() !== customerCodeFilter) {
            return false;
          }
          if (safeSearch) {
            return (
              p.project_code.toLowerCase().includes(safeSearch) ||
              p.customer_code.toLowerCase().includes(safeSearch) ||
              p.title.toLowerCase().includes(safeSearch) ||
              p.description.toLowerCase().includes(safeSearch)
            );
          }
          return true;
        });

        const sanitized = filtered.map((p) => sanitizeProjectForMcp(p));
        await auditMcp(
          'mcp.list_projects',
          'Project',
          customerCodeFilter || 'LIST',
          `Listed ${sanitized.length} projects via MCP (status=${status || 'All'})`
        );
        return jsonResult({
          currency: 'BDT',
          count: sanitized.length,
          projects: sanitized,
        });
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    'get_project_details',
    {
      description:
        'Get a complete single-call project workspace snapshot: project info, authoritative BDT financials (budget, paid_amount, due_amount, payment_percentage, payment_status), payment history, payment schedules with overdue/due-today flags, tasks checklist, and categorized notes. Customer PII is strictly stripped.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().trim().optional(),
      },
    },
    async ({ project_id, project_code }) => {
      try {
        if (!project_id && !project_code) {
          return errorResult(
            'Provide either project_code (e.g. PRJ-101) or project_id. Call list_projects first to find valid project codes.'
          );
        }

        const resolvedId = await resolveProjectId({ project_id, project_code });
        if (!resolvedId) {
          await auditMcp(
            'mcp.get_project_details',
            'Project',
            String(project_code || project_id || 'UNKNOWN'),
            'Project lookup failed: not found'
          );
          return errorResult(
            `Project "${project_code || project_id}" not found. Call list_projects to verify valid project codes.`
          );
        }

        const detail = await getProjectById(resolvedId);
        if (!detail) {
          return errorResult('Project not found. Call list_projects to verify valid project codes.');
        }

        const todayIso = todayIsoDate();
        const sanitizedProject = sanitizeProjectForMcp(detail);
        const safePayments = detail.payments.map((pm) => ({
          payment_id: pm.id,
          invoice_number: pm.invoice_number,
          project_code: detail.project_code,
          customer_code: detail.customer_code,
          milestone_title: pm.milestone_title,
          amount: roundMoney(pm.amount),
          payment_date: String(pm.payment_date).slice(0, 10),
          payment_method: pm.payment_method,
          note: pm.notes,
        }));

        const safeSchedules = detail.schedules.map((s) => {
          const dueDate = String(s.due_date).slice(0, 10);
          const dueState = classifyScheduleDueState(dueDate, s.status, todayIso);
          return {
            id: s.id,
            milestone_title: s.milestone_title,
            amount: roundMoney(s.amount),
            due_date: dueDate,
            status: s.status,
            paid_payment_id: s.paid_payment_id,
            notes: s.notes,
            is_overdue: dueState === 'Overdue',
            is_due_today: dueState === 'Due Today',
            due_state: dueState,
          };
        });

        const notesByCategoryCount = {
          'Client Discussion': detail.notes.filter((n) => n.category === 'Client Discussion').length,
          Development: detail.notes.filter((n) => n.category === 'Development').length,
          'Work/General': detail.notes.filter((n) => n.category === 'Work/General').length,
        };

        await auditMcp(
          'mcp.get_project_details',
          'Project',
          detail.project_code,
          `Viewed sanitized workspace for ${detail.project_code}`
        );

        return jsonResult({
          currency: 'BDT',
          as_of_date: todayIso,
          project: sanitizedProject,
          financials: {
            currency: 'BDT',
            budget: sanitizedProject.budget,
            paid_amount: sanitizedProject.paid_amount,
            due_amount: sanitizedProject.due_amount,
            payment_percentage: sanitizedProject.progress_percent,
            payment_status: sanitizedProject.payment_status,
          },
          payments: safePayments,
          payment_schedules: safeSchedules,
          task_summary: {
            total: detail.task_total,
            completed: detail.task_completed,
            remaining: Math.max(0, detail.task_total - detail.task_completed),
          },
          tasks: detail.tasks,
          notes_by_category_count: notesByCategoryCount,
          notes: detail.notes,
        });
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    'create_project',
    {
      description:
        'Create a new agency project linked to an existing anonymized customer_code (e.g., CU-101). Budget is in BDT. If the customer does not exist yet, call create_customer first.',
      inputSchema: {
        customer_code: z.string().trim().min(3, 'Provide a valid customer_code such as CU-101.'),
        title: z.string().trim().min(2, 'Project title must be at least 2 characters.'),
        budget: z.number().nonnegative('Budget must be 0 or greater (BDT).'),
        status: z.enum(['Pending', 'In Progress', 'Review', 'Completed']).optional(),
        start_date: z.string().trim().optional(),
        end_date: z.string().trim().optional(),
        description: z.string().trim().optional(),
      },
    },
    async ({ customer_code, title, budget, status, start_date, end_date, description }) => {
      try {
        if (start_date && !isValidIsoDate(start_date)) {
          return errorResult(`Invalid start_date "${start_date}". Use a real calendar date in YYYY-MM-DD format.`);
        }
        if (end_date && !isValidIsoDate(end_date)) {
          return errorResult(`Invalid end_date "${end_date}". Use a real calendar date in YYYY-MM-DD format.`);
        }
        if (start_date && end_date && end_date < start_date) {
          return errorResult('end_date cannot be earlier than start_date.');
        }

        const normalizedCode = customer_code.trim().toUpperCase();
        const customerId = await findCustomerIdByCode(normalizedCode);
        if (!customerId) {
          await auditMcp(
            'mcp.create_project',
            'Project',
            normalizedCode,
            `Failed to create project: customer_code ${normalizedCode} not found`
          );
          return errorResult(
            `Customer code "${normalizedCode}" not found. Call list_customer_codes to check existing codes or create_customer to register a new customer first.`
          );
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
          `Created project "${created.title}" (${normalizedCode}, Budget ${formatBdtPlain(created.budget)})`
        );

        return jsonResult({
          currency: 'BDT',
          project: detail
            ? sanitizeProjectForMcp(detail)
            : {
                id: created.id,
                project_code: created.project_code,
                customer_code: normalizedCode,
                title: created.title,
                status: created.status,
                budget: created.budget,
              },
        });
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    'update_project',
    {
      description: 'Update an existing project status, title, BDT budget, dates, or scope description.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().trim().optional(),
        title: z.string().trim().min(1).optional(),
        status: z.enum(['Pending', 'In Progress', 'Review', 'Completed']).optional(),
        budget: z.number().nonnegative().optional(),
        start_date: z.string().trim().nullable().optional(),
        end_date: z.string().trim().nullable().optional(),
        description: z.string().optional(),
      },
    },
    async ({ project_id, project_code, title, status, budget, start_date, end_date, description }) => {
      try {
        if (start_date && !isValidIsoDate(start_date)) {
          return errorResult(`Invalid start_date "${start_date}". Use a real calendar date in YYYY-MM-DD format.`);
        }
        if (end_date && !isValidIsoDate(end_date)) {
          return errorResult(`Invalid end_date "${end_date}". Use a real calendar date in YYYY-MM-DD format.`);
        }

        const resolvedId = await resolveProjectId({ project_id, project_code });
        if (!resolvedId) {
          return errorResult(
            `Project "${project_code || project_id || ''}" not found. Call list_projects to verify valid project codes.`
          );
        }

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
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    'delete_project',
    {
      description: 'Delete a project permanently. Restricted to superadmin role only.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().trim().optional(),
      },
    },
    async ({ project_id, project_code }) => {
      try {
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
        if (!resolvedId) {
          return errorResult(
            `Project "${targetLabel}" not found. Call list_projects to verify valid project codes.`
          );
        }

        const detail = await getProjectById(resolvedId);
        const code = detail?.project_code || targetLabel;
        await deleteProject(resolvedId);

        await auditMcp('mcp.delete_project', 'Project', code, `Deleted project ${code} via MCP`);

        return jsonResult({ deleted: true, project_code: code });
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  // 4. Real Project Payment Recording & Listing
  server.registerTool(
    'record_project_payment',
    {
      description:
        'Record an actual received client payment on a project in BDT. Automatically generates an invoice number, records an Income transaction in Finance, updates paid_amount and due_amount, optionally marks a linked schedule_id Paid, and guards against accidental overpayment unless allow_overpayment is true.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().trim().optional(),
        amount: z.number().positive('Payment amount must be greater than 0 BDT.'),
        payment_date: z.string().trim().optional(),
        payment_method: z.string().trim().min(1).optional(),
        milestone_title: z.string().trim().min(1).optional(),
        note: z.string().trim().optional(),
        schedule_id: z.number().int().positive().optional(),
        allow_overpayment: z.boolean().optional(),
      },
    },
    async ({
      project_id,
      project_code,
      amount,
      payment_date,
      payment_method,
      milestone_title,
      note,
      schedule_id,
      allow_overpayment,
    }) => {
      try {
        if (!project_id && !project_code) {
          return errorResult(
            'Provide either project_code (e.g. PRJ-101) or project_id. Call list_projects to verify valid project codes.'
          );
        }

        const resolvedDate = payment_date ? payment_date.trim() : todayIsoDate();
        if (!isValidIsoDate(resolvedDate)) {
          return errorResult(
            `Invalid payment_date "${resolvedDate}". Provide a valid calendar date in YYYY-MM-DD format.`
          );
        }

        const resolvedId = await resolveProjectId({ project_id, project_code });
        if (!resolvedId) {
          return errorResult(
            `Project "${project_code || project_id}" not found. Call list_projects to verify valid project codes.`
          );
        }

        const beforeDetail = await getProjectById(resolvedId);
        if (!beforeDetail) {
          return errorResult('Project not found. Call list_projects to verify valid project codes.');
        }

        // Validate optional schedule_id BEFORE inserting any payment
        let targetSchedule = null;
        if (schedule_id !== undefined) {
          targetSchedule = await getPaymentScheduleById(resolvedId, schedule_id);
          if (!targetSchedule) {
            return errorResult(
              `Payment schedule #${schedule_id} was not found on project ${beforeDetail.project_code}. Call get_project_details or list_payment_schedules to verify schedule IDs.`
            );
          }
          if (targetSchedule.status === 'Paid') {
            return errorResult(
              `Payment schedule #${schedule_id} ("${targetSchedule.milestone_title}") on ${beforeDetail.project_code} is already marked Paid.`
            );
          }
        }

        // Guard against accidental overpayment / duplicate recording
        const roundedAmount = roundMoney(amount);
        const wouldOverpay =
          beforeDetail.budget > 0 && roundedAmount > beforeDetail.due_amount;
        if (wouldOverpay && !allow_overpayment) {
          await auditMcp(
            'mcp.record_project_payment.blocked_overpayment',
            'Payment',
            beforeDetail.project_code,
            `Blocked potential overpayment of ${formatBdtPlain(roundedAmount)} on ${beforeDetail.project_code} (remaining due ${formatBdtPlain(beforeDetail.due_amount)})`
          );
          return errorResult(
            `Payment amount ${formatBdtPlain(roundedAmount)} exceeds remaining due balance ${formatBdtPlain(beforeDetail.due_amount)} for ${beforeDetail.project_code}. Confirm with the user whether this is intentional; if confirmed, retry with allow_overpayment: true.`,
            {
              project_code: beforeDetail.project_code,
              currency: 'BDT',
              current_financials: {
                budget: beforeDetail.budget,
                paid_amount: beforeDetail.paid_amount,
                due_amount: beforeDetail.due_amount,
                payment_status: beforeDetail.payment_status,
              },
              attempted_amount: roundedAmount,
              excess_amount: roundMoney(roundedAmount - beforeDetail.due_amount),
            }
          );
        }

        const resolvedMilestone =
          milestone_title?.trim() ||
          targetSchedule?.milestone_title ||
          'Project Payment';
        const resolvedMethod = payment_method?.trim() || 'Bank Transfer';
        const resolvedNote = note?.trim() || '';

        const payment = await recordProjectPayment({
          project_id: resolvedId,
          milestone_title: resolvedMilestone,
          amount: roundedAmount,
          payment_date: resolvedDate,
          payment_method: resolvedMethod,
          notes: resolvedNote,
          created_by: user.userId,
        });

        let settledSchedule: {
          id: number;
          milestone_title: string;
          amount: number;
          due_date: string;
          status: string;
        } | null = null;
        if (schedule_id !== undefined) {
          const updatedSchedule = await linkPaymentToSchedule(resolvedId, schedule_id, payment.id);
          settledSchedule = {
            id: updatedSchedule.id,
            milestone_title: updatedSchedule.milestone_title,
            amount: roundMoney(updatedSchedule.amount),
            due_date: String(updatedSchedule.due_date).slice(0, 10),
            status: updatedSchedule.status,
          };
        }

        await syncDuePaymentNotifications();
        const afterDetail = await getProjectById(resolvedId);
        const sanitizedAfter = afterDetail ? sanitizeProjectForMcp(afterDetail) : null;

        await auditMcp(
          'mcp.record_project_payment',
          'Payment',
          `${beforeDetail.project_code}/${payment.invoice_number}`,
          `Recorded payment ${payment.invoice_number} of ${formatBdtPlain(payment.amount)} (${resolvedMethod}) on ${beforeDetail.project_code}${settledSchedule ? ` [settled schedule #${settledSchedule.id}]` : ''}`
        );

        const isOverpaidAfter =
          sanitizedAfter !== null &&
          sanitizedAfter.budget > 0 &&
          sanitizedAfter.paid_amount > sanitizedAfter.budget;

        return jsonResult({
          currency: 'BDT',
          payment: {
            payment_id: payment.id,
            invoice_number: payment.invoice_number,
            project_code: payment.project_code,
            customer_code: payment.customer_code,
            milestone_title: payment.milestone_title,
            amount: roundMoney(payment.amount),
            payment_date: String(payment.payment_date).slice(0, 10),
            payment_method: payment.payment_method,
            note: payment.notes,
          },
          settled_schedule: settledSchedule,
          project_financials: sanitizedAfter
            ? {
                project_code: sanitizedAfter.project_code,
                customer_code: sanitizedAfter.customer_code,
                budget: sanitizedAfter.budget,
                paid_amount: sanitizedAfter.paid_amount,
                due_amount: sanitizedAfter.due_amount,
                payment_percentage: sanitizedAfter.progress_percent,
                payment_status: sanitizedAfter.payment_status,
              }
            : null,
          overpayment_warning: isOverpaidAfter
            ? `Total paid (${formatBdtPlain(sanitizedAfter.paid_amount)}) now exceeds project budget (${formatBdtPlain(sanitizedAfter.budget)}) by ${formatBdtPlain(sanitizedAfter.paid_amount - sanitizedAfter.budget)}.`
            : null,
        });
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    'list_project_payments',
    {
      description:
        'List recorded BDT project payments (optionally filtered by project_code or project_id). Strictly excludes all customer PII.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().trim().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ project_id, project_code, limit }) => {
      try {
        let resolvedId: number | undefined;
        if (project_id || project_code) {
          const found = await resolveProjectId({ project_id, project_code });
          if (!found) {
            return errorResult(
              `Project "${project_code || project_id}" not found. Call list_projects to verify valid project codes.`
            );
          }
          resolvedId = found;
        }

        const all = await listPayments(resolvedId);
        const maxRows = limit ?? 30;
        const sliced = all.slice(0, maxRows).map((pm) => ({
          payment_id: pm.id,
          invoice_number: pm.invoice_number,
          project_code: pm.project_code,
          project_title: pm.project_title,
          customer_code: pm.customer_code,
          milestone_title: pm.milestone_title,
          amount: roundMoney(pm.amount),
          payment_date: String(pm.payment_date).slice(0, 10),
          payment_method: pm.payment_method,
          note: pm.notes,
        }));

        const totalAmountBdt = roundMoney(
          all.reduce((sum, pm) => sum + Math.max(0, Number(pm.amount) || 0), 0)
        );

        await auditMcp(
          'mcp.list_project_payments',
          'Payment',
          project_code?.toUpperCase() || (resolvedId ? String(resolvedId) : 'ALL'),
          `Listed ${sliced.length} of ${all.length} project payments via MCP`
        );

        return jsonResult({
          currency: 'BDT',
          count: sliced.length,
          total_matching: all.length,
          total_amount_bdt: totalAmountBdt,
          payments: sliced,
        });
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  // 5. Agency Finance Management (Income & Expenses)
  server.registerTool(
    'record_transaction',
    {
      description:
        'Record an agency-wide BDT Income or Expense transaction (e.g., Office Rent, Team Salary, Cloud Hosting, Software Subscription, Consulting Income). For client payments toward a specific project budget, use record_project_payment instead.',
      inputSchema: {
        type: z.enum(['Income', 'Expense']),
        amount: z.number().positive('Transaction amount must be greater than 0 BDT.'),
        category: z.string().trim().min(2, 'Category is required (e.g., Office Rent, Salary, Hosting).'),
        date: z.string().trim().optional(),
        description: z.string().trim().min(2, 'Description is required.'),
        project_id: z.number().int().positive().optional(),
        project_code: z.string().trim().optional(),
      },
    },
    async ({ type, amount, category, date, description, project_id, project_code }) => {
      try {
        const resolvedDate = date ? date.trim() : todayIsoDate();
        if (!isValidIsoDate(resolvedDate)) {
          return errorResult(
            `Invalid date "${resolvedDate}". Provide a valid calendar date in YYYY-MM-DD format.`
          );
        }

        let resolvedProjectId: number | null = null;
        if (project_id || project_code) {
          const found = await resolveProjectId({ project_id, project_code });
          if (!found) {
            return errorResult(
              `Project "${project_code || project_id}" not found. Call list_projects to verify valid project codes.`
            );
          }
          resolvedProjectId = found;
        }

        const tx = await createTransaction({
          type,
          category,
          amount,
          transaction_date: resolvedDate,
          description,
          project_id: resolvedProjectId,
          created_by: user.userId,
        });

        await auditMcp(
          'mcp.record_transaction',
          'Transaction',
          String(tx.id),
          `Recorded ${tx.type} transaction #${tx.id} of ${formatBdtPlain(tx.amount)} (${tx.category}) on ${tx.transaction_date}`
        );

        return jsonResult({
          currency: 'BDT',
          transaction: {
            id: tx.id,
            type: tx.type,
            category: tx.category,
            amount: roundMoney(tx.amount),
            date: String(tx.transaction_date).slice(0, 10),
            description: tx.description,
            project_id: tx.project_id,
            created_at: tx.created_at,
          },
        });
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    'list_transactions',
    {
      description:
        'List agency BDT income and expense transactions with optional filters (type, category, month YYYY-MM, start_date/end_date YYYY-MM-DD) and authoritative BDT subtotals.',
      inputSchema: {
        type: z.enum(['All', 'Income', 'Expense']).optional(),
        category: z.string().trim().optional(),
        month: z.string().trim().optional(),
        start_date: z.string().trim().optional(),
        end_date: z.string().trim().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ type, category, month, start_date, end_date, limit }) => {
      try {
        if (month && !isValidYearMonth(month)) {
          return errorResult(`Invalid month "${month}". Use YYYY-MM format (e.g. 2026-11).`);
        }
        if (start_date && !isValidIsoDate(start_date)) {
          return errorResult(`Invalid start_date "${start_date}". Use YYYY-MM-DD format.`);
        }
        if (end_date && !isValidIsoDate(end_date)) {
          return errorResult(`Invalid end_date "${end_date}". Use YYYY-MM-DD format.`);
        }
        if (start_date && end_date && end_date < start_date) {
          return errorResult('end_date cannot be earlier than start_date.');
        }

        const all = await listTransactions({
          type: type && type !== 'All' ? type : undefined,
        });
        const catFilter = category?.trim().toLowerCase() || '';

        const matching = all.filter((tx) => {
          const d = String(tx.transaction_date || '').slice(0, 10);
          if (catFilter && !tx.category.toLowerCase().includes(catFilter)) return false;
          if (month && !d.startsWith(month)) return false;
          if (!month && start_date && d < start_date) return false;
          if (!month && end_date && d > end_date) return false;
          return true;
        });

        let totalIncome = 0;
        let totalExpenses = 0;
        for (const tx of matching) {
          const amt = Math.max(0, Number(tx.amount) || 0);
          if (tx.type === 'Income') totalIncome += amt;
          else if (tx.type === 'Expense') totalExpenses += amt;
        }
        const roundedIncome = roundMoney(totalIncome);
        const roundedExpenses = roundMoney(totalExpenses);

        const maxRows = limit ?? 50;
        const sliced = matching.slice(0, maxRows).map((tx) => ({
          id: tx.id,
          type: tx.type,
          category: tx.category,
          amount: roundMoney(tx.amount),
          date: String(tx.transaction_date).slice(0, 10),
          description: tx.description,
          project_id: tx.project_id,
          payment_id: tx.payment_id,
        }));

        await auditMcp(
          'mcp.list_transactions',
          'Transaction',
          month || type || 'LIST',
          `Listed ${sliced.length} of ${matching.length} transactions via MCP`
        );

        return jsonResult({
          currency: 'BDT',
          filters: {
            type: type || 'All',
            category: category || null,
            month: month || null,
            start_date: start_date || null,
            end_date: end_date || null,
          },
          count: sliced.length,
          total_matching: matching.length,
          summary: {
            total_income_bdt: roundedIncome,
            total_expenses_bdt: roundedExpenses,
            net_bdt: roundMoney(roundedIncome - roundedExpenses),
          },
          transactions: sliced,
        });
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    'delete_transaction',
    {
      description: 'Delete a finance transaction permanently. Restricted to superadmin role only.',
      inputSchema: {
        transaction_id: z.number().int().positive('Provide a valid numeric transaction_id.'),
      },
    },
    async ({ transaction_id }) => {
      try {
        if (!canDeleteRecords(user.role)) {
          await auditMcp(
            'mcp.delete_transaction.denied',
            'Transaction',
            String(transaction_id),
            `Permission denied: role "${user.role}" attempted to delete transaction #${transaction_id}`
          );
          return errorResult('Permission denied. Only superadmin users can delete transactions.');
        }

        await deleteTransaction(transaction_id);

        await auditMcp(
          'mcp.delete_transaction',
          'Transaction',
          String(transaction_id),
          `Deleted transaction #${transaction_id} via MCP`
        );

        return jsonResult({ deleted: true, transaction_id });
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  // 6. Project Tasks, Notes & Payment Schedules
  server.registerTool(
    'add_project_task',
    {
      description: 'Add a checklist task to a project.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().trim().optional(),
        title: z.string().trim().min(1, 'Task title is required.'),
        assignee_name: z.string().trim().optional(),
        due_date: z.string().trim().optional(),
      },
    },
    async ({ project_id, project_code, title, assignee_name, due_date }) => {
      try {
        if (due_date && !isValidIsoDate(due_date)) {
          return errorResult(`Invalid due_date "${due_date}". Use a real calendar date in YYYY-MM-DD format.`);
        }

        const resolvedId = await resolveProjectId({ project_id, project_code });
        if (!resolvedId) {
          return errorResult(
            `Project "${project_code || project_id || ''}" not found. Call list_projects to verify valid project codes.`
          );
        }

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
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    'toggle_project_task',
    {
      description: 'Mark a project task as completed or incomplete.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().trim().optional(),
        task_id: z.number().int().positive(),
        is_completed: z.boolean(),
      },
    },
    async ({ project_id, project_code, task_id, is_completed }) => {
      try {
        const resolvedId = await resolveProjectId({ project_id, project_code });
        if (!resolvedId) {
          return errorResult(
            `Project "${project_code || project_id || ''}" not found. Call list_projects to verify valid project codes.`
          );
        }

        const task = await toggleProjectTask(resolvedId, task_id, is_completed);
        await auditMcp(
          'mcp.toggle_project_task',
          'Task',
          String(task.id),
          `Marked task "${task.title}" as ${task.is_completed ? 'completed' : 'incomplete'}`
        );

        return jsonResult({ task });
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    'list_project_notes',
    {
      description: 'Read categorized project notes (Client Discussion, Development, Work/General).',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().trim().optional(),
        category: z.enum(['Client Discussion', 'Development', 'Work/General']).optional(),
      },
    },
    async ({ project_id, project_code, category }) => {
      try {
        const resolvedId = await resolveProjectId({ project_id, project_code });
        if (!resolvedId) {
          return errorResult(
            `Project "${project_code || project_id || ''}" not found. Call list_projects to verify valid project codes.`
          );
        }

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

        return jsonResult({ project_code: detail.project_code, count: notes.length, notes });
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    'add_project_note',
    {
      description:
        'Add a categorized note (Client Discussion, Development, or Work/General) to a project. Note: Do NOT use this tool alone to record received payments—use record_project_payment instead.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().trim().optional(),
        category: z.enum(['Client Discussion', 'Development', 'Work/General']),
        content: z.string().trim().min(1, 'Note content is required.'),
      },
    },
    async ({ project_id, project_code, category, content }) => {
      try {
        const resolvedId = await resolveProjectId({ project_id, project_code });
        if (!resolvedId) {
          return errorResult(
            `Project "${project_code || project_id || ''}" not found. Call list_projects to verify valid project codes.`
          );
        }

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
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    'list_payment_schedules',
    {
      description:
        'List upcoming, due today, overdue, or paid BDT payment schedule reminders with explicit due_state flags (customer PII is never exposed).',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().trim().optional(),
      },
    },
    async ({ project_id, project_code }) => {
      try {
        let resolvedId: number | undefined;
        if (project_id || project_code) {
          const found = await resolveProjectId({ project_id, project_code });
          if (!found) {
            return errorResult(
              `Project "${project_code || project_id}" not found. Call list_projects to verify valid project codes.`
            );
          }
          resolvedId = found;
        }

        const todayIso = todayIsoDate();
        const rawSchedules = await listPaymentSchedules(resolvedId);
        const schedules = rawSchedules.map((s) => {
          const dueDate = String(s.due_date).slice(0, 10);
          const dueState = classifyScheduleDueState(dueDate, s.status, todayIso);
          return {
            id: s.id,
            project_id: s.project_id,
            project_code: s.project_code,
            project_title: s.project_title,
            customer_code: s.customer_code,
            milestone_title: s.milestone_title,
            amount: roundMoney(s.amount),
            due_date: dueDate,
            status: s.status,
            paid_payment_id: s.paid_payment_id,
            notes: s.notes,
            is_overdue: dueState === 'Overdue',
            is_due_today: dueState === 'Due Today',
            due_state: dueState,
          };
        });

        await auditMcp(
          'mcp.list_payment_schedules',
          'PaymentSchedule',
          resolvedId ? String(resolvedId) : 'ALL',
          `Listed ${schedules.length} payment schedules via MCP`
        );

        return jsonResult({
          currency: 'BDT',
          as_of_date: todayIso,
          count: schedules.length,
          schedules,
        });
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    'add_payment_schedule',
    {
      description: 'Schedule a future or due BDT payment reminder on a project.',
      inputSchema: {
        project_id: z.number().int().positive().optional(),
        project_code: z.string().trim().optional(),
        milestone_title: z.string().trim().min(1, 'Milestone title is required.'),
        amount: z.number().positive('Scheduled amount must be greater than 0 BDT.'),
        due_date: z.string().trim(),
        notes: z.string().trim().optional(),
      },
    },
    async ({ project_id, project_code, milestone_title, amount, due_date, notes }) => {
      try {
        if (!isValidIsoDate(due_date)) {
          return errorResult(
            `Invalid due_date "${due_date}". Provide a valid calendar date in YYYY-MM-DD format.`
          );
        }

        const resolvedId = await resolveProjectId({ project_id, project_code });
        if (!resolvedId) {
          return errorResult(
            `Project "${project_code || project_id || ''}" not found. Call list_projects to verify valid project codes.`
          );
        }

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
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  // 7. Deep Financial Reports & Business Analytics
  server.registerTool(
    'get_financial_report',
    {
      description:
        'Get agency BDT financial report including Income, Expenses, Net Profit, Profit Margin %, Pending Dues, Collection Rate %, Income/Expense category breakdowns, 6-month cashflow trend, overdue/upcoming schedules, and pending project balances. Strictly excludes customer PII.',
      inputSchema: {
        month: z.string().trim().optional(),
        start_date: z.string().trim().optional(),
        end_date: z.string().trim().optional(),
      },
    },
    async ({ month, start_date, end_date }) => {
      try {
        if (month && !isValidYearMonth(month)) {
          return errorResult(`Invalid month "${month}". Use YYYY-MM format (e.g. 2026-11).`);
        }
        if (start_date && !isValidIsoDate(start_date)) {
          return errorResult(`Invalid start_date "${start_date}". Use YYYY-MM-DD format.`);
        }
        if (end_date && !isValidIsoDate(end_date)) {
          return errorResult(`Invalid end_date "${end_date}". Use YYYY-MM-DD format.`);
        }
        if (start_date && end_date && end_date < start_date) {
          return errorResult('end_date cannot be earlier than start_date.');
        }

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
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  server.registerTool(
    'get_business_analytics',
    {
      description:
        'Get deep agency BDT business analytics: profit margin %, collection rate %, income & expense category breakdowns, last 6 months cashflow trend, project status pipeline, overdue & upcoming payment schedules, and top pending-due projects sorted by highest remaining balance. Strictly zero customer PII.',
      inputSchema: {
        month: z.string().trim().optional(),
        start_date: z.string().trim().optional(),
        end_date: z.string().trim().optional(),
      },
    },
    async ({ month, start_date, end_date }) => {
      try {
        if (month && !isValidYearMonth(month)) {
          return errorResult(`Invalid month "${month}". Use YYYY-MM format (e.g. 2026-11).`);
        }
        if (start_date && !isValidIsoDate(start_date)) {
          return errorResult(`Invalid start_date "${start_date}". Use YYYY-MM-DD format.`);
        }
        if (end_date && !isValidIsoDate(end_date)) {
          return errorResult(`Invalid end_date "${end_date}". Use YYYY-MM-DD format.`);
        }
        if (start_date && end_date && end_date < start_date) {
          return errorResult('end_date cannot be earlier than start_date.');
        }

        const analytics = await getMcpBusinessAnalytics({
          month,
          startDate: start_date,
          endDate: end_date,
        });
        await auditMcp(
          'mcp.get_business_analytics',
          'Report',
          month || 'ANALYTICS',
          `Generated BDT business analytics via MCP (Net Profit ${formatBdtPlain(analytics.summary.netProfit)}, Pending Dues ${formatBdtPlain(analytics.summary.pendingDues)})`
        );
        return jsonResult(analytics);
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  // 8. Activity Logs
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
      try {
        const result = await listActivityLogs({ source, limit: limit ?? 30 }, user);
        await auditMcp(
          'mcp.list_activity_logs',
          'AuditLog',
          result.scope.toUpperCase(),
          `Viewed ${result.logs.length} activity log entries via MCP`
        );
        return jsonResult(result);
      } catch (err) {
        return formatToolError(err);
      }
    }
  );

  return server;
}
