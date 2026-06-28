import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { api } from '../../api';
import Papa from 'papaparse';

export class ExportTransactionsTool implements AIToolHandler {
  name = 'export_transactions';

  async execute(_actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const lastQuery = (context as any).lastQueryState || _actionObj.lastQueryState;
    if (!lastQuery) {
      return { feedbackError: "Error: Cannot generate document without a previous query_data execution. Please call 'query_data' first." };
    }

    const { start, end, cats, accts, search, minPrice, maxPrice } = lastQuery;

    try {
      let results = await api.getTransactions();

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
      const artifactId = crypto.randomUUID();

      const filename = `Export_${new Date().toISOString().slice(0, 10)}.csv`;
      
      await api.putArtifact({
        id: artifactId,
        title: filename,
        type: 'spreadsheet',
        source: 'generated',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: csvString
      });

      return {
        systemResultsMsg: `Successfully created artifact '${filename}' with ID: ${artifactId}.`,
        actionResult: { action: 'create_artifact', artifactId, title: filename, type: 'spreadsheet' },
        data: {
          artifactId
        }
      };
    } catch (e: any) {
      return { feedbackError: `Error generating CSV: ${e.message}` };
    }
  }
}
