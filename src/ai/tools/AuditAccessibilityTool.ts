import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { generateAccessibilityReport } from '../../accessibilityAuditor';

export class AuditAccessibilityTool implements AIToolHandler {
  name = 'audit_accessibility';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const pathname = (context as any).location?.pathname || '/';
    const accessibilityReport = generateAccessibilityReport(pathname);

    const systemResultsMsg = `Accessibility Audit Results for ${pathname}:
- Score: ${accessibilityReport.score}
- Errors: ${accessibilityReport.issues.filter((i: any) => i.severity === 'error').length}
- Warnings: ${accessibilityReport.issues.filter((i: any) => i.severity === 'warning').length}

If you need to perform more actions, use the appropriate tool. Otherwise, summarize this accessibility report for the developer in a detailed response. Cite the exact score, error counts, and warning counts. ALL numbers in your final answer MUST be bolded and formatted to exactly the second decimal place (.00) (e.g. **95.00** score, **2.00** errors).`;

    return {
      systemResultsMsg,
      actionResult: {
        action: 'audit_accessibility',
        categories: [],
        customStart: '',
        customEnd: '',
        accessibilityReport
      }
    };
  }
}
