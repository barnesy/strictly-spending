import { useState } from 'react';
import {
  Box,
  Typography,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
  TablePagination,
  useTheme,
  TextField,
  Select,
  MenuItem,
  alpha,
  Button,
  Drawer,
  useMediaQuery
} from '@mui/material';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle
} from 'react-resizable-panels';
import DataTable from '../../components/DataTable';

interface DocumentAuditViewProps {
  derivedPreviewDoc: any;
  pnlSummary: any;
  revenueCats: string[];
  expenseCats: string[];
  selectedAuditCat: string;
  setSelectedAuditCat: (cat: string) => void;
  auditSearchQuery: string;
  setAuditSearchQuery: (query: string) => void;
  paginatedAuditTxns: any[];
  auditedTxns: any[];
  auditPage: number;
  setAuditPage: (page: number) => void;
  auditPageSize: number;
  setAuditPageSize: (size: number) => void;
  categoriesList: any[];
  handleRecategorize: (txId: number, newCategory: string) => Promise<void>;
  handleExport: (format: 'csv' | 'md') => Promise<void>;
}

export function DocumentAuditView({
  derivedPreviewDoc,
  pnlSummary,
  revenueCats,
  expenseCats,
  selectedAuditCat,
  setSelectedAuditCat,
  auditSearchQuery,
  setAuditSearchQuery,
  paginatedAuditTxns,
  auditedTxns,
  auditPage,
  setAuditPage,
  auditPageSize,
  setAuditPageSize,
  categoriesList,
  handleRecategorize,
  handleExport
}: DocumentAuditViewProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [showFilters, setShowFilters] = useState(isDesktop);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minHeight: 0 }}>
      {/* Top Action buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button variant="outlined" size="small" onClick={() => setShowFilters(!showFilters)} sx={{ borderRadius: `${theme.shape.borderRadius}px`, textTransform: 'none', fontWeight: 600 }}>
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </Button>
          <Typography variant="body2" color="text.secondary">
            Auditing statements for period: <strong>{String(derivedPreviewDoc.metadata.start)}</strong> to <strong>{String(derivedPreviewDoc.metadata.end)}</strong>
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => handleExport('md')}
            sx={{ borderRadius: `${theme.shape.borderRadius}px`, textTransform: 'none', fontWeight: 600 }}
          >
            Export as Markdown
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={() => handleExport('csv')}
            sx={{ borderRadius: `${theme.shape.borderRadius}px`, textTransform: 'none', fontWeight: 600 }}
          >
            Export as CSV
          </Button>
        </Box>
      </Box>

      {/* Resizable Audit Panels */}
      {isDesktop ? (
        <PanelGroup
          orientation="horizontal"
          style={{
            flex: 1,
            minHeight: 0,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: `${theme.shape.borderRadius}px`,
            overflow: 'hidden'
          }}
        >
          {showFilters && (
            <>
              {/* Left Column: Categories list */}
          <Panel id="pnl-categories-v2" defaultSize="25%" minSize="15%" maxSize="45%">
            <Box sx={{ height: '100%', overflowY: 'scroll', p: 2 }}>
            <Typography variant="subtitle2" fontWeight="700" color="text.secondary" sx={{ mb: 1.5 }}>
              Category Breakdown
            </Typography>
            <DataTable component={Box} containerSx={{ border: 'none', borderRadius: 0 }} size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow
                    hover
                    selected={selectedAuditCat === 'All'}
                    onClick={() => setSelectedAuditCat('All')}
                    sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) } }}
                  >
                    <TableCell sx={{ fontWeight: 600 }}>All Categories</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      ${(pnlSummary.revenue + pnlSummary.expenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>

                  <TableRow sx={{ bgcolor: alpha(theme.palette.text.secondary, 0.04) }}>
                    <TableCell colSpan={2} sx={{ fontWeight: 700, py: 0.5, color: 'text.secondary' }}>REVENUE</TableCell>
                  </TableRow>
                  {revenueCats.map(cat => (
                    <TableRow
                      key={cat}
                      hover
                      selected={selectedAuditCat === cat}
                      onClick={() => setSelectedAuditCat(cat)}
                      sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) } }}
                    >
                      <TableCell sx={{ pl: 3 }}>{cat}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        ${(pnlSummary.catTotals[cat] || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Total Revenue Row */}
                  <TableRow sx={{ bgcolor: alpha(theme.palette.success.main, 0.01) }}>
                    <TableCell sx={{ pl: 2, fontWeight: 700, color: 'success.main' }}>Total Revenue</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main', fontVariantNumeric: 'tabular-nums' }}>
                      ${pnlSummary.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>

                  <TableRow sx={{ bgcolor: alpha(theme.palette.text.secondary, 0.04) }}>
                    <TableCell colSpan={2} sx={{ fontWeight: 700, py: 0.5, color: 'text.secondary' }}>OPERATING EXPENSES</TableCell>
                  </TableRow>
                  {expenseCats.map(cat => (
                    <TableRow
                      key={cat}
                      hover
                      selected={selectedAuditCat === cat}
                      onClick={() => setSelectedAuditCat(cat)}
                      sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) } }}
                    >
                      <TableCell sx={{ pl: 3 }}>{cat}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        ${(pnlSummary.catTotals[cat] || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Total Operating Expenses Row */}
                  <TableRow sx={{ bgcolor: alpha(theme.palette.error.main, 0.01) }}>
                    <TableCell sx={{ pl: 2, fontWeight: 700, color: 'error.main' }}>Total Expenses</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main', fontVariantNumeric: 'tabular-nums' }}>
                      ${pnlSummary.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>

                  {/* Net Profit / Loss Bottom Line Row */}
                  <TableRow sx={{ 
                    bgcolor: alpha(pnlSummary.net >= 0 ? theme.palette.success.main : theme.palette.error.main, 0.06),
                    borderTop: `2px double ${theme.palette.divider}`,
                    borderBottom: `2px double ${theme.palette.divider}`
                  }}>
                    <TableCell sx={{ fontWeight: 800, color: pnlSummary.net >= 0 ? 'success.main' : 'error.main' }}>Net Profit / Loss</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: pnlSummary.net >= 0 ? 'success.main' : 'error.main', fontVariantNumeric: 'tabular-nums' }}>
                      {pnlSummary.net >= 0 ? '' : '-'}${Math.abs(pnlSummary.net).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                </TableBody>
            </DataTable>
          </Box>
          </Panel>

          {/* Resizable Divider Handle */}
          <PanelResizeHandle aria-label="Resize panels" style={{ width: 16, position: 'relative' }}>
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                margin: '0 auto',
                width: 2,
                bgcolor: 'divider',
                borderRadius: 1,
                transition: 'background-color 120ms ease',
                '[data-resize-handle-active] &, &:hover': {
                  bgcolor: 'primary.main',
                  width: 3,
                },
              }}
            />
          </PanelResizeHandle>

        </>
          )}
          {/* Right Column: Transactions list */}
          <Panel id="pnl-transactions-v2" defaultSize="75%" minSize="50%">
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, gap: 2, flexWrap: 'wrap', flexShrink: 0 }}>
              <Typography variant="subtitle2" fontWeight="700" color="text.secondary">
                Auditing Transactions: {selectedAuditCat === 'All' ? 'All Items' : selectedAuditCat}
              </Typography>
              <TextField
                size="small"
                label="Search Transactions"
                value={auditSearchQuery}
                onChange={(e) => setAuditSearchQuery(e.target.value)}
                sx={{ width: 220 }}
              />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <DataTable containerSx={{ flex: 1, border: 'none', borderRadius: 0 }} size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell sx={{ width: '150px' }}>Category</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell align="right">Original Amount</TableCell>
                      <TableCell align="right">Comp Value</TableCell>
                      <TableCell>Account</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedAuditTxns.map((row) => {
                      const isIncome = row.category.toLowerCase() === 'income';
                      const rowCompVal = isIncome ? row.amount : -row.amount;
                      
                      return (
                        <TableRow key={row.id} hover>
                          <TableCell>{row.date}</TableCell>
                          <TableCell sx={{ py: 0.5 }}>
                            <Select
                              value={row.category}
                              onChange={async (e) => {
                                await handleRecategorize(row.id, e.target.value as string);
                              }}
                              size="small"
                              fullWidth
                            >
                              {categoriesList.map(c => (
                                <MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>
                              ))}
                            </Select>
                          </TableCell>
                          <TableCell>{row.description}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            ${row.amount.toFixed(2)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: rowCompVal >= 0 ? 'success.main' : 'error.main' }}>
                            {rowCompVal >= 0 ? `$${rowCompVal.toFixed(2)}` : `($${Math.abs(rowCompVal).toFixed(2)})`}
                          </TableCell>
                          <TableCell>{row.accountId}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TablePagination
                        count={auditedTxns.length}
                        page={auditPage}
                        onPageChange={(_, p) => setAuditPage(p)}
                        rowsPerPage={auditPageSize}
                        onRowsPerPageChange={(e) => {
                          setAuditPageSize(Number(e.target.value));
                          setAuditPage(0);
                        }}
                        rowsPerPageOptions={[10, 25, 50, 100]}
                        sx={{ borderTop: `1px solid ${theme.palette.divider}` }}
                      />
                    </TableRow>
                  </TableFooter>
                </DataTable>
            </Box>
          </Box>
          </Panel>
        </PanelGroup>
      ) : (
        <>
          <Box sx={{ flex: 1, minHeight: 0, border: `1px solid ${theme.palette.divider}`, borderRadius: 1 }}>
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, gap: 2, flexWrap: 'wrap', flexShrink: 0 }}>
              <Typography variant="subtitle2" fontWeight="700" color="text.secondary">
                Auditing Transactions: {selectedAuditCat === 'All' ? 'All Items' : selectedAuditCat}
              </Typography>
              <TextField
                size="small"
                label="Search Transactions"
                value={auditSearchQuery}
                onChange={(e) => setAuditSearchQuery(e.target.value)}
                sx={{ width: 220 }}
              />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <DataTable containerSx={{ flex: 1, border: 'none', borderRadius: 0 }} size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell sx={{ width: '150px' }}>Category</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell align="right">Original Amount</TableCell>
                      <TableCell align="right">Comp Value</TableCell>
                      <TableCell>Account</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedAuditTxns.map((row) => {
                      const isIncome = row.category.toLowerCase() === 'income';
                      const rowCompVal = isIncome ? row.amount : -row.amount;
                      
                      return (
                        <TableRow key={row.id} hover>
                          <TableCell>{row.date}</TableCell>
                          <TableCell sx={{ py: 0.5 }}>
                            <Select
                              value={row.category}
                              onChange={async (e) => {
                                await handleRecategorize(row.id, e.target.value as string);
                              }}
                              size="small"
                              fullWidth
                            >
                              {categoriesList.map(c => (
                                <MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>
                              ))}
                            </Select>
                          </TableCell>
                          <TableCell>{row.description}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            ${row.amount.toFixed(2)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: rowCompVal >= 0 ? 'success.main' : 'error.main' }}>
                            {rowCompVal >= 0 ? `$${rowCompVal.toFixed(2)}` : `($${Math.abs(rowCompVal).toFixed(2)})`}
                          </TableCell>
                          <TableCell>{row.accountId}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TablePagination
                        count={auditedTxns.length}
                        page={auditPage}
                        onPageChange={(_, p) => setAuditPage(p)}
                        rowsPerPage={auditPageSize}
                        onRowsPerPageChange={(e) => {
                          setAuditPageSize(Number(e.target.value));
                          setAuditPage(0);
                        }}
                        rowsPerPageOptions={[10, 25, 50, 100]}
                        sx={{ borderTop: `1px solid ${theme.palette.divider}` }}
                      />
                    </TableRow>
                  </TableFooter>
                </DataTable>
            </Box>
          </Box>
          </Box>
          <Drawer
            anchor="bottom"
            open={showFilters}
            onClose={() => setShowFilters(false)}
            PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85vh', pb: 4 } }}
          >
            <Box sx={{ height: '100%', overflowY: 'scroll', p: 2 }}>
            <Typography variant="subtitle2" fontWeight="700" color="text.secondary" sx={{ mb: 1.5 }}>
              Category Breakdown
            </Typography>
            <DataTable component={Box} containerSx={{ border: 'none', borderRadius: 0 }} size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow
                    hover
                    selected={selectedAuditCat === 'All'}
                    onClick={() => setSelectedAuditCat('All')}
                    sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) } }}
                  >
                    <TableCell sx={{ fontWeight: 600 }}>All Categories</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      ${(pnlSummary.revenue + pnlSummary.expenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>

                  <TableRow sx={{ bgcolor: alpha(theme.palette.text.secondary, 0.04) }}>
                    <TableCell colSpan={2} sx={{ fontWeight: 700, py: 0.5, color: 'text.secondary' }}>REVENUE</TableCell>
                  </TableRow>
                  {revenueCats.map(cat => (
                    <TableRow
                      key={cat}
                      hover
                      selected={selectedAuditCat === cat}
                      onClick={() => setSelectedAuditCat(cat)}
                      sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) } }}
                    >
                      <TableCell sx={{ pl: 3 }}>{cat}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        ${(pnlSummary.catTotals[cat] || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Total Revenue Row */}
                  <TableRow sx={{ bgcolor: alpha(theme.palette.success.main, 0.01) }}>
                    <TableCell sx={{ pl: 2, fontWeight: 700, color: 'success.main' }}>Total Revenue</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main', fontVariantNumeric: 'tabular-nums' }}>
                      ${pnlSummary.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>

                  <TableRow sx={{ bgcolor: alpha(theme.palette.text.secondary, 0.04) }}>
                    <TableCell colSpan={2} sx={{ fontWeight: 700, py: 0.5, color: 'text.secondary' }}>OPERATING EXPENSES</TableCell>
                  </TableRow>
                  {expenseCats.map(cat => (
                    <TableRow
                      key={cat}
                      hover
                      selected={selectedAuditCat === cat}
                      onClick={() => setSelectedAuditCat(cat)}
                      sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) } }}
                    >
                      <TableCell sx={{ pl: 3 }}>{cat}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        ${(pnlSummary.catTotals[cat] || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Total Operating Expenses Row */}
                  <TableRow sx={{ bgcolor: alpha(theme.palette.error.main, 0.01) }}>
                    <TableCell sx={{ pl: 2, fontWeight: 700, color: 'error.main' }}>Total Expenses</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main', fontVariantNumeric: 'tabular-nums' }}>
                      ${pnlSummary.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>

                  {/* Net Profit / Loss Bottom Line Row */}
                  <TableRow sx={{ 
                    bgcolor: alpha(pnlSummary.net >= 0 ? theme.palette.success.main : theme.palette.error.main, 0.06),
                    borderTop: `2px double ${theme.palette.divider}`,
                    borderBottom: `2px double ${theme.palette.divider}`
                  }}>
                    <TableCell sx={{ fontWeight: 800, color: pnlSummary.net >= 0 ? 'success.main' : 'error.main' }}>Net Profit / Loss</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: pnlSummary.net >= 0 ? 'success.main' : 'error.main', fontVariantNumeric: 'tabular-nums' }}>
                      {pnlSummary.net >= 0 ? '' : '-'}${Math.abs(pnlSummary.net).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                </TableBody>
            </DataTable>
          </Box>
          </Drawer>
        </>
      )}
    </Box>
  );
}
