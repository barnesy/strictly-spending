import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { api } from '../../api';

export class ManageTaxSettingsTool implements AIToolHandler {
  name = 'manage_tax_settings';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    if (actionObj.action === 'get') {
      const currentSettings = await api.getSetting<any>('app:taxSettings');
      return {
        actionResult: { action: 'get_tax_settings' },
        data: { taxSettings: currentSettings || { hasBusiness: false, taxYear: new Date().getFullYear(), checklist: {} } }
      };
    }

    if (actionObj.action !== 'update' && actionObj.taxData) {
        // Handle fallback if they didn't pass action but passed taxData
        actionObj.action = 'update';
    }

    if (actionObj.action === 'update') {
      if (actionObj.confirmed !== true) {
        return { 
          feedbackError: 'SECURITY EXCEPTION: You attempted to modify tax settings without user confirmation. You MUST call the `request_user_confirmation` tool first. Only after the user confirms should you call this tool again with `confirmed: true`.' 
        };
      }

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

    return { feedbackError: 'Invalid action for manage_tax_settings. Must be "get" or "update".' };
  }
}
