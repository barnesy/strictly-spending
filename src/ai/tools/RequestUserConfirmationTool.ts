import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';

export class RequestUserConfirmationTool implements AIToolHandler {
  name = 'request_user_confirmation';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const { options = ['Yes', 'No'] } = actionObj;

    return {
      actionResult: {
        action: 'request_user_confirmation',
        options
      }
    };
  }
}
