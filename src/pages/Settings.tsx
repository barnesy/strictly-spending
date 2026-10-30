import { useState, useEffect, useRef } from 'react';
import { api, type McpServerInfo } from '../api';
import {
  Box,
  Stack,
  Typography,
  Paper,
  Button,
  Alert,
  Chip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import DeleteIcon from '@mui/icons-material/Delete';
import HubIcon from '@mui/icons-material/Hub';
import SmartphoneIcon from '@mui/icons-material/Smartphone';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import InstallMobileIcon from '@mui/icons-material/InstallMobile';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import StorageIcon from '@mui/icons-material/Storage';
import SyncIcon from '@mui/icons-material/Sync';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { Link as RouterLink } from 'react-router-dom';

import { clearImportedData, seedDemoData, clearDemoData } from '../demoData';
import { downloadWorkspaceBackup, restoreWorkspaceBackup } from '../domain/workspaceBackup';
import { useFilters } from '../stores/store';
import { queryClient } from '../queryClient';
import AnimatedLogo from '../components/AnimatedLogo';
import DesktopWindowsOutlinedIcon from '@mui/icons-material/DesktopWindowsOutlined';
import { UNIFORM_TOOLBAR_BUTTON_SX } from '../components/AccountFilterDropdown';
import { usePwaInstall } from '../utils/pwaInstall';
import {
  getStorageEngineStatus,
  getRemoteSqliteServerUrl,
  setRemoteSqliteServerUrl,
  testPcSqliteConnection,
  syncFromPcSqliteToBrowserStorage,
  type StorageEngineStatus,
} from '../testBridge';

export default function Settings() {
  // Custom confirmation dialog states
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmType, setConfirmType] = useState<'clearImported' | null>(null);

  const [clearImportedBusy, setClearImportedBusy] = useState(false);
  const [clearImportedMsg, setClearImportedMsg] = useState<string | null>(null);

  const demoMode = useFilters((s) => s.demoMode);
  const setDemoMode = useFilters((s) => s.setDemoMode);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoMsg, setDemoMsg] = useState<string | null>(null);

  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const [hasImportedData, setHasImportedData] = useState(false);
  const [safeMode, setSafeMode] = useState(false);
  const [mcpInfo, setMcpInfo] = useState<McpServerInfo | null>(null);
  const [copiedMcp, setCopiedMcp] = useState(false);
  const [copiedPhoneUrl, setCopiedPhoneUrl] = useState<string | null>(null);
  const { canInstall, isStandalone, promptInstall } = usePwaInstall();

  const [engineStatus, setEngineStatus] = useState<StorageEngineStatus>(() => getStorageEngineStatus());
  const [remoteUrlInput, setRemoteUrlInput] = useState<string>(() => getRemoteSqliteServerUrl() || '');
  const [sqliteConnBusy, setSqliteConnBusy] = useState(false);
  const [sqliteConnMsg, setSqliteConnMsg] = useState<{
    severity: 'success' | 'info' | 'warning' | 'error';
    text: string;
    directPwaUrl?: string;
  } | null>(null);

  useEffect(() => {
    const refreshStatus = () => {
      setEngineStatus(getStorageEngineStatus());
    };
    window.addEventListener('storage-engine-status-change', refreshStatus);

    api.getTransactions().then((rows) => {
      setHasImportedData(rows.some((t) => t.source !== 'demo'));
      refreshStatus();
    });
    api.isSafeMode().then(setSafeMode).catch(() => setSafeMode(false));
    api
      .getMcpServerInfo()
      .then((info) => {
        setMcpInfo(info);
        if (info?.localUrls && info.localUrls.length > 0 && !remoteUrlInput) {
          const preferred = info.localUrls.find((u) => u.includes('://100.')) || info.localUrls[0];
          if (preferred) setRemoteUrlInput(preferred);
        }
        refreshStatus();
      })
      .catch(() => {
        refreshStatus();
      });

    return () => {
      window.removeEventListener('storage-engine-status-change', refreshStatus);
    };
  }, []);

  const handleConnectRemoteSqlite = async () => {
    const trimmed = remoteUrlInput.trim();
    if (!trimmed) {
      setSqliteConnMsg({
        severity: 'warning',
        text: 'Enter your PC Server URL first (for example http://192.168.1.247:5173 or http://100.x.x.x:5173).',
      });
      return;
    }
    setSqliteConnBusy(true);
    setSqliteConnMsg(null);
    try {
      const check = await testPcSqliteConnection(trimmed);
      if (check.ok && check.serverOrigin) {
        setRemoteSqliteServerUrl(check.serverOrigin);
        setRemoteUrlInput(check.serverOrigin);
        const info = await api.getMcpServerInfo().catch(() => null);
        if (info) setMcpInfo(info);
        await queryClient.invalidateQueries();
        window.dispatchEvent(new Event('db-update'));
        setEngineStatus(getStorageEngineStatus());
        setSqliteConnMsg({
          severity: 'success',
          text: `Connected live to PC SQLite database (${check.dbPath || 'spending-viz.sqlite'}) via ${check.serverOrigin}!`,
        });
      } else if (check.mixedContentBlocked && check.serverOrigin) {
        const directUrl = `${check.serverOrigin.replace(/\/+$/, '')}/?pwa=1`;
        setSqliteConnMsg({
          severity: 'warning',
          text:
            check.error ||
            `Browser security blocks HTTPS pages from fetching HTTP LAN servers directly. Open ${directUrl} and add that page to your Home Screen to use PC SQLite directly.`,
          directPwaUrl: directUrl,
        });
      } else {
        setSqliteConnMsg({
          severity: 'error',
          text: `Could not reach PC SQLite server at ${trimmed} (${check.error || 'Unreachable'}). Make sure Strictly Spending / Vite is running on your PC and your phone is on the same Wi-Fi or Tailscale network.`,
        });
      }
    } finally {
      setSqliteConnBusy(false);
    }
  };

  const handleDisconnectRemoteSqlite = async () => {
    setRemoteSqliteServerUrl(null);
    await queryClient.invalidateQueries();
    window.dispatchEvent(new Event('db-update'));
    setEngineStatus(getStorageEngineStatus());
    setSqliteConnMsg({
      severity: 'info',
      text: 'Cleared custom remote server override.',
    });
  };

  const handlePullSqliteToPhoneStorage = async () => {
    setSqliteConnBusy(true);
    setSqliteConnMsg(null);
    try {
      const targetUrl =
        remoteUrlInput.trim() ||
        engineStatus.serverOrigin ||
        (mcpInfo?.localUrls && mcpInfo.localUrls[0]) ||
        null;
      const counts = await syncFromPcSqliteToBrowserStorage(targetUrl);
      await queryClient.invalidateQueries();
      window.dispatchEvent(new Event('db-update'));
      setHasImportedData(counts.transactions > 0 || counts.accounts > 0);
      setSqliteConnMsg({
        severity: 'success',
        text: `Synced PC SQLite snapshot into phone offline storage: ${counts.accounts} accounts, ${counts.transactions.toLocaleString()} transactions, ${counts.rules} rules, ${counts.budgets} budgets, and ${counts.loans} loans.`,
      });
    } catch (err) {
      setSqliteConnMsg({
        severity: 'error',
        text: `Failed to pull from PC SQLite server: ${(err as Error).message}. If you are on HTTPS (github.io), open the direct LAN/Tailscale URL or use Export/Restore Full Backup (.json) below.`,
      });
    } finally {
      setSqliteConnBusy(false);
    }
  };

  const handleEnableDemoMode = async () => {
    setDemoBusy(true);
    setDemoMsg(null);
    try {
      await seedDemoData();
      setDemoMode(true);
      await queryClient.invalidateQueries();
      window.dispatchEvent(new Event('db-update'));
      setDemoMsg('Demo Mode enabled with sample household accounts, recurring bills, loans, and transactions.');
    } catch (e) {
      setDemoMsg(`Error: ${(e as Error).message}`);
    } finally {
      setDemoBusy(false);
    }
  };

  const handleDisableDemoMode = async (purgeDemoRows = false) => {
    setDemoBusy(true);
    setDemoMsg(null);
    try {
      setDemoMode(false);
      if (purgeDemoRows) {
        await clearDemoData();
      }
      await queryClient.invalidateQueries();
      window.dispatchEvent(new Event('db-update'));
      setDemoMsg(
        purgeDemoRows
          ? 'Exited Demo Mode and removed sample transactions from the database.'
          : 'Switched back to your real accounts and transactions.'
      );
    } catch (e) {
      setDemoMsg(`Error: ${(e as Error).message}`);
    } finally {
      setDemoBusy(false);
    }
  };

  const executeClearImported = async () => {
    setClearImportedBusy(true);
    setClearImportedMsg(null);
    try {
      const r = await clearImportedData();
      window.dispatchEvent(new Event('db-update'));
      setClearImportedMsg(
        `Successfully removed ${r.removedTransactions} imported transactions and ${r.removedAccounts} imported accounts.`
      );
    } catch (e) {
      setClearImportedMsg(`Error: ${(e as Error).message}`);
    } finally {
      setClearImportedBusy(false);
    }
  };

  const onClearImported = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setConfirmTitle('Clear All Imported Data');
    setConfirmMessage(
      'Are you sure you want to delete all transactions, accounts, and batch history you imported? This will not affect the Demo data or your customization rules.'
    );
    setConfirmType('clearImported');
    setConfirmOpen(true);
  };

  const [copiedMobileAiContext, setCopiedMobileAiContext] = useState(false);
  const [copyingMobileAiBusy, setCopyingMobileAiBusy] = useState(false);

  const fallbackMcpJson = JSON.stringify(
    {
      mcpServers: {
        'strictly-spending': {
          command: mcpInfo?.executablePath || 'strictly-spending',
          args: mcpInfo?.dbPath ? ['--mcp', '--db-path', mcpInfo.dbPath] : ['--mcp'],
        },
      },
    },
    null,
    2
  );

  const displayMcpJson =
    mcpInfo?.configJson && mcpInfo.configJson.trim() !== '{}' ? mcpInfo.configJson : fallbackMcpJson;

  const handleCopyMcpConfig = async () => {
    try {
      await navigator.clipboard.writeText(displayMcpJson);
      setCopiedMcp(true);
      setTimeout(() => setCopiedMcp(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyMobileAiContext = async () => {
    setCopyingMobileAiBusy(true);
    try {
      const [allAccounts, allTxns, allBudgets, allLoans, allCategories] = await Promise.all([
        api.getAccounts(),
        api.getTransactions(),
        api.getBudgets(),
        api.getLoans(),
        api.getCategories(),
      ]);

      const hasReal = allAccounts.some((a) => a.source !== 'demo');
      const activeAccs = hasReal ? allAccounts.filter((a) => a.source !== 'demo') : allAccounts;
      const activeTxns = (hasReal ? allTxns.filter((t) => t.source !== 'demo') : allTxns).sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      const transferCats = new Set(
        allCategories.filter((c) => c.type === 'transfer').map((c) => c.name)
      );
      const incomeCats = new Set(
        allCategories.filter((c) => c.type === 'income').map((c) => c.name)
      );

      const accNameById = new Map<number, string>();
      for (const a of activeAccs) {
        if (a.id !== undefined) accNameById.set(a.id, a.name);
      }

      const nowIso = new Date().toISOString().slice(0, 10);
      const currentYm = nowIso.slice(0, 7);
      const prevDate = new Date();
      prevDate.setMonth(prevDate.getMonth() - 1);
      const lastYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

      const spendByCatThisMonth = new Map<string, number>();
      const spendByCatLastMonth = new Map<string, number>();
      const merchantStats = new Map<string, { count: number; total: number; category: string }>();

      let thisMonthIncome = 0;
      let thisMonthSpend = 0;
      let lastMonthIncome = 0;
      let lastMonthSpend = 0;

      for (const t of activeTxns) {
        if (transferCats.has(t.category)) continue;
        const ym = t.date.slice(0, 7);
        const isInc = incomeCats.has(t.category) || t.amount > 0;
        if (isInc && t.amount > 0) {
          if (ym === currentYm) thisMonthIncome += t.amount;
          else if (ym === lastYm) lastMonthIncome += t.amount;
        } else if (t.amount < 0) {
          const abs = Math.abs(t.amount);
          if (ym === currentYm) {
            thisMonthSpend += abs;
            spendByCatThisMonth.set(t.category, (spendByCatThisMonth.get(t.category) || 0) + abs);
          } else if (ym === lastYm) {
            lastMonthSpend += abs;
            spendByCatLastMonth.set(t.category, (spendByCatLastMonth.get(t.category) || 0) + abs);
          }
          const mKey = (t.merchantKey || t.description || 'Unknown').trim();
          const cur = merchantStats.get(mKey) || { count: 0, total: 0, category: t.category };
          cur.count += 1;
          cur.total += abs;
          merchantStats.set(mKey, cur);
        }
      }

      const fmt = (n: number) =>
        `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const lines: string[] = [
        `# Strictly Spending — Live Financial Snapshot (${nowIso})`,
        `You are analyzing my personal financial data exported from Strictly Spending. Use the exact numbers below to answer my questions.`,
        ``,
        `## 1. Accounts & Current Balances`,
        ...activeAccs.map(
          (a) =>
            `- **${a.name}** (${a.type}${a.institution ? ` · ${a.institution}` : ''}): ${
              (a.currentBalance ?? 0) < 0 ? '-' : ''
            }${fmt(a.currentBalance ?? 0)}`
        ),
        ``,
        `## 2. Loans & Liabilities`,
        ...(allLoans.filter((l) => l.enabled !== false).length > 0
          ? allLoans
              .filter((l) => l.enabled !== false)
              .map(
                (l) =>
                  `- **${l.name}** (${l.type}): Principal ${fmt(l.principal)}, Rate ${l.rate}% APR, Payment ${fmt(
                    l.monthlyPayment || 0
                  )}/mo${l.propertyValue ? `, Asset Value ${fmt(l.propertyValue)}` : ''}`
              )
          : ['- None configured']),
        ``,
        `## 3. Cashflow & Category Spending (${currentYm} vs ${lastYm})`,
        `- **${currentYm} Month-to-Date**: Income ${fmt(thisMonthIncome)} | Spend ${fmt(thisMonthSpend)} | Net ${
          thisMonthIncome - thisMonthSpend >= 0 ? '+' : '-'
        }${fmt(thisMonthIncome - thisMonthSpend)}`,
        `- **${lastYm} Full Month**: Income ${fmt(lastMonthIncome)} | Spend ${fmt(lastMonthSpend)} | Net ${
          lastMonthIncome - lastMonthSpend >= 0 ? '+' : '-'
        }${fmt(lastMonthIncome - lastMonthSpend)}`,
        ``,
        `| Category | Monthly Budget | ${currentYm} Spend | ${lastYm} Spend |`,
        `| :--- | ---: | ---: | ---: |`,
        ...allCategories
          .filter((c) => c.type === 'spend')
          .map((c) => {
            const b = allBudgets.find((x) => x.category === c.name)?.monthlyAmount || 0;
            const curS = spendByCatThisMonth.get(c.name) || 0;
            const lastS = spendByCatLastMonth.get(c.name) || 0;
            if (b === 0 && curS === 0 && lastS === 0) return null;
            return `| ${c.name} | ${fmt(b)} | ${fmt(curS)} | ${fmt(lastS)} |`;
          })
          .filter((x): x is string => Boolean(x)),
        ``,
        `## 4. Top 15 All-Time Merchants by Spend`,
        ...Array.from(merchantStats.entries())
          .sort((a, b) => b[1].total - a[1].total)
          .slice(0, 15)
          .map(
            ([m, info], idx) =>
              `${idx + 1}. **${m}** (${info.category}): ${fmt(info.total)} across ${info.count} transactions`
          ),
        ``,
        `## 5. Most Recent 60 Transactions`,
        ...activeTxns.slice(0, 60).map((t) => {
          const accLabel = accNameById.get(t.accountId) || `Acct #${t.accountId}`;
          const sign = t.amount < 0 ? '-' : '+';
          return `- \`${t.date}\` | **${sign}${fmt(t.amount)}** | ${t.description} (${t.category} · ${accLabel}${
            t.isPending ? ' · PENDING' : ''
          })`;
        }),
      ];

      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedMobileAiContext(true);
      setTimeout(() => setCopiedMobileAiContext(false), 3000);
    } catch {
      // ignore clipboard errors
    } finally {
      setCopyingMobileAiBusy(false);
    }
  };

  const isNativeTauri = engineStatus.isNativeTauri || engineStatus.engine === 'tauri-native';
  const isUsingPcSqlite =
    isNativeTauri ||
    engineStatus.engine === 'pc-sqlite-server' ||
    Boolean(mcpInfo?.dbPath);

  const runtimeHeadline = isNativeTauri
    ? 'Native Tauri Desktop App'
    : isStandalone
      ? 'Progressive Web App (Installed PWA)'
      : 'Web Browser Tab (Not Installed as PWA)';

  const engineBadgeLabel = isNativeTauri
    ? 'Database: Native Tauri SQLite'
    : isUsingPcSqlite
      ? 'Database: PC SQLite Server (Live)'
      : 'Database: Browser LocalStorage';

  return (
    <Stack spacing={{ xs: 2, sm: 3 }}>
      <Typography variant="h5" sx={{ display: { xs: 'none', md: 'block' }, fontWeight: 700 }}>Settings</Typography>

      {/* Dedicated App Runtime (Native Tauri vs PWA) & Active Database Section */}
      <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 1 }}>
        <Stack spacing={2}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
            flexWrap="wrap"
            gap={1.5}
          >
            <Box sx={{ flex: 1, minWidth: 240 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                {isNativeTauri ? (
                  <DesktopWindowsOutlinedIcon fontSize="small" color="primary" />
                ) : (
                  <SmartphoneIcon fontSize="small" color="primary" />
                )}
                <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
                  App Runtime &amp; Storage Environment
                </Typography>
                <Chip
                  label={runtimeHeadline}
                  size="small"
                  color={isNativeTauri ? 'primary' : isStandalone ? 'secondary' : 'default'}
                  variant="filled"
                  sx={{ height: 22, fontSize: '0.72rem', fontWeight: 700 }}
                />
                <Chip
                  label={engineBadgeLabel}
                  size="small"
                  color={isUsingPcSqlite ? 'success' : 'warning'}
                  variant="filled"
                  sx={{ height: 22, fontSize: '0.72rem', fontWeight: 700 }}
                />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                Confirm whether you are running the <strong>Native Tauri Desktop App</strong>, an{' '}
                <strong>Installed Home Screen PWA</strong>, or a <strong>Web Browser Tab</strong>, and whether your data is stored in your PC&apos;s SQLite database or browser LocalStorage.
              </Typography>
            </Box>

            {canInstall && !isNativeTauri && (
              <Button
                size="small"
                variant="contained"
                color="primary"
                startIcon={<InstallMobileIcon fontSize="small" />}
                onClick={() => {
                  void promptInstall();
                }}
                sx={{ ...UNIFORM_TOOLBAR_BUTTON_SX, fontWeight: 700 }}
              >
                Install as PWA
              </Button>
            )}
          </Stack>

          {/* Two-Column Status Comparison: Runtime Shell vs Storage Backend */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 1.5,
            }}
          >
            {/* Card 1: Application Runtime (Native Tauri vs PWA vs Browser) */}
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                border: '1px solid',
                borderColor: isNativeTauri ? 'primary.main' : isStandalone ? 'secondary.main' : 'divider',
                bgcolor: (t) =>
                  t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.02)',
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }}
              >
                Application Mode
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 800, mt: 0.25 }}>
                {isNativeTauri
                  ? 'Native Tauri App (Desktop Rust Shell)'
                  : isStandalone
                    ? 'Installed PWA (Standalone Web App)'
                    : 'Standard Web Browser Tab'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {isNativeTauri
                  ? 'Running inside the native OS desktop window with direct Rust IPC.'
                  : isStandalone
                    ? `Launched from your Home Screen / App Dock in standalone full-screen mode (${engineStatus.currentOrigin}).`
                    : `Opened in a browser tab at ${engineStatus.currentOrigin}. Use "Add to Home Screen" to run as a full-screen PWA.`}
              </Typography>
            </Box>

            {/* Card 2: Active Database Engine (PC SQLite vs Browser LocalStorage) */}
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                border: '1px solid',
                borderColor: isUsingPcSqlite ? 'success.main' : 'warning.main',
                bgcolor: (t) =>
                  isUsingPcSqlite
                    ? t.palette.mode === 'dark'
                      ? 'rgba(16, 185, 129, 0.08)'
                      : 'rgba(16, 185, 129, 0.05)'
                    : t.palette.mode === 'dark'
                      ? 'rgba(245, 158, 11, 0.08)'
                      : 'rgba(245, 158, 11, 0.05)',
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }}
              >
                Active Database Engine
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 800, mt: 0.25 }}>
                {isUsingPcSqlite
                  ? 'PC SQLite Database (spending-viz.sqlite)'
                  : 'Phone / Browser LocalStorage'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, wordBreak: 'break-all' }}>
                {isUsingPcSqlite ? (
                  <>
                    Path: <code>{mcpInfo?.dbPath || 'spending-viz.sqlite'}</code>
                    {engineStatus.serverOrigin && !isNativeTauri ? ` (via ${engineStatus.serverOrigin})` : ''}
                  </>
                ) : (
                  <>
                    Using isolated browser storage (<code>strictly_browser_db_v1</code>). Connect to your PC below to use SQLite.
                  </>
                )}
              </Typography>
            </Box>
          </Box>

          {/* Direct PC SQLite Home Screen Links (when known) */}
          {mcpInfo?.localUrls && mcpInfo.localUrls.length > 0 && (
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.75 }}>
                Direct PC SQLite Home Screen Links (Open on Phone → Share → Add to Home Screen):
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {mcpInfo.localUrls.map((url) => {
                  const pwaUrl = `${url.replace(/\/+$/, '')}/?pwa=1`;
                  const isCopied = copiedPhoneUrl === pwaUrl;
                  const isTailscale = url.includes('://100.');
                  return (
                    <Button
                      key={pwaUrl}
                      size="small"
                      variant={isCopied ? 'contained' : 'outlined'}
                      color={isCopied ? 'success' : isTailscale ? 'secondary' : 'primary'}
                      startIcon={isCopied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(pwaUrl);
                          setCopiedPhoneUrl(pwaUrl);
                          setTimeout(() => setCopiedPhoneUrl(null), 2000);
                        } catch {
                          // ignore
                        }
                      }}
                      sx={{ ...UNIFORM_TOOLBAR_BUTTON_SX, fontFamily: 'monospace', fontWeight: 700, fontSize: '0.76rem' }}
                    >
                      {isTailscale ? `Tailscale PWA: ${pwaUrl}` : `Wi-Fi PWA: ${pwaUrl}`}
                    </Button>
                  );
                })}
              </Stack>
            </Box>
          )}

          {/* Remote PC SQLite Server Bridge Controls (shown when not in Native Tauri Desktop App) */}
          {!isNativeTauri && (
            <>
              <Divider />
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                  Connect Phone PWA to PC SQLite Server (Wi-Fi or Tailscale):
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>
                  Enter your PC&apos;s address (e.g. <code>http://192.168.1.247:5173</code> or <code>http://100.x.x.x:5173</code>) to route queries directly to your PC&apos;s SQLite database, or pull a snapshot of your PC SQLite database into phone storage.
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <TextField
                    size="small"
                    placeholder="http://192.168.1.247:5173"
                    value={remoteUrlInput}
                    onChange={(e) => setRemoteUrlInput(e.target.value)}
                    sx={{
                      flex: 1,
                      minWidth: { xs: '100%', sm: 240 },
                      '& .MuiInputBase-input': {
                        fontFamily: 'monospace',
                        fontSize: '0.82rem',
                        py: 0.85,
                      },
                    }}
                  />
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      disabled={sqliteConnBusy}
                      startIcon={<LinkIcon fontSize="small" />}
                      onClick={handleConnectRemoteSqlite}
                      sx={UNIFORM_TOOLBAR_BUTTON_SX}
                    >
                      Connect to PC SQLite
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="primary"
                      disabled={sqliteConnBusy}
                      startIcon={<SyncIcon fontSize="small" />}
                      onClick={handlePullSqliteToPhoneStorage}
                      sx={UNIFORM_TOOLBAR_BUTTON_SX}
                    >
                      Pull SQLite → Phone Storage
                    </Button>
                    {remoteUrlInput.trim() && (
                      <Button
                        size="small"
                        variant="outlined"
                        color="success"
                        startIcon={<OpenInNewIcon fontSize="small" />}
                        onClick={() => {
                          const base = remoteUrlInput.trim().replace(/\/+$/, '');
                          const full = /^https?:\/\//i.test(base) ? `${base}/?pwa=1` : `http://${base}/?pwa=1`;
                          window.location.href = full;
                        }}
                        sx={UNIFORM_TOOLBAR_BUTTON_SX}
                      >
                        Open Direct PC App
                      </Button>
                    )}
                    {engineStatus.remoteServerUrl && (
                      <Button
                        size="small"
                        variant="text"
                        color="inherit"
                        startIcon={<LinkOffIcon fontSize="small" />}
                        onClick={handleDisconnectRemoteSqlite}
                        sx={UNIFORM_TOOLBAR_BUTTON_SX}
                      >
                        Disconnect
                      </Button>
                    )}
                  </Stack>
                </Stack>

                {sqliteConnMsg && (
                  <Alert
                    severity={sqliteConnMsg.severity}
                    onClose={() => setSqliteConnMsg(null)}
                    sx={{ mt: 1.5, borderRadius: 1 }}
                    action={
                      sqliteConnMsg.directPwaUrl ? (
                        <Button
                          color="inherit"
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            window.location.href = sqliteConnMsg.directPwaUrl!;
                          }}
                          sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}
                        >
                          Open PC App
                        </Button>
                      ) : undefined
                    }
                  >
                    {sqliteConnMsg.text}
                  </Alert>
                )}
              </Box>
            </>
          )}
        </Stack>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 1 }}>
        <Stack spacing={2}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <PlayCircleOutlineIcon fontSize="small" color="primary" />
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
                Sample Household Data (Demo Mode)
              </Typography>
              <Chip
                label={demoMode ? 'Demo Active' : 'Real Data Active'}
                size="small"
                color={demoMode ? 'warning' : 'success'}
                variant="outlined"
                sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Explore Strictly Spending with a realistic 24-month synthetic household dataset (3 bank &amp; credit accounts, recurring bills, loans, and variable spending) without modifying or mixing with your real imported accounts.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            {demoMode ? (
              <>
                <Button
                  variant="contained"
                  color="warning"
                  onClick={() => handleDisableDemoMode(false)}
                  disabled={demoBusy}
                  sx={UNIFORM_TOOLBAR_BUTTON_SX}
                >
                  Switch to Real Data
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => handleDisableDemoMode(true)}
                  disabled={demoBusy}
                  sx={UNIFORM_TOOLBAR_BUTTON_SX}
                >
                  Exit &amp; Remove Demo Rows
                </Button>
              </>
            ) : (
              <Button
                variant="outlined"
                color="primary"
                startIcon={<PlayCircleOutlineIcon />}
                onClick={handleEnableDemoMode}
                disabled={demoBusy}
                sx={UNIFORM_TOOLBAR_BUTTON_SX}
              >
                Explore Sample Household Data
              </Button>
            )}
          </Stack>

          {demoMsg && (
            <Alert
              severity={demoMsg.startsWith('Error') ? 'error' : 'info'}
              onClose={() => setDemoMsg(null)}
              sx={{ borderRadius: 1 }}
            >
              {demoMsg}
            </Alert>
          )}
        </Stack>
      </Paper>

      {/* Full Workspace Backup & Restore Card */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 1 }}>
        <Stack spacing={2}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <StorageIcon fontSize="small" color="primary" />
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
                Full Workspace Backup &amp; Restore
              </Typography>
              <Chip
                label="Portable JSON Snapshot"
                size="small"
                color="primary"
                variant="outlined"
                sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Export or restore your entire financial workspace in a single <code>.json</code> file — including all accounts, transactions, categorization rules, budgets, loans, merchant overrides, and forecast settings. Ideal for transferring data between devices or keeping an offline backup.
            </Typography>
          </Box>

          <input
            ref={backupInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setBackupBusy(true);
              setBackupMsg(null);
              try {
                const text = await file.text();
                const res = await restoreWorkspaceBackup(text);
                setHasImportedData(true);
                setBackupMsg(
                  `Restored backup: +${res.restoredAccounts} new accounts, +${res.restoredTransactions} transactions, +${res.restoredRules} rules, ${res.restoredBudgets} budgets, and +${res.restoredLoans} loans.`
                );
              } catch (err) {
                setBackupMsg(`Error: ${(err as Error).message}`);
              } finally {
                setBackupBusy(false);
              }
            }}
          />

          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              color="primary"
              startIcon={<FileDownloadOutlinedIcon />}
              disabled={backupBusy}
              onClick={async () => {
                setBackupBusy(true);
                setBackupMsg(null);
                try {
                  const res = await downloadWorkspaceBackup();
                  setBackupMsg(
                    `Downloaded ${res.filename} (${res.counts.accounts} accounts, ${res.counts.transactions.toLocaleString()} transactions, ${res.counts.rules} rules, ${res.counts.budgets} budgets, ${res.counts.loans} loans).`
                  );
                } catch (err) {
                  setBackupMsg(`Error: ${(err as Error).message}`);
                } finally {
                  setBackupBusy(false);
                }
              }}
              sx={UNIFORM_TOOLBAR_BUTTON_SX}
            >
              Export Full Backup (.json)
            </Button>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<FileUploadOutlinedIcon />}
              disabled={backupBusy}
              onClick={() => backupInputRef.current?.click()}
              sx={UNIFORM_TOOLBAR_BUTTON_SX}
            >
              Restore from Backup (.json)
            </Button>
          </Stack>

          {backupMsg && (
            <Alert
              severity={backupMsg.startsWith('Error') ? 'error' : 'success'}
              onClose={() => setBackupMsg(null)}
              sx={{ borderRadius: 1 }}
            >
              {backupMsg}
            </Alert>
          )}
        </Stack>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 1 }}>
        <Stack spacing={2}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <DeleteIcon fontSize="small" color="error" />
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, color: 'error.main' }}>
                Imported data
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Removes all transactions, accounts, and batch history you imported. This will not affect demo data, default categories, or customization rules.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={onClearImported}
              disabled={clearImportedBusy || !hasImportedData}
              sx={UNIFORM_TOOLBAR_BUTTON_SX}
            >
              Clear all imported data
            </Button>
          </Stack>

          {clearImportedMsg && (
            <Alert
              severity={clearImportedMsg.startsWith('Error') ? 'error' : 'success'}
              onClose={() => setClearImportedMsg(null)}
              sx={{ borderRadius: 1 }}
            >
              {clearImportedMsg}
            </Alert>
          )}
        </Stack>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 1 }}>
        <Stack spacing={2}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <ScienceIcon fontSize="small" color="primary" />
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
                System Stability &amp; Diagnostics
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Configure system-level stability safeguards. If your application freezes or crashes on startup due to WebView2 GPU driver conflicts on Windows, you can launch the app in Safe Mode.
            </Typography>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600, mb: 1 }}>
              Safe Mode Status
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Launch the application via terminal or shortcut with the <code>--safe-mode</code> or <code>-s</code> flag to disable WebView2 GPU hardware acceleration.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Chip
                label={safeMode ? 'Safe Mode Active' : 'Safe Mode Inactive'}
                color={safeMode ? 'warning' : 'default'}
                size="small"
                sx={{ fontWeight: 600 }}
              />
              <Typography variant="caption" color="text.secondary">
                GPU Hardware Acceleration: <strong>{safeMode ? 'OFF (Safe/CPU)' : 'ON (GPU)'}</strong>
              </Typography>
            </Box>
          </Box>

          <Divider />

          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
            <Box>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <ShieldOutlinedIcon fontSize="small" color="success" />
                <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600 }}>
                  Privacy Policy &amp; Data Safety
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                100% local SQLite storage · Zero cloud telemetry · Instant on-device data deletion
              </Typography>
            </Box>
            <Button
              component={RouterLink}
              to="/privacy"
              size="small"
              variant="outlined"
              startIcon={<ShieldOutlinedIcon fontSize="small" />}
              sx={UNIFORM_TOOLBAR_BUTTON_SX}
            >
              View Privacy Policy
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Model Context Protocol (MCP) & Mobile AI Snapshot Card (Compact) */}
      <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 1 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap={1.5}
        >
          <Box sx={{ flex: 1, minWidth: 240 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <HubIcon fontSize="small" color="primary" />
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
                Claude / ChatGPT &amp; MCP Integration
              </Typography>
              <Chip
                label="Mobile Snapshot + Desktop MCP"
                size="small"
                color="primary"
                variant="outlined"
                sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Copy a live financial summary to paste into Claude or ChatGPT on any phone, or copy the local MCP config JSON for Claude Desktop / Cursor on PC &amp; Mac.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              variant="contained"
              color={copiedMobileAiContext ? 'success' : 'primary'}
              startIcon={copiedMobileAiContext ? <CheckIcon /> : <SmartphoneIcon />}
              disabled={copyingMobileAiBusy}
              onClick={handleCopyMobileAiContext}
              sx={UNIFORM_TOOLBAR_BUTTON_SX}
            >
              {copiedMobileAiContext ? 'Copied Snapshot!' : 'Copy Mobile AI Snapshot'}
            </Button>
            <Button
              size="small"
              variant={copiedMcp ? 'contained' : 'outlined'}
              color={copiedMcp ? 'success' : 'primary'}
              startIcon={copiedMcp ? <CheckIcon /> : <ContentCopyIcon />}
              onClick={handleCopyMcpConfig}
              sx={UNIFORM_TOOLBAR_BUTTON_SX}
            >
              {copiedMcp ? 'Copied MCP JSON' : 'Copy Desktop MCP JSON'}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: { xs: 3, sm: 5 }, display: 'flex', justifyContent: 'center', bgcolor: 'transparent', boxShadow: 'none', mt: { xs: 2, sm: 4 } }}>
        <AnimatedLogo scale={8} spinSpeed={0} />
      </Paper>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle sx={{ fontWeight: 600 }}>{confirmTitle}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {confirmMessage}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button variant="outlined" onClick={() => setConfirmOpen(false)} color="inherit" sx={UNIFORM_TOOLBAR_BUTTON_SX}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            sx={UNIFORM_TOOLBAR_BUTTON_SX}
            onClick={async () => {
              setConfirmOpen(false);
              if (confirmType === 'clearImported') {
                await executeClearImported();
              }
              setConfirmType(null);
            }}
            autoFocus
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
