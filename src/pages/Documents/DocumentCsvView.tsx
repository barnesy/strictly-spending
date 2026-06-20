import { useMemo, useState, useEffect } from 'react';
import {
  Box,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  Chip,
  TablePagination,
  Select,
  MenuItem
} from '@mui/material';
import Papa from 'papaparse';
import DataTable from '../../components/DataTable';

interface DocumentCsvViewProps {
  loadedContent: string;
  derivedPreviewDoc: any;
  activeTabParam: string;
  handleTabChange: (_event: React.SyntheticEvent, newValue: string) => void;
  categoriesList: any[];
  handleRecategorize: (txId: number, newCategory: string) => Promise<void>;
}

export function DocumentCsvView({
  loadedContent,
  derivedPreviewDoc,
  activeTabParam,
  handleTabChange,
  categoriesList,
  handleRecategorize
}: DocumentCsvViewProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  // Parse CSV content reactively
  const parsedCsvData = useMemo(() => {
    if (!derivedPreviewDoc || derivedPreviewDoc.type !== 'text/csv' || !loadedContent) {
      return { data: [], headers: [] };
    }
    const parsedCsv = Papa.parse(loadedContent, { header: true, skipEmptyLines: true });
    return {
      data: parsedCsv.data as any[],
      headers: parsedCsv.meta?.fields || []
    };
  }, [loadedContent, derivedPreviewDoc?.type]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const row of parsedCsvData.data) {
      if (row.Category) {
        cats.add(row.Category);
      }
    }
    return Array.from(cats).sort();
  }, [parsedCsvData.data]);

  const filteredRows = useMemo(() => {
    if (activeTabParam === 'All') {
      return parsedCsvData.data;
    }
    return parsedCsvData.data.filter(row => row.Category === activeTabParam);
  }, [parsedCsvData.data, activeTabParam]);

  const pageRows = useMemo(() => {
    return filteredRows.slice(page * pageSize, page * pageSize + pageSize);
  }, [filteredRows, page, pageSize]);

  // Reset page when dataset or active tab changes
  useEffect(() => {
    setPage(0);
  }, [filteredRows.length, activeTabParam]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Tabs
        value={activeTabParam}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': {
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '13px',
          }
        }}
      >
        <Tab label="All" value="All" />
        {uniqueCategories.map(cat => (
          <Tab key={cat} label={cat} value={cat} />
        ))}
      </Tabs>
      
      <DataTable containerSx={{ maxHeight: '60vh' }} size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Description</TableCell>
              <TableCell align="right">Original Amount</TableCell>
              <TableCell align="right">Computation Value</TableCell>
              <TableCell>Account</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pageRows.map((row, index) => {
              const rowCompVal = Number(row['Computation Value'] || row.ComputationValue || 0);
              const rowAmount = Number(row['Original Amount'] || row.OriginalAmount || row.Original_Amount || row.amount || 0);
              const txId = row.ID ? Number(row.ID) : null;
              const hasTx = txId !== null && !isNaN(txId);
              
              return (
                <TableRow key={row.ID || index} hover>
                  <TableCell>{row.Date}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    {hasTx ? (
                      <Select
                        value={row.Category}
                        onChange={async (e) => {
                          await handleRecategorize(txId!, e.target.value as string);
                        }}
                        size="small"
                        fullWidth
                      >
                        {categoriesList.map(c => (
                          <MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>
                        ))}
                      </Select>
                    ) : (
                      <Chip label={row.Category} size="small" variant="outlined" sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px` }} />
                    )}
                  </TableCell>
                  <TableCell>{row.Description}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    ${rowAmount.toFixed(2)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: rowCompVal >= 0 ? 'success.main' : 'error.main' }}>
                    {rowCompVal >= 0 ? `$${rowCompVal.toFixed(2)}` : `($${Math.abs(rowCompVal).toFixed(2)})`}
                  </TableCell>
                  <TableCell>{row.Account}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TablePagination
                count={filteredRows.length}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={pageSize}
                onRowsPerPageChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
                rowsPerPageOptions={[25, 50, 100, 250]}
                sx={{ borderTop: '1px solid rgba(0, 0, 0, 0.08)' }}
              />
            </TableRow>
          </TableFooter>
        </DataTable>
    </Box>
  );
}
