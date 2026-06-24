import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { db } from '../../db/drizzle';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';

export class UpdateTaxSettingsTool implements AIToolHandler {
  name = 'update_tax_settings';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const currentSettings = await (await db.select().from(schema.settings).where(eq(schema.settings.key, 'app:taxSettings')))[0];
    const baseValue = (currentSettings?.value as any) || { checklist: {}, hasBusiness: false, taxYear: new Date().getFullYear() };
    
    if (actionObj.taxData) {
      const merged = { ...baseValue };
      for (const key of Object.keys(actionObj.taxData)) {
        if (typeof actionObj.taxData[key] === 'object' && !Array.isArray(actionObj.taxData[key]) && actionObj.taxData[key] !== null) {
          merged[key] = { ...(merged[key] || {}), ...actionObj.taxData[key] };
        } else {
          merged[key] = actionObj.taxData[key];
        }
      }
      await db.insert(schema.settings).values({ key: 'app:taxSettings', value: merged }).onConflictDoNothing();
    }

    return {
      actionResult: { action: 'update_tax_settings', taxData: actionObj.taxData }
    };
  }
}
