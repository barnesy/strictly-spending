import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { db } from '../../db/drizzle';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';

export class TaxEstimatorTool implements AIToolHandler {
  name = 'tax_estimation';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const businessTxns = await db.select().from(schema.transactions).where(eq(schema.transactions.isBusiness, true));
    
    if (businessTxns.length === 0) {
      return {
        systemResultsMsg: "No transactions flagged as business expenses/income found. Cannot estimate taxes. Advise the user to flag their 1099/freelance income first.",
        actionResult: { action: 'tax_estimation', netIncome: 0 }
      };
    }

    const store = context.dataStore;
    const catTypes = store.categories.reduce((acc, c) => ({ ...acc, [c.name.toLowerCase()]: c.type }), {} as Record<string, string>);

    let totalBusinessIncome = 0;
    let totalBusinessSpend = 0;

    for (const t of businessTxns) {
      const type = catTypes[t.category.toLowerCase()] || 'spend';
      if (type === 'income') {
        totalBusinessIncome += t.amount;
      } else if (type === 'spend') {
        totalBusinessSpend += -t.amount;
      } else {
        if (t.amount < 0) {
          totalBusinessSpend += -t.amount;
        } else {
          totalBusinessIncome += t.amount;
        }
      }
    }

    const netBusinessIncome = totalBusinessIncome - totalBusinessSpend;
    // Standard 15.3% SE tax estimation + a conservative 10% income tax buffer = 25.3%
    const estimatedTaxBurden = netBusinessIncome > 0 ? netBusinessIncome * 0.253 : 0;

    const systemResultsMsg = `Tax Estimation Results:
- Total Business Income: $${totalBusinessIncome.toFixed(2)}
- Total Business Deductions/Expenses: $${totalBusinessSpend.toFixed(2)}
- Net Business Income: $${netBusinessIncome.toFixed(2)}
- Estimated Tax Burden (SE + Basic Income Tax Buffer at ~25.3%): $${estimatedTaxBurden.toFixed(2)}

Please summarize these findings in the 'body' field. Tell the user their estimated tax burden and net business income. Set 'agent_action.action' to 'none'. ALL numbers MUST be bolded and formatted correctly. Make sure to specify this is an estimate for 1099/freelance self-employment taxes.`;

    return {
      systemResultsMsg,
      actionResult: {
        action: 'tax_estimation',
        totalBusinessIncome,
        totalBusinessSpend,
        netBusinessIncome,
        estimatedTaxBurden
      }
    };
  }
}
