import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { api } from '../../api';

export class UpdateTaxSettingsTool implements AIToolHandler {
  name = 'update_tax_settings';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const currentSettings = await api.getSetting<any>('app:taxSettings');
    const baseValue = currentSettings || { checklist: {}, hasBusiness: false, taxYear: new Date().getFullYear() };
    
    if (actionObj.taxData) {
      const merged = { ...baseValue };
      for (const key of Object.keys(actionObj.taxData)) {
        if (typeof actionObj.taxData[key] === 'object' && !Array.isArray(actionObj.taxData[key]) && actionObj.taxData[key] !== null) {
          merged[key] = { ...(merged[key] || {}), ...actionObj.taxData[key] };
        } else {
          merged[key] = actionObj.taxData[key];
        }
      }
      await api.putSetting('app:taxSettings', merged);
    }

    return {
      actionResult: { action: 'update_tax_settings', taxData: actionObj.taxData }
    };
  }
}
