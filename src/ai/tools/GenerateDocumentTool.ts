import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { generatePnlData, generateBalanceSheetData, generateLedgerData } from '../../pnlGenerator';
import { db } from '../../db/drizzle';
import * as schema from '../../db/schema';

export class GenerateDocumentTool implements AIToolHandler {
  name = 'generate_document';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const docType = actionObj.documentType;
    if (!docType) {
      return { feedbackError: "Error: Missing 'documentType'. Cannot generate document." };
    }

    // A hack for backward compatibility with CopilotMatcher's `lastQueryState`.
    // In a cleaner architecture, the data would be passed explicitly, but here we read it from context.
    const lastQuery = (context as any).lastQueryState || actionObj.lastQueryState;
    if (!lastQuery) {
      return { feedbackError: "Error: Cannot generate document without a previous query_data execution. Please call 'query_data' first." };
    }

    const { start, end, cats, accts, search, minPrice, maxPrice } = lastQuery;

    let pnlReportMarkdown = '';
    let pnlSpreadsheetCsv = '';
    const pnlSpreadsheetDocId = crypto.randomUUID();
    const mdDocId = crypto.randomUUID();

    try {
      if (docType === 'business_pnl') {
        const { pnlReportMarkdown: compiledMd, pnlSpreadsheetCsv: compiledCsv } = await generatePnlData({
          start,
          end,
          resolvedCats: cats,
          resolvedAccts: accts,
          search: search || undefined,
          minPrice,
          maxPrice,
          markdownDocId: mdDocId,
          spreadsheetDocId: pnlSpreadsheetDocId
        });
        pnlReportMarkdown = compiledMd;
        pnlSpreadsheetCsv = compiledCsv;
      } else if (docType === 'business_balance_sheet') {
        const { balanceSheetMarkdown: compiledMd, balanceSheetCsv: compiledCsv } = await generateBalanceSheetData({
          start,
          end,
          resolvedAccts: accts,
          markdownDocId: mdDocId,
          spreadsheetDocId: pnlSpreadsheetDocId
        });
        pnlReportMarkdown = compiledMd;
        pnlSpreadsheetCsv = compiledCsv;
      } else if (docType === 'business_ledger') {
        const { ledgerMarkdown: compiledMd, ledgerCsv: compiledCsv } = await generateLedgerData({
          start,
          end,
          resolvedAccts: accts,
          markdownDocId: mdDocId,
          spreadsheetDocId: pnlSpreadsheetDocId
        });
        pnlReportMarkdown = compiledMd;
        pnlSpreadsheetCsv = compiledCsv;
      } else {
        return { feedbackError: `Error: Unknown document type '${docType}'` };
      }

      // Save to database
      const filename = `${docType}_${new Date().toISOString().slice(0, 10)}.md`;
      await db.insert(schema.documents).values({
        id: mdDocId,
        name: filename,
        path: `~/Documents/${filename}`,
        type: 'text/markdown',
        source: 'generated',
        associatedChecklistId: docType,
        createdAt: new Date().toISOString()
      }).onConflictDoNothing();

      await db.insert(schema.documentContents).values({
        id: mdDocId,
        content: pnlReportMarkdown
      }).onConflictDoNothing();

      return {
        systemResultsMsg: `Successfully generated ${docType}.`,
        actionResult: { action: 'generate_document', documentType: docType },
        data: {
          pnlReportMarkdown,
          pnlSpreadsheetCsv,
          pnlSpreadsheetDocId
        }
      };
    } catch (e: any) {
      return { feedbackError: `Error generating document: ${e.message}` };
    }
  }
}
