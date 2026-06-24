import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { db } from '../../db/drizzle';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';

export class DebtOptimizationTool implements AIToolHandler {
  name = 'debt_optimization';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const allLoans = await db.select().from(schema.loans).where(eq(schema.loans.enabled, true));
    
    if (allLoans.length === 0) {
      return {
        systemResultsMsg: "No active loans or debt found in the database. Tell the user they are currently debt-free according to the system.",
        actionResult: { action: 'debt_optimization', loansCount: 0 }
      };
    }

    const totalDebt = allLoans.reduce((sum, l) => sum + l.principal, 0);
    
    // Avalanche: Sort by highest rate first
    const avalancheOrder = [...allLoans].sort((a, b) => b.rate - a.rate);
    
    // Snowball: Sort by lowest principal first
    const snowballOrder = [...allLoans].sort((a, b) => a.principal - b.principal);

    const formatList = (list: typeof allLoans) => 
      list.map((l, i) => `${i + 1}. **${l.name}**: $${l.principal.toFixed(2)} at ${l.rate.toFixed(2)}% APR`).join('\n');

    const systemResultsMsg = `Debt Optimization Results:
- Total Outstanding Debt: $${totalDebt.toFixed(2)}
- Number of Loans: ${allLoans.length}

**Avalanche Method (Mathematically optimal - saves the most interest)**:
${formatList(avalancheOrder)}

**Snowball Method (Psychologically optimal - quickest early wins)**:
${formatList(snowballOrder)}

Please summarize these findings in the 'body' field. Provide a brief explanation of both methods and ask the user which method they prefer. Set 'agent_action.action' to 'none'. ALL numbers MUST be bolded.`;

    return {
      systemResultsMsg,
      actionResult: {
        action: 'debt_optimization',
        totalDebt,
        loansCount: allLoans.length
      }
    };
  }
}
