import { useState } from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Button,
  Chip,
  Divider,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import SyncLockOutlinedIcon from '@mui/icons-material/SyncLockOutlined';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import { UNIFORM_TOOLBAR_BUTTON_SX } from '../components/AccountFilterDropdown';

const PRIVACY_POLICY_MARKDOWN = `# Strictly Spending — Privacy Policy

**Last Updated:** October 25, 2026

Strictly Spending ("the App") is a local-first personal finance, budgeting, and cashflow forecasting application. Your financial privacy is our foundational architectural principle.

## 1. Zero Cloud Collection & Local-First Storage
- **No Servers or Accounts:** Strictly Spending does not operate cloud servers, user accounts, or remote databases.
- **On-Device SQLite Database:** All financial records—including bank accounts, transactions, categories, categorization rules, budgets, loans, and forecast scenarios—are stored exclusively in a local SQLite database on your personal device.
- **No Telemetry or Tracking:** The App contains zero third-party analytics SDKs, advertising identifiers, crash reporters, or behavioral trackers.

## 2. Optional Bank Synchronization (SimpleFIN Bridge)
- If you choose to configure automatic bank synchronization via SimpleFIN Bridge, your SimpleFIN Access Token/URL is stored locally in your on-device database.
- When you trigger a bank sync, your device communicates directly with SimpleFIN (\`https://beta-bridge.simplefin.org\`) over encrypted HTTPS (TLS) to retrieve read-only account balances and transaction histories.
- Strictly Spending never proxies, intercepts, or stores your banking credentials or SimpleFIN tokens on any external server.

## 3. Optional AI & Model Context Protocol (MCP) Integration
- Strictly Spending includes an optional local Model Context Protocol (MCP) server that allows you to connect local AI clients (such as Claude Desktop, Cursor, or Antigravity) to your on-device SQLite database.
- This interface runs locally on your machine via standard input/output (\`stdio\`) or local network HTTP only when explicitly launched by you.

## 4. Data Export, Retention & Complete Deletion
- **Full Data Portability:** You can export your entire database to a human-readable JSON backup file at any time from the **Import & Backup** screen.
- **Instant Data Deletion:** Because all data resides locally on your device, you can permanently delete all imported financial data at any time by navigating to **Settings → Imported data → Clear all imported data**, or by uninstalling the application from your device.

## 5. Contact & Open Source Transparency
If you have questions regarding this Privacy Policy or Strictly Spending's security architecture, please open an issue on our official repository at \`https://github.com/barnesy/strictly-spending\`.
`;

export default function PrivacyPolicy() {
  const [copied, setCopied] = useState(false);

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(PRIVACY_POLICY_MARKDOWN);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <Stack spacing={{ xs: 2, sm: 3 }} sx={{ maxWidth: 860, mx: 'auto', width: '100%', pb: 4 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap={1.5}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Button
            component={RouterLink}
            to="/settings"
            variant="outlined"
            size="small"
            startIcon={<ArrowBackIcon fontSize="small" />}
            sx={UNIFORM_TOOLBAR_BUTTON_SX}
          >
            Settings
          </Button>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Privacy Policy
          </Typography>
        </Stack>

        <Button
          size="small"
          variant={copied ? 'contained' : 'outlined'}
          color={copied ? 'success' : 'primary'}
          startIcon={copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
          onClick={handleCopyMarkdown}
          sx={UNIFORM_TOOLBAR_BUTTON_SX}
        >
          {copied ? 'Copied Markdown' : 'Copy Policy Text'}
        </Button>
      </Stack>

      <Paper sx={{ p: { xs: 2, sm: 3.5 } }}>
        <Stack spacing={2.5}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              <ShieldOutlinedIcon color="success" />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Local-First Financial Privacy
              </Typography>
              <Chip
                label="Zero Cloud Telemetry"
                color="success"
                size="small"
                variant="outlined"
                sx={{ fontWeight: 700, fontSize: '0.72rem', height: 22 }}
              />
              <Chip
                label="On-Device SQLite"
                color="primary"
                size="small"
                variant="outlined"
                sx={{ fontWeight: 700, fontSize: '0.72rem', height: 22 }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Last Updated: October 25, 2026 · App Identifier: <code>com.strictlyspending.app</code>
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
              Strictly Spending is engineered from the ground up as a local-first personal finance application. Your bank transactions, account balances, budgets, and cashflow forecasts never leave your device unless you explicitly export them.
            </Typography>
          </Box>

          <Divider />

          <Stack spacing={2}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <StorageOutlinedIcon color="primary" sx={{ mt: 0.25 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  1. Zero Cloud Collection &amp; On-Device SQLite Storage
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6 }}>
                  Strictly Spending does not operate remote servers, user accounts, or cloud databases. All data you import or create—including CSV files, bank accounts, transactions, categorization rules, loan amortization schedules, and forecast scenarios—is stored exclusively inside a local SQLite database on your device. We do not embed any third-party analytics SDKs, advertising trackers, or telemetry agents.
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <SyncLockOutlinedIcon color="primary" sx={{ mt: 0.25 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  2. Optional Bank Synchronization (SimpleFIN Bridge)
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6 }}>
                  If you choose to link bank accounts using SimpleFIN Bridge, your SimpleFIN setup token and access URL are stored locally in your device&apos;s SQLite database. When you initiate a sync, your device connects directly to <code>https://beta-bridge.simplefin.org</code> over TLS/HTTPS to download read-only balances and transactions. Strictly Spending never proxies or stores your bank credentials on any intermediary server.
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <LockOutlinedIcon color="primary" sx={{ mt: 0.25 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  3. Optional Local AI &amp; Model Context Protocol (MCP)
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6 }}>
                  Strictly Spending provides an optional local Model Context Protocol (MCP) server so you can connect desktop AI assistants (such as Claude Desktop, Cursor, or Antigravity) to your financial database for tax preparation and cashflow analysis. The MCP server runs locally on your machine and only responds to local connections you configure.
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <DeleteSweepOutlinedIcon color="error" sx={{ mt: 0.25 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  4. Data Portability, Retention &amp; Instant Deletion
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6 }}>
                  You retain 100% ownership and control over your data at all times:
                </Typography>
                <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.5, color: 'text.secondary', typography: 'body2', lineHeight: 1.6 }}>
                  <li>
                    <strong>Export &amp; Backup:</strong> Export your complete database to a portable JSON file at any time from the <RouterLink to="/import">Import &amp; Backup</RouterLink> screen.
                  </li>
                  <li>
                    <strong>Complete Deletion:</strong> Permanently erase all imported transactions, accounts, and import history at any time from <RouterLink to="/settings">Settings &rarr; Clear all imported data</RouterLink>, or by uninstalling the app.
                  </li>
                </Box>
              </Box>
            </Box>
          </Stack>

          <Divider />

          <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              App Store &amp; Google Play Data Safety Summary
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.5 }}>
              • <strong>Data Collected:</strong> None (0 data types transmitted off-device to the developer)
              <br />
              • <strong>Data Shared with Third Parties:</strong> None
              <br />
              • <strong>Tracking Across Apps/Websites:</strong> No (App Tracking Transparency not required)
              <br />
              • <strong>On-Device Deletion Available:</strong> Yes (Settings &rarr; Clear all imported data)
            </Typography>
          </Box>
        </Stack>
      </Paper>
    </Stack>
  );
}
