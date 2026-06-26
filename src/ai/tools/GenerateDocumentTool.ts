import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { db } from '../../db/drizzle';
import * as schema from '../../db/schema';
import Papa from 'papaparse';

export class GenerateDocumentTool implements AIToolHandler {
  name = 'generate_csv';

  async execute(_actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    // A hack for backward compatibility with CopilotMatcher's `lastQueryState`.
    // In a cleaner architecture, the data would be passed explicitly, but here we read it from context.
    const lastQuery = (context as any).lastQueryState || _actionObj.lastQueryState;
    if (!lastQuery) {
      return { feedbackError: "Error: Cannot generate document without a previous query_data execution. Please call 'query_data' first." };
    }

    const { start, end, cats, accts, search, minPrice, maxPrice } = lastQuery;

    try {
      let results = await db.select().from(schema.transactions);

      if (start) {
        results = results.filter(tx => tx.date >= start);
      }
      if (end) {
        results = results.filter(tx => tx.date <= end);
      }
      if (cats && cats.length > 0 && !cats.includes('all')) {
        results = results.filter(tx => cats.includes(tx.category));
      }
      if (accts && accts.length > 0 && !accts.includes('all')) {
        results = results.filter(tx => accts.includes(tx.accountId.toString()));
      }
      if (minPrice !== undefined && minPrice !== null) {
        results = results.filter(tx => tx.amount >= minPrice);
      }
      if (maxPrice !== undefined && maxPrice !== null) {
        results = results.filter(tx => tx.amount <= maxPrice);
      }

      if (search) {
        const s = search.toLowerCase();
        results = results.filter(tx => 
          (tx.description && tx.description.toLowerCase().includes(s)) ||
          (tx.category && tx.category.toLowerCase().includes(s))
        );
      }

      if (results.length === 0) {
        return { feedbackError: "No transactions matched the criteria. Cannot generate CSV." };
      }

      // Map to clean format for CSV
      const csvData = results.map(tx => ({
        ID: tx.id,
        Date: tx.date,
        Category: tx.category,
        Description: tx.description,
        'Original Amount': tx.amount,
        Account: tx.accountId
      }));

      const csvString = Papa.unparse(csvData);
      const mdDocId = crypto.randomUUID();

      // Save to database
      const filename = `Export_${new Date().toISOString().slice(0, 10)}.csv`;
      await db.insert(schema.documents).values({
        id: mdDocId,
        name: filename,
        path: `~/Documents/${filename}`,
        type: 'text/csv',
        source: 'generated',
        associatedChecklistId: null,
        createdAt: new Date().toISOString()
      }).onConflictDoNothing();

      await db.insert(schema.documentContents).values({
        id: mdDocId,
        content: csvString
      }).onConflictDoNothing();

      return {
        systemResultsMsg: `Successfully generated CSV document.`,
        actionResult: { action: 'generate_csv', documentType: 'csv' },
        data: {
          csvDocId: mdDocId
        }
      };
    } catch (e: any) {
      return { feedbackError: `Error generating CSV: ${e.message}` };
    }
  }
}
