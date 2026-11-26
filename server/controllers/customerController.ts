import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware';
import { logActivity } from '../services/auditService';
import {
  ServiceError,
  createCustomer,
  deleteCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer,
} from '../services/customerService';

function handleServiceError(res: Response, error: unknown): void {
  if (error instanceof ServiceError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error('[CustomerController]', error);
  res.status(500).json({ error: 'Failed to process customer request.' });
}

export async function listCustomersHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const customers = await listCustomers({ search, status });
    res.json({ customers });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function getCustomerHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid customer ID.' });
      return;
    }
    const customer = await getCustomerById(id);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }
    res.json({ customer });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function createCustomerHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const customer = await createCustomer(req.body || {});
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'customer.created',
        entity_type: 'Customer',
        entity_id: customer.customer_code,
        source: 'Web',
        details: `Created customer record ${customer.customer_code} (Status: ${customer.status})`,
      });
    }
    res.status(201).json({ customer });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function updateCustomerHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid customer ID.' });
      return;
    }
    const customer = await updateCustomer(id, req.body || {});
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'customer.updated',
        entity_type: 'Customer',
        entity_id: customer.customer_code,
        source: 'Web',
        details: `Updated customer record ${customer.customer_code} (Status: ${customer.status})`,
      });
    }
    res.json({ customer });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function deleteCustomerHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid customer ID.' });
      return;
    }
    const existing = await getCustomerById(id);
    await deleteCustomer(id);
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'customer.deleted',
        entity_type: 'Customer',
        entity_id: existing?.customer_code || `CU#${id}`,
        source: 'Web',
        details: `Deleted customer record ${existing?.customer_code || `#${id}`}`,
      });
    }
    res.json({ deleted: true });
  } catch (error) {
    handleServiceError(res, error);
  }
}
