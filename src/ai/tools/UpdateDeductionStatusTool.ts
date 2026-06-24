import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { db } from '../../db/drizzle';
import * as schema from '../../db/schema';
import { inArray } from 'drizzle-orm';

export class UpdateDeductionStatusTool implements AIToolHandler {
  name = 'update_deduction_status';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const isBusiness = actionObj.isBusiness;
    const taxCategory = actionObj.taxCategory;
    const deductionStatus = actionObj.deductionStatus || 'confirmed';
    const filter = actionObj.filter || {};

    let updatedCount = 0;
    const txns = await db.select().from(schema.transactions);
    const matched = txns.filter(t => {
      if (filter.transactionId && t.id !== filter.transactionId) return false;
      if (filter.accountId && t.accountId !== filter.accountId) return false;
      if (filter.category && t.category !== filter.category) return false;
      if (filter.search && !t.description.toLowerCase().includes(filter.search.toLowerCase())) return false;
      return true;
    });

    const updates: Record<string, any> = {};
    if (isBusiness !== undefined) updates.isBusiness = isBusiness;
    if (taxCategory !== undefined) updates.taxCategory = taxCategory;
    if (isBusiness === false) updates.taxCategory = null; // Clear category if not business
    updates.deductionStatus = deductionStatus;

    const matchedIds = matched.map(t => t.id!).filter(Boolean);
    if (matchedIds.length > 0) {
      await db.update(schema.transactions).set(updates).where(inArray(schema.transactions.id, matchedIds));
      updatedCount = matchedIds.length;
    }

    return {
      actionResult: { action: 'update_deduction_status', updatedCount }
    };
  }
}
