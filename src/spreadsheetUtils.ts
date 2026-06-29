import Papa from 'papaparse';

export const parseSpreadsheet = (content: string) => {
  // Attempt JSON parse first
  try {
    const parsed = JSON.parse(content);
    if (parsed.headers && parsed.rows) {
      return parsed;
    }
  } catch {
    // ignore JSON parse error, fall back to CSV
  }

  // CSV fallback parsing using PapaParse
  const parsedCsv = Papa.parse<string[]>(content.trim(), { header: false });
  if (parsedCsv.data && parsedCsv.data.length > 0) {
    const headers = parsedCsv.data[0];
    const rows = parsedCsv.data.slice(1);
    return { headers, rows };
  }

  return null;
};
