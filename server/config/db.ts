import mysql, { Pool } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import type {
  ActivitySource,
  CustomerStatus,
  NoteCategory,
  PaymentScheduleStatus,
  ProjectStatus,
  TransactionType,
  UserRole,
} from '../utils/businessLogic';

export interface UserRecord {
  id: number;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
}

export interface CustomerRecord {
  id: number;
  customer_code: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  status: CustomerStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectRecord {
  id: number;
  project_code: string;
  customer_id: number;
  title: string;
  status: ProjectStatus;
  budget: number;
  start_date: string | null;
  end_date: string | null;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectTaskRecord {
  id: number;
  project_id: number;
  title: string;
  assignee_name: string;
  assignee_id: number | null;
  is_completed: boolean;
  due_date: string | null;
  created_at: string;
}

export interface ProjectNoteRecord {
  id: number;
  project_id: number;
  category: NoteCategory;
  content: string;
  author_name: string;
  author_id: number | null;
  created_at: string;
}

export interface ProjectPaymentRecord {
  id: number;
  invoice_number: string;
  project_id: number;
  milestone_title: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  notes: string;
  created_at: string;
}

export interface PaymentScheduleRecord {
  id: number;
  project_id: number;
  milestone_title: string;
  amount: number;
  due_date: string;
  status: PaymentScheduleStatus;
  paid_payment_id: number | null;
  notes: string;
  created_at: string;
}

export interface NotificationRecord {
  id: number;
  type: 'payment_due' | 'system';
  title: string;
  message: string;
  project_id: number | null;
  schedule_id: number | null;
  amount: number | null;
  due_date: string | null;
  is_read: boolean;
  created_at: string;
}

export interface TransactionRecord {
  id: number;
  type: TransactionType;
  category: string;
  amount: number;
  transaction_date: string;
  description: string;
  project_id: number | null;
  payment_id: number | null;
  created_by: number | null;
  created_at: string;
}

export interface ActivityLogRecord {
  id: number;
  user_id: number | null;
  user_name: string;
  user_role: UserRole | 'system';
  action: string;
  entity_type: string;
  entity_id: string;
  source: ActivitySource;
  details: string;
  created_at: string;
}

export interface McpTokenRecord {
  id: number;
  user_id: number;
  label: string;
  token_prefix: string;
  token_hash: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface MemoryStore {
  users: UserRecord[];
  customers: CustomerRecord[];
  projects: ProjectRecord[];
  projectTasks: ProjectTaskRecord[];
  projectNotes: ProjectNoteRecord[];
  projectPayments: ProjectPaymentRecord[];
  paymentSchedules: PaymentScheduleRecord[];
  notifications: NotificationRecord[];
  transactions: TransactionRecord[];
  activityLogs: ActivityLogRecord[];
  mcpTokens: McpTokenRecord[];
  seq: {
    users: number;
    customers: number;
    projects: number;
    projectTasks: number;
    projectNotes: number;
    projectPayments: number;
    paymentSchedules: number;
    notifications: number;
    transactions: number;
    activityLogs: number;
    mcpTokens: number;
  };
}

let mysqlPool: Pool | null = null;
let mysqlActive = false;

function createSeedMemoryStore(): MemoryStore {
  const todayIso = new Date().toISOString().slice(0, 10);
  const pastDate = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10);
  const futureDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  return {
    users: [],
    customers: [
      {
        id: 1,
        customer_code: 'CU-101',
        name: 'Tariq Rahman',
        company: 'Bengal Craft Apparel',
        phone: '+880 1711-240910',
        email: 'tariq@bengalcraft.com',
        status: 'Active',
        notes: 'Prefers weekly milestone reviews every Tuesday at 3 PM. Expanding online storefront.',
        created_at: '2026-09-12T09:15:00.000Z',
        updated_at: '2026-11-18T11:30:00.000Z',
      },
      {
        id: 2,
        customer_code: 'CU-102',
        name: 'Nadia Chowdhury',
        company: 'MedCare Diagnostics',
        phone: '+880 1819-552104',
        email: 'nadia@medcarediag.com',
        status: 'Active',
        notes: 'Requires patient booking portal and automated SMS appointment alerts.',
        created_at: '2026-10-02T10:00:00.000Z',
        updated_at: '2026-11-20T14:00:00.000Z',
      },
      {
        id: 3,
        customer_code: 'CU-103',
        name: 'Daniel Brooks',
        company: 'Northstar SaaS Labs',
        phone: '+880 1715-890332',
        email: 'daniel@northstarlabs.io',
        status: 'Active',
        notes: 'Retainer partner for marketing site engineering and conversion analytics.',
        created_at: '2026-10-19T15:20:00.000Z',
        updated_at: '2026-11-21T09:00:00.000Z',
      },
      {
        id: 4,
        customer_code: 'CU-104',
        name: 'Farhana Karim',
        company: 'DhakaRoast Coffee Co.',
        phone: '+880 1912-884312',
        email: 'farhana@dhakaroast.com',
        status: 'Lead',
        notes: 'Requested proposal for subscription roast club & mobile loyalty PWA.',
        created_at: '2026-11-10T08:45:00.000Z',
        updated_at: '2026-11-22T16:10:00.000Z',
      },
    ],
    projects: [
      {
        id: 1,
        project_code: 'PRJ-101',
        customer_id: 1,
        title: 'Multi-Currency E-Commerce Storefront',
        status: 'In Progress',
        budget: 240000,
        start_date: '2026-10-01',
        end_date: '2026-12-15',
        description: 'Custom headless storefront with BDT pricing, inventory sync, and Steadfast courier webhooks.',
        created_at: '2026-10-01T09:00:00.000Z',
        updated_at: '2026-11-22T10:00:00.000Z',
      },
      {
        id: 2,
        project_code: 'PRJ-102',
        customer_id: 2,
        title: 'Patient Appointment & Lab Report Portal',
        status: 'Review',
        budget: 310000,
        start_date: '2026-10-10',
        end_date: '2026-11-30',
        description: 'Web portal for diagnostic bookings, doctor schedules, and PDF lab report delivery.',
        created_at: '2026-10-10T10:30:00.000Z',
        updated_at: '2026-11-23T12:15:00.000Z',
      },
      {
        id: 3,
        project_code: 'PRJ-103',
        customer_id: 3,
        title: 'Q4 Product Launch Website & Docs',
        status: 'Completed',
        budget: 160000,
        start_date: '2026-09-20',
        end_date: '2026-11-05',
        description: 'High-speed marketing website, interactive pricing calculator, and developer documentation.',
        created_at: '2026-09-20T14:00:00.000Z',
        updated_at: '2026-11-06T17:00:00.000Z',
      },
      {
        id: 4,
        project_code: 'PRJ-104',
        customer_id: 4,
        title: 'Coffee Subscription PWA Discovery',
        status: 'Pending',
        budget: 120000,
        start_date: '2026-12-01',
        end_date: '2027-01-20',
        description: 'UX wireframes, recurring billing flow, and installable mobile ordering app.',
        created_at: '2026-11-18T11:00:00.000Z',
        updated_at: '2026-11-22T11:00:00.000Z',
      },
    ],
    projectTasks: [
      {
        id: 1,
        project_id: 1,
        title: 'Finalize checkout bKash & SSLCommerz gateway flow',
        assignee_name: 'Rafiq Hasan',
        assignee_id: null,
        is_completed: true,
        due_date: '2026-11-15',
        created_at: '2026-10-05T09:00:00.000Z',
      },
      {
        id: 2,
        project_id: 1,
        title: 'Integrate Steadfast & Pathao delivery fee calculator',
        assignee_name: 'Sadia Islam',
        assignee_id: null,
        is_completed: false,
        due_date: '2026-11-29',
        created_at: '2026-10-18T10:30:00.000Z',
      },
      {
        id: 3,
        project_id: 1,
        title: 'Run mobile Lighthouse & PWA audit before staging handoff',
        assignee_name: 'Mehedi Karim',
        assignee_id: null,
        is_completed: false,
        due_date: '2026-12-08',
        created_at: '2026-11-02T14:00:00.000Z',
      },
      {
        id: 4,
        project_id: 2,
        title: 'Verify encrypted PDF report download links',
        assignee_name: 'Rafiq Hasan',
        assignee_id: null,
        is_completed: true,
        due_date: '2026-11-20',
        created_at: '2026-11-01T11:00:00.000Z',
      },
      {
        id: 5,
        project_id: 2,
        title: 'Client UAT walkthrough with clinic receptionists',
        assignee_name: 'Sadia Islam',
        assignee_id: null,
        is_completed: false,
        due_date: '2026-11-28',
        created_at: '2026-11-12T15:00:00.000Z',
      },
    ],
    projectNotes: [
      {
        id: 1,
        project_id: 1,
        category: 'Client Discussion',
        content: 'Client confirmed VAT breakdown must appear on order summary before payment gateway handoff.',
        author_name: 'Account Lead',
        author_id: null,
        created_at: '2026-11-14T10:20:00.000Z',
      },
      {
        id: 2,
        project_id: 1,
        category: 'Development',
        content: 'Product catalog query optimized with composite index on (category_id, is_published). Response time dropped to 38ms.',
        author_name: 'Lead Engineer',
        author_id: null,
        created_at: '2026-11-19T16:40:00.000Z',
      },
      {
        id: 3,
        project_id: 1,
        category: 'Work/General',
        content: 'Brand photography ZIP uploaded to shared drive; hero banner cropped for 16:9 and 4:3 placements.',
        author_name: 'UI Designer',
        author_id: null,
        created_at: '2026-11-20T09:10:00.000Z',
      },
      {
        id: 4,
        project_id: 2,
        category: 'Client Discussion',
        content: 'Clinic director approved dark-teal print styling for lab report headers and doctor signatures.',
        author_name: 'Account Lead',
        author_id: null,
        created_at: '2026-11-21T13:05:00.000Z',
      },
      {
        id: 5,
        project_id: 2,
        category: 'Development',
        content: 'SMS gateway webhook retries configured with exponential backoff up to 3 attempts.',
        author_name: 'Backend Engineer',
        author_id: null,
        created_at: '2026-11-22T11:45:00.000Z',
      },
    ],
    projectPayments: [
      {
        id: 1,
        invoice_number: 'INV-1001',
        project_id: 1,
        milestone_title: 'Milestone 1 — Discovery & UI Architecture (50%)',
        amount: 120000,
        payment_date: '2026-10-03',
        payment_method: 'Bank Transfer',
        notes: 'Initial kickoff deposit received in company account.',
        created_at: '2026-10-03T10:00:00.000Z',
      },
      {
        id: 2,
        invoice_number: 'INV-1002',
        project_id: 2,
        milestone_title: 'Milestone 1 — Kickoff & Database Architecture',
        amount: 125000,
        payment_date: '2026-10-12',
        payment_method: 'Bank Transfer',
        notes: 'Cleared via BRAC Bank corporate transfer.',
        created_at: '2026-10-12T12:00:00.000Z',
      },
      {
        id: 3,
        invoice_number: 'INV-1003',
        project_id: 2,
        milestone_title: 'Milestone 2 — Beta Staging Delivery',
        amount: 100000,
        payment_date: '2026-11-10',
        payment_method: 'Bank Transfer',
        notes: 'Second milestone approved after doctor portal demo.',
        created_at: '2026-11-10T14:30:00.000Z',
      },
      {
        id: 4,
        invoice_number: 'INV-1004',
        project_id: 3,
        milestone_title: 'Full Project Settlement',
        amount: 160000,
        payment_date: '2026-11-06',
        payment_method: 'Wire Transfer',
        notes: 'Final launch handover completed.',
        created_at: '2026-11-06T17:15:00.000Z',
      },
    ],
    paymentSchedules: [
      {
        id: 1,
        project_id: 2,
        milestone_title: 'Final UAT & Production Deployment Balance',
        amount: 85000,
        due_date: pastDate,
        status: 'Pending',
        paid_payment_id: null,
        notes: 'Final settlement upon clinic sign-off.',
        created_at: '2026-11-01T09:00:00.000Z',
      },
      {
        id: 2,
        project_id: 1,
        milestone_title: 'Milestone 2 — Checkout & Courier Integration',
        amount: 60000,
        due_date: todayIso,
        status: 'Pending',
        paid_payment_id: null,
        notes: 'Scheduled for staging demo completion.',
        created_at: '2026-11-05T10:00:00.000Z',
      },
      {
        id: 3,
        project_id: 1,
        milestone_title: 'Final Launch Handover',
        amount: 60000,
        due_date: futureDate,
        status: 'Pending',
        paid_payment_id: null,
        notes: 'Due on production domain go-live.',
        created_at: '2026-11-05T10:05:00.000Z',
      },
    ],
    notifications: [],
    transactions: [
      {
        id: 1,
        type: 'Income',
        category: 'Project Payment',
        amount: 120000,
        transaction_date: '2026-10-03',
        description: 'INV-1001 · Multi-Currency E-Commerce Storefront (Milestone 1)',
        project_id: 1,
        payment_id: 1,
        created_by: null,
        created_at: '2026-10-03T10:00:00.000Z',
      },
      {
        id: 2,
        type: 'Income',
        category: 'Project Payment',
        amount: 125000,
        transaction_date: '2026-10-12',
        description: 'INV-1002 · Patient Appointment & Lab Report Portal (Milestone 1)',
        project_id: 2,
        payment_id: 2,
        created_by: null,
        created_at: '2026-10-12T12:00:00.000Z',
      },
      {
        id: 3,
        type: 'Expense',
        category: 'Team & Payroll',
        amount: 95000,
        transaction_date: '2026-10-28',
        description: 'October core engineering & design payroll',
        project_id: null,
        payment_id: null,
        created_by: null,
        created_at: '2026-10-28T16:00:00.000Z',
      },
      {
        id: 4,
        type: 'Income',
        category: 'Project Payment',
        amount: 160000,
        transaction_date: '2026-11-06',
        description: 'INV-1004 · Q4 Product Launch Website & Docs (Full Settlement)',
        project_id: 3,
        payment_id: 4,
        created_by: null,
        created_at: '2026-11-06T17:15:00.000Z',
      },
      {
        id: 5,
        type: 'Income',
        category: 'Project Payment',
        amount: 100000,
        transaction_date: '2026-11-10',
        description: 'INV-1003 · Patient Appointment & Lab Report Portal (Milestone 2)',
        project_id: 2,
        payment_id: 3,
        created_by: null,
        created_at: '2026-11-10T14:30:00.000Z',
      },
      {
        id: 6,
        type: 'Expense',
        category: 'Hosting & Cloud',
        amount: 16500,
        transaction_date: '2026-11-01',
        description: 'Hostinger Business Hosting + Staging VPS renewal',
        project_id: null,
        payment_id: null,
        created_by: null,
        created_at: '2026-11-01T08:00:00.000Z',
      },
      {
        id: 7,
        type: 'Expense',
        category: 'Software & Tools',
        amount: 19200,
        transaction_date: '2026-11-05',
        description: 'Figma Organization, GitHub Team, and Linear seats',
        project_id: null,
        payment_id: null,
        created_by: null,
        created_at: '2026-11-05T09:30:00.000Z',
      },
      {
        id: 8,
        type: 'Expense',
        category: 'Team & Payroll',
        amount: 118000,
        transaction_date: '2026-11-15',
        description: 'Mid-month contractor & core team disbursements',
        project_id: null,
        payment_id: null,
        created_by: null,
        created_at: '2026-11-15T16:00:00.000Z',
      },
    ],
    activityLogs: [
      {
        id: 1,
        user_id: null,
        user_name: 'System',
        user_role: 'system',
        action: 'payment.recorded',
        entity_type: 'Payment',
        entity_id: 'INV-1003',
        source: 'Web',
        details: 'Recorded Milestone 2 payment of ৳ 1,00,000 for PRJ-102',
        created_at: '2026-11-10T14:30:00.000Z',
      },
      {
        id: 2,
        user_id: null,
        user_name: 'System',
        user_role: 'system',
        action: 'project.created',
        entity_type: 'Project',
        entity_id: 'PRJ-104',
        source: 'Web',
        details: 'Created Coffee Subscription PWA Discovery (Budget ৳ 1,20,000)',
        created_at: '2026-11-18T11:00:00.000Z',
      },
    ],
    mcpTokens: [],
    seq: {
      users: 1,
      customers: 5,
      projects: 5,
      projectTasks: 6,
      projectNotes: 6,
      projectPayments: 5,
      paymentSchedules: 4,
      notifications: 1,
      transactions: 9,
      activityLogs: 3,
      mcpTokens: 1,
    },
  };
}

export const memoryStore: MemoryStore = createSeedMemoryStore();

export async function initializeDatabase(): Promise<{ mode: 'mysql' | 'memory' }> {
  const host = process.env.DB_HOST?.trim();
  const user = process.env.DB_USER?.trim();
  const database = process.env.DB_NAME?.trim();

  if (host && user && database) {
    try {
      mysqlPool = mysql.createPool({
        host,
        port: Number(process.env.DB_PORT || 3306),
        user,
        password: process.env.DB_PASSWORD || '',
        database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        decimalNumbers: true,
      });

      const connection = await mysqlPool.getConnection();
      await connection.ping();
      connection.release();
      mysqlActive = true;
      await bootstrapEnvSuperadmin();
      console.log(`[GrowDeshIT OS] Connected to MySQL database "${database}" on ${host}.`);
      return { mode: 'mysql' };
    } catch (error) {
      console.error(
        '[GrowDeshIT OS] MySQL connection failed, falling back to local preview store:',
        error
      );
      mysqlPool = null;
      mysqlActive = false;
    }
  }

  await bootstrapEnvSuperadmin();
  console.log(
    '[GrowDeshIT OS] Running with built-in preview store (configure DB_HOST/DB_USER/DB_NAME for MySQL).'
  );
  return { mode: 'memory' };
}

async function bootstrapEnvSuperadmin(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!adminEmail || !adminPassword) {
    return;
  }

  const adminName = process.env.ADMIN_NAME?.trim() || 'Super Admin';
  const adminPhone = process.env.ADMIN_PHONE?.trim() || '+880 1700-000000';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  if (mysqlActive && mysqlPool) {
    const [rows] = await mysqlPool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [
      adminEmail,
    ]);
    const existing = rows as Array<{ id: number }>;
    if (existing.length === 0) {
      await mysqlPool.execute(
        'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [adminName, adminEmail, adminPhone, passwordHash, 'superadmin']
      );
    } else {
      await mysqlPool.execute('UPDATE users SET password_hash = ?, role = ? WHERE id = ?', [
        passwordHash,
        'superadmin',
        existing[0].id,
      ]);
    }
    return;
  }

  const existing = memoryStore.users.find((u) => u.email.toLowerCase() === adminEmail);
  if (!existing) {
    memoryStore.users.push({
      id: memoryStore.seq.users++,
      name: adminName,
      email: adminEmail,
      phone: adminPhone,
      password_hash: passwordHash,
      role: 'superadmin',
      created_at: new Date().toISOString(),
    });
  } else {
    existing.password_hash = passwordHash;
    existing.role = 'superadmin';
  }
}

export function isMysqlMode(): boolean {
  return mysqlActive && mysqlPool !== null;
}

export function getPool(): Pool {
  if (!mysqlPool) {
    throw new Error('MySQL pool is not initialized.');
  }
  return mysqlPool;
}
