import { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { styled } from '@mui/material/styles';
import {
  Box,
  Stack,
  Typography,
  Paper,
  Button,
  Alert,
  Chip,
  TextField,
  IconButton,
  Switch,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Snackbar,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VisibilityIcon from '@mui/icons-material/Visibility';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import CodeIcon from '@mui/icons-material/Code';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

import { db } from '../db';
import type { AgentSkill, SkillTestCase } from '../types';
import { useChatStore, formatModelName } from '../chatStore';
import { GENERAL_SYSTEM_PROMPT, runSkillTestCase, runSystemPromptTestCase, BASELINE_TEST_CASES, parseAIResponse, getMessageDisplayContent, extractFieldUsingRegex } from '../ai';

const StyledTextarea = styled('textarea')(({ theme }) => ({
  flex: 1,
  width: '100%',
  height: '100%',
  minHeight: 0,
  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
  fontSize: 13,
  lineHeight: 1.65,
  backgroundColor: theme.palette.grey[50],
  color: theme.palette.text.primary,
  padding: '24px',
  borderRadius: 0,
  border: 'none',
  outline: 'none',
  resize: 'none',
  overflowY: 'scroll',
  boxSizing: 'border-box',
  '&:disabled': {
    color: theme.palette.text.secondary,
  },
  '&::-webkit-scrollbar': {
    width: '8px',
    height: '8px',
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: theme.palette.grey[100],
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: '4px',
  },
  '&::-webkit-scrollbar-thumb:hover': {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
}));

interface AgentToolInfo {
  name: string;
  label: string;
  desc: string;
  insertTemplate: string;
}

const AGENT_TOOLS: AgentToolInfo[] = [
  {
    name: 'filter',
    label: 'Filter Transactions',
    desc: 'Filter transaction list by categories, preset, accounts or search query.',
    insertTemplate: '- Set the "action" to "filter" and specify "categories" (or "accounts", "preset", "search") in your agent_action JSON response.'
  },
  {
    name: 'query_data',
    label: 'Query Database Aggregates',
    desc: 'Calculate financial aggregates (totals, averages, counts) over categories and accounts.',
    insertTemplate: '- Set the "action" to "query_data" in your agent_action response to retrieve math aggregates from the private database.'
  },
  {
    name: 'subscription_alerts',
    label: 'Subscription Auditing',
    desc: 'Scan recurring payments for price spikes, duplicate charges, or billing date anomalies.',
    insertTemplate: '- Set the "action" to "subscription_alerts" in your agent_action response to audit subscription records.'
  },
  {
    name: 'spending_anomalies',
    label: 'Anomalies Detector',
    desc: 'Identify transaction outliers or budget overrun spikes in spending category histories.',
    insertTemplate: '- Set the "action" to "spending_anomalies" in your agent_action response to highlight outliers for the user.'
  },
  {
    name: 'create_artifact',
    label: 'Create Artifact',
    desc: 'Draft and display system prompts, spreadsheet tables, or reports as standalone cards.',
    insertTemplate: '- Set the "action" to "create_artifact" and "type" to "skill" | "markdown" | "spreadsheet" along with "title" and "content".'
  },
  {
    name: 'update_artifact',
    label: 'Update Artifact',
    desc: 'Modify the content, title, or type of an active artifact displayed in the panel.',
    insertTemplate: '- Set the "action" to "update_artifact" and specify the artifact "id" along with the updated "content".'
  },
  {
    name: 'audit_accessibility',
    label: 'Accessibility Audit',
    desc: 'Audit DOM layout landmarks, WCAG heading skips, contrast issues, and ARIA labels.',
    insertTemplate: '- Set the "action" to "audit_accessibility" in your agent_action response to request an accessibility compliance report.'
  },
  {
    name: 'dom_update',
    label: 'DOM Element Clicks',
    desc: 'Execute interactive navigations and clicks via CSS selectors (e.g. #import-csv-btn).',
    insertTemplate: '- Set the "action" to "dom_update" and provide the target CSS selector in "domSelector" to click elements.'
  },
  {
    name: 'navigate',
    label: 'Page Navigation',
    desc: 'Direct the UI to navigate to a page (e.g. /, /budget, /settings, /import, /agent-skills).',
    insertTemplate: '- Set the "action" to "navigate" and specify "page" (e.g. "/budget") in your agent_action JSON response.'
  },
  {
    name: 'none',
    label: 'No Operation (Default)',
    desc: 'Set when giving text-only responses, data tables, and math calculations without UI updates.',
    insertTemplate: '- Set the "action" to "none" in your agent_action JSON response to perform text analysis without trigger events.'
  }
];

const GEN_UX_COMPONENTS = [
  {
    name: 'choices',
    label: 'Gen UX: Interactive Choices',
    desc: 'Render clickable buttons in the chat stream to guide scoping (e.g. YTD vs Last Month).',
    insertTemplate: '- Set "gen_ux" to {"type": "choices", "options": ["Choice A", "Choice B"]} to offer interactive buttons.'
  },
  {
    name: 'confirmation',
    label: 'Gen UX: Confirmation',
    desc: 'Ask the user to confirm a critical or destructive action (e.g., delete artifact).',
    insertTemplate: '- Set "gen_ux" to {"type": "confirmation", "options": []} to display confirm/cancel buttons.'
  },
  {
    name: 'form',
    label: 'Gen UX: Form Inputs',
    desc: 'Render multi-field inputs for complex user parameters or onboarding.',
    insertTemplate: '- Set "gen_ux" to {"type": "form", "options": []} to invoke structured input forms.'
  },
  {
    name: 'none_ux',
    label: 'Gen UX: None (Standard Text)',
    desc: 'Default for standard markdown text, tables, and normal chat conversations.',
    insertTemplate: '- Set "gen_ux" to {"type": "none", "options": []} when no interactive UI components are required.'
  }
];

const BUILTIN_SKILLS: AgentSkill[] = [];

export default function AgentSkills() {
  const licenseSetting = useLiveQuery(() => db.settings.get('license'), []);
  const license = licenseSetting?.value as { active: boolean; key: string } | undefined;

  const [licenseKey, setLicenseKey] = useState('');
  const [licenseError, setLicenseError] = useState<string | null>(null);

  const skillsSetting = useLiveQuery(() => db.settings.get('app:agentSkills'), []);
  const skills = useMemo(() => (skillsSetting?.value as AgentSkill[]) || [], [skillsSetting]);

  const [activeTab, setActiveTab] = useState(0); // 0 = Custom Agent Skills, 1 = Baseline System Prompt, 2 = Recent LLM Output
  const chatMessages = useChatStore((s) => s.messages);
  const modelName = useChatStore((s) => s.modelName);

  const [systemPromptText, setSystemPromptText] = useState('');
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadPrompt = async () => {
      const res = await db.settings.get('app:systemPrompt');
      if (res && typeof res.value === 'string' && res.value.trim() !== '') {
        setSystemPromptText(res.value);
      } else {
        setSystemPromptText(GENERAL_SYSTEM_PROMPT);
      }
    };
    if (activeTab === 1) {
      loadPrompt();
    }
  }, [activeTab]);

  const handleSaveSystemPrompt = async () => {
    try {
      await db.settings.put({
        key: 'app:systemPrompt',
        value: systemPromptText
      });
      setSnackbarMessage('System prompt saved successfully!');
    } catch (err: any) {
      console.error('Failed to save system prompt:', err);
      setSnackbarMessage(`Error saving prompt: ${err.message}`);
    }
  };

  const handleResetSystemPrompt = async () => {
    try {
      await db.settings.delete('app:systemPrompt');
      setSystemPromptText(GENERAL_SYSTEM_PROMPT);
      setSnackbarMessage('System prompt reset to default!');
    } catch (err: any) {
      console.error('Failed to reset system prompt:', err);
      setSnackbarMessage(`Error resetting prompt: ${err.message}`);
    }
  };

  // Skill Editor Form State
  const [editorSkill, setEditorSkill] = useState<AgentSkill | null>(null);
  const [skillFormName, setSkillFormName] = useState('');
  const [skillFormDesc, setSkillFormDesc] = useState('');
  const [skillFormPrompt, setSkillFormPrompt] = useState('');
  const [skillFormError, setSkillFormError] = useState<string | null>(null);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const baselineTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Autocomplete and tools state
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteFilter, setAutocompleteFilter] = useState('');
  const [selectedAutocompleteIndex, setSelectedAutocompleteIndex] = useState(0);

  const filteredTools = [
    ...AGENT_TOOLS.map(t => ({ ...t, kind: 'tool' as const })),
    ...GEN_UX_COMPONENTS.map(g => ({ ...g, kind: 'gen_ux' as const, name: g.name === 'none_ux' ? 'none' : g.name }))
  ].filter(item => 
    item.name.toLowerCase().includes(autocompleteFilter.toLowerCase()) ||
    item.label.toLowerCase().includes(autocompleteFilter.toLowerCase())
  );

  const insertTextAtCursor = (textToInsert: string, isBaseline = false) => {
    const textarea = isBaseline ? baselineTextareaRef.current : textareaRef.current;
    if (!textarea) {
      if (isBaseline) {
        setSystemPromptText(prev => prev + '\n' + textToInsert);
      } else {
        setSkillFormPrompt(prev => prev + '\n' + textToInsert);
      }
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = isBaseline ? systemPromptText : skillFormPrompt;
    const newText = currentText.substring(0, start) + textToInsert + currentText.substring(end);
    
    if (isBaseline) {
      setSystemPromptText(newText);
    } else {
      setSkillFormPrompt(newText);
    }

    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
    }, 50);
  };

  const handleEditorChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, isBaseline = false) => {
    const val = e.target.value;
    if (isBaseline) {
      setSystemPromptText(val);
    } else {
      setSkillFormPrompt(val);
      if (editorSkill?.isBuiltIn) return;
    }

    const textarea = isBaseline ? baselineTextareaRef.current : textareaRef.current;
    if (!textarea) return;

    const caretPos = textarea.selectionStart;
    const textBeforeCaret = val.substring(0, caretPos);
    
    // Check if user is typing a slash command
    const slashIndex = textBeforeCaret.lastIndexOf('/');
    if (slashIndex >= 0 && slashIndex >= textBeforeCaret.lastIndexOf(' ') - 1 && slashIndex >= textBeforeCaret.lastIndexOf('\n') - 1) {
      const query = textBeforeCaret.substring(slashIndex + 1);
      // Ensure there are no spaces or newlines in the query
      if (!query.includes(' ') && !query.includes('\n')) {
        setAutocompleteFilter(query);
        setShowAutocomplete(true);
        setSelectedAutocompleteIndex(0);
        return;
      }
    }
    setShowAutocomplete(false);
  };

  const insertSelectedTool = (tool: { insertTemplate: string }) => {
    const isBaseline = editorSkill === null && activeTab === 1;
    const textarea = isBaseline ? baselineTextareaRef.current : textareaRef.current;
    if (!textarea) return;

    const caretPos = textarea.selectionStart;
    const currentText = isBaseline ? systemPromptText : skillFormPrompt;
    
    const textBeforeCaret = currentText.substring(0, caretPos);
    const slashIndex = textBeforeCaret.lastIndexOf('/');
    
    if (slashIndex >= 0) {
      const newText = currentText.substring(0, slashIndex) + tool.insertTemplate + currentText.substring(caretPos);
      if (isBaseline) {
        setSystemPromptText(newText);
      } else {
        setSkillFormPrompt(newText);
      }
      setShowAutocomplete(false);
      
      setTimeout(() => {
        textarea.focus();
        const newCaret = slashIndex + tool.insertTemplate.length;
        textarea.selectionStart = textarea.selectionEnd = newCaret;
      }, 50);
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showAutocomplete || filteredTools.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedAutocompleteIndex(prev => (prev + 1) % filteredTools.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedAutocompleteIndex(prev => (prev - 1 + filteredTools.length) % filteredTools.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      insertSelectedTool(filteredTools[selectedAutocompleteIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowAutocomplete(false);
    }
  };

  const handleInsertVariable = (variable: string) => {
    if (editorSkill?.isBuiltIn) return;
    insertTextAtCursor(variable, false);
    navigator.clipboard.writeText(variable);
    setCopiedVar(variable);
  };

  // Seed default skills
  useEffect(() => {
    const seedSkills = async () => {
      const setting = await db.settings.get('app:agentSkills');
      const currentSkills = (setting?.value as AgentSkill[]) || [];
      
      let hasChanges = false;
      const updatedSkills: AgentSkill[] = [];

      // Add custom skills and migrate/convert 'builtin:runway' to isBuiltIn = false
      for (const skill of currentSkills) {
        if (!skill.isBuiltIn) {
          updatedSkills.push(skill);
        } else {
          if (skill.id === 'builtin:runway') {
            updatedSkills.push({
              ...skill,
              isBuiltIn: false
            });
            hasChanges = true;
          } else {
            hasChanges = true;
          }
        }
      }

      const runwaySkillExists = updatedSkills.some(s => s.id === 'builtin:runway');
      if (!runwaySkillExists) {
        updatedSkills.push({
          id: 'builtin:runway',
          name: 'Financial Runway & Cash Projection',
          description: 'Guides the model on calculating the budget runway matching the dashboard drawer, Credit CC debt impact, and zero-income cash rundown simulation.',
          systemPromptExtension: `- When asked about financial runway, how much runway you have, or how long until cash runs out, calculate the runway in months using the variables from the system state context (Net Cash starting reserves and Current Monthly Outflow). Specifically, calculate: Runway (Months) = Net Cash starting reserves / Current Monthly Outflow.
- Explain that this represents how long your cash reserves will fund your current monthly budget (active budgets + recurring costs) under a zero-income assumption, matching the runway calculation in the dashboard filter drawer.
- Explicitly show the starting cash, monthly outflow, and the resulting runway months.
- Since you perform this calculation directly from the context, do NOT run any database actions (set agent_action.action to "none" and gen_ux.type to "none").
- Present the runway calculations in a markdown table containing: Starting Cash Reserves, Monthly Outflow (Budgets + Recurring), and Runway Months.
- When asked about Credit Card Debt or the "Project runway" (cash rundown projection) feature:
  * Explain that Credit Card Debt is a real, dynamic number retrieved from the current balances of all enabled credit card accounts. In Net Cash calculations, this outstanding debt (usually a negative number in the accounts database) is added to the checking/savings cash balance, reducing the starting cash reserves.
  * Explain that Project Runway represents a cash rundown simulation under a zero-income assumption. It projects month-by-month how long current cash reserves will last to fund the monthly budget (which consists of active category budgets plus recurring costs), drawing down the cash reserves by the monthly budget amount each month until it reaches zero.`,
          enabled: true,
          isBuiltIn: false,
          testCases: [
            {
              prompt: "How much runway do I have?",
              criteria: "Must state that the calculated runway matches the dashboard filter drawer (10.0 months based on Net Cash starting reserves of $10,000.00 and Current Monthly Outflow of $1,000.00)."
            },
            {
              prompt: "If I get 30k of income how much runway would I have if I raise the budget by $1000/month",
              criteria: "Must recalculate the projected runway by adding $30,000 to the cash reserves (totaling $40,000.00), adding $1,000/month to the budget/outflow (totaling $2,000/month), and dividing the updated cash reserves by the updated monthly outflow to get exactly 20 months."
            }
          ]
        });
        hasChanges = true;
      }

      if (hasChanges || updatedSkills.length !== currentSkills.length) {
        await db.settings.put({ key: 'app:agentSkills', value: updatedSkills });
      }

      // Automatically migrate database-saved system prompt if it exists
      const systemPromptDb = await db.settings.get('app:systemPrompt');
      if (systemPromptDb && typeof systemPromptDb.value === 'string') {
        let value = systemPromptDb.value;
        let changed = false;

        // Scrub Rule 21 and Rule 22 from the database-saved system prompt because we moved them to a dedicated built-in skill.
        const rule21Regexes = [
          /21\.\s+calculate runway in months and days[\s\S]*?in the final response\.\r?\n?/i,
          /21\.\s+When asked about financial runway[\s\S]*?resulting runway months\.\r?\n?/i,
          /21\.\s+When asked about financial runway[\s\S]*?\(set agent_action\.action to "none" and gen_ux\.type to "none"\)\.\r?\n?/i
        ];
        const rule22Regexes = [
          /22\.\s+When asked about Credit Card Debt[\s\S]*?until it reaches zero\.\r?\n?/i
        ];

        for (const regex of rule21Regexes) {
          if (regex.test(value)) {
            value = value.replace(regex, '');
            changed = true;
          }
        }
        for (const regex of rule22Regexes) {
          if (regex.test(value)) {
            value = value.replace(regex, '');
            changed = true;
          }
        }

        if (changed) {
          await db.settings.put({ key: 'app:systemPrompt', value });
        }
      }
    };
    seedSkills();
  }, []);

  // Redirect to full-page editor if we have an active skill artifact
  useEffect(() => {
    const activeArt = useChatStore.getState().activeArtifact;
    if (activeArt && activeArt.type === 'skill') {
      const matched = skills.find(s => s.name === activeArt.title);
      if (matched) {
        handleOpenEditSkill(matched);
        useChatStore.getState().setActiveArtifact(null);
      }
    }
  }, [skills]);

  const onActivateLicense = async () => {
    setLicenseError(null);
    if (licenseKey.trim().toUpperCase() === 'PRO-123') {
      await db.settings.put({ key: 'license', value: { active: true, key: licenseKey.trim().toUpperCase() } });
      setLicenseKey('');
    } else {
      setLicenseError("Invalid license key. For testing, try 'PRO-123'.");
    }
  };

  const handleToggleSkill = async (skillId: string) => {
    const setting = await db.settings.get('app:agentSkills');
    const currentSkills = (setting?.value as AgentSkill[]) || [];
    const updated = currentSkills.map(s => s.id === skillId ? { ...s, enabled: !s.enabled } : s);
    await db.settings.put({ key: 'app:agentSkills', value: updated });
  };

  const handleDeleteSkill = async (skillId: string) => {
    const setting = await db.settings.get('app:agentSkills');
    const currentSkills = (setting?.value as AgentSkill[]) || [];
    const updated = currentSkills.filter(s => s.id !== skillId);
    await db.settings.put({ key: 'app:agentSkills', value: updated });
  };

  const handleSaveSkill = async (skill: Omit<AgentSkill, 'enabled'> & { enabled?: boolean }) => {
    const setting = await db.settings.get('app:agentSkills');
    const currentSkills = (setting?.value as AgentSkill[]) || [];
    
    let updated: AgentSkill[];
    const existingIndex = currentSkills.findIndex(s => s.id === skill.id);
    if (existingIndex >= 0) {
      updated = [...currentSkills];
      updated[existingIndex] = {
        ...currentSkills[existingIndex],
        ...skill,
        enabled: skill.enabled ?? currentSkills[existingIndex].enabled,
        testCases: skill.testCases ?? currentSkills[existingIndex].testCases ?? []
      };
    } else {
      updated = [
        ...currentSkills,
        {
          id: skill.id || `custom:${Date.now()}`,
          name: skill.name,
          description: skill.description,
          systemPromptExtension: skill.systemPromptExtension,
          enabled: true,
          isBuiltIn: false,
          testCases: skill.testCases || []
        }
      ];
    }
    await db.settings.put({ key: 'app:agentSkills', value: updated });
  };

  // State for Diagnostic Suites Workspace
  const [sidebarTab, setSidebarTab] = useState(0); // 0 = Config, 1 = Diagnostics
  const [diagnosticResults, setDiagnosticResults] = useState<Record<number, { success?: boolean; score?: number; reasoning?: string; output?: string; error?: string; running?: boolean }>>({});
  const [isRunningSuite, setIsRunningSuite] = useState(false);
  const [suiteProgress, setSuiteProgress] = useState('');
  const [selectedInspectTest, setSelectedInspectTest] = useState<{ index: number; prompt: string; criteria: string; result: any } | null>(null);

  // State for Baseline System Prompt Diagnostics
  const [baselineSidebarTab, setBaselineSidebarTab] = useState(0); // 0 = Reference Guide, 1 = Diagnostics
  const [baselineDiagnosticResults, setBaselineDiagnosticResults] = useState<Record<number, { success?: boolean; score?: number; reasoning?: string; output?: string; error?: string; running?: boolean }>>({});
  const [isBaselineRunningSuite, setIsBaselineRunningSuite] = useState(false);
  const [baselineSuiteProgress, setBaselineSuiteProgress] = useState('');


  // Form states for test case editing/creating
  const [showAddTestCaseForm, setShowAddTestCaseForm] = useState(false);
  const [editingTestCaseIndex, setEditingTestCaseIndex] = useState<number | null>(null);
  const [testCasePromptText, setTestCasePromptText] = useState('');
  const [testCaseCriteriaText, setTestCaseCriteriaText] = useState('');

  // Form states for baseline test case editing/creating
  const [showAddBaselineTestCaseForm, setShowAddBaselineTestCaseForm] = useState(false);
  const [editingBaselineTestCaseIndex, setEditingBaselineTestCaseIndex] = useState<number | null>(null);
  const [baselineTestCasePromptText, setBaselineTestCasePromptText] = useState('');
  const [baselineTestCaseCriteriaText, setBaselineTestCaseCriteriaText] = useState('');

  const baselineTestCasesSetting = useLiveQuery(
    () => db.settings.get('app:baselineTestCases'),
    []
  );
  const baselineTestCases = useMemo(() => {
    return (baselineTestCasesSetting?.value as SkillTestCase[]) || BASELINE_TEST_CASES;
  }, [baselineTestCasesSetting]);

  const handleOpenAddSkill = () => {
    setEditorSkill({
      id: '',
      name: '',
      description: '',
      systemPromptExtension: '',
      enabled: true,
      isBuiltIn: false,
      testCases: []
    });
    setSkillFormName('');
    setSkillFormDesc('');
    setSkillFormPrompt('');
    setSkillFormError(null);
    setSidebarTab(0);
    setDiagnosticResults({});
    setIsRunningSuite(false);
    setSuiteProgress('');
    setShowAddTestCaseForm(false);
    setEditingTestCaseIndex(null);
  };

  const handleOpenEditSkill = (skill: AgentSkill) => {
    setEditorSkill(skill);
    setSkillFormName(skill.name);
    setSkillFormDesc(skill.description);
    setSkillFormPrompt(skill.systemPromptExtension);
    setSkillFormError(null);
    setSidebarTab(0);
    setDiagnosticResults({});
    setIsRunningSuite(false);
    setSuiteProgress('');
    setShowAddTestCaseForm(false);
    setEditingTestCaseIndex(null);
  };

  const handleSaveSkillForm = async () => {
    if (!skillFormName.trim() || !skillFormPrompt.trim()) {
      setSkillFormError('Name and system prompt instructions are required.');
      return;
    }
    
    const skillData = {
      id: editorSkill?.id || `custom:${Date.now()}`,
      name: skillFormName.trim(),
      description: skillFormDesc.trim(),
      systemPromptExtension: skillFormPrompt.trim(),
      isBuiltIn: editorSkill?.isBuiltIn || false,
      enabled: editorSkill?.enabled ?? true,
      testCases: editorSkill?.testCases || [],
    };
    
    await handleSaveSkill(skillData);
    setEditorSkill(null);
  };

  const handleSaveTestCase = async () => {
    if (!editorSkill) return;
    if (!testCasePromptText.trim() || !testCaseCriteriaText.trim()) return;

    const newTestCase: SkillTestCase = {
      prompt: testCasePromptText.trim(),
      criteria: testCaseCriteriaText.trim()
    };

    const currentCases = editorSkill.testCases || [];
    let updatedCases: SkillTestCase[];

    if (editingTestCaseIndex !== null) {
      updatedCases = [...currentCases];
      updatedCases[editingTestCaseIndex] = newTestCase;
    } else {
      updatedCases = [...currentCases, newTestCase];
    }

    const updatedSkill = { ...editorSkill, testCases: updatedCases };
    setEditorSkill(updatedSkill);

    await handleSaveSkill(updatedSkill);

    setShowAddTestCaseForm(false);
    setEditingTestCaseIndex(null);
    setTestCasePromptText('');
    setTestCaseCriteriaText('');
    setSnackbarMessage(editingTestCaseIndex !== null ? 'Test case updated successfully!' : 'Test case added successfully!');
  };

  const handleDeleteTestCase = async (index: number) => {
    if (!editorSkill) return;

    const currentCases = editorSkill.testCases || [];
    const updatedCases = currentCases.filter((_, idx) => idx !== index);

    const updatedSkill = { ...editorSkill, testCases: updatedCases };
    setEditorSkill(updatedSkill);

    await handleSaveSkill(updatedSkill);

    const updatedResults = { ...diagnosticResults };
    delete updatedResults[index];
    setDiagnosticResults(updatedResults);

    setSnackbarMessage('Test case deleted successfully!');
  };

  const handleSaveBaselineTestCase = async () => {
    const newTestCase: SkillTestCase = {
      prompt: baselineTestCasePromptText.trim(),
      criteria: baselineTestCaseCriteriaText.trim()
    };

    const currentCases = [...baselineTestCases];
    if (editingBaselineTestCaseIndex !== null) {
      currentCases[editingBaselineTestCaseIndex] = newTestCase;
    } else {
      currentCases.push(newTestCase);
    }

    await db.settings.put({
      key: 'app:baselineTestCases',
      value: currentCases
    });

    setShowAddBaselineTestCaseForm(false);
    setEditingBaselineTestCaseIndex(null);
    setBaselineTestCasePromptText('');
    setBaselineTestCaseCriteriaText('');
    setSnackbarMessage(editingBaselineTestCaseIndex !== null ? 'Baseline test case updated!' : 'Baseline test case added!');
  };

  const handleDeleteBaselineTestCase = async (index: number) => {
    const currentCases = baselineTestCases.filter((_, idx) => idx !== index);
    await db.settings.put({
      key: 'app:baselineTestCases',
      value: currentCases
    });

    const updatedResults = { ...baselineDiagnosticResults };
    delete updatedResults[index];
    setBaselineDiagnosticResults(updatedResults);
    setSnackbarMessage('Baseline test case deleted.');
  };

  const handleRunDiagnostics = async () => {
    if (!editorSkill || !editorSkill.testCases || editorSkill.testCases.length === 0) return;

    const currentSkillDraft: AgentSkill = {
      ...editorSkill,
      name: skillFormName.trim(),
      description: skillFormDesc.trim(),
      systemPromptExtension: skillFormPrompt,
    };

    setIsRunningSuite(true);
    setDiagnosticResults({});

    const total = editorSkill.testCases.length;

    for (let i = 0; i < total; i++) {
      setSuiteProgress(`Running test case ${i + 1} of ${total}...`);
      setDiagnosticResults(prev => ({
        ...prev,
        [i]: { running: true }
      }));

      try {
        const testCase = editorSkill.testCases[i];
        const result = await runSkillTestCase(currentSkillDraft, testCase);
        
        setDiagnosticResults(prev => ({
          ...prev,
          [i]: {
            running: false,
            success: result.success,
            score: result.score,
            reasoning: result.reasoning,
            output: result.output
          }
        }));
      } catch (err: any) {
        setDiagnosticResults(prev => ({
          ...prev,
          [i]: {
            running: false,
            success: false,
            score: 0,
            reasoning: `Failure: ${err.message}`,
            error: err.message
          }
        }));
      }
    }

    setIsRunningSuite(false);
    setSuiteProgress('');
    setSnackbarMessage('Diagnostic suite completed!');
  };

  const handleRunBaselineDiagnostics = async () => {
    if (isBaselineRunningSuite) return;
    setIsBaselineRunningSuite(true);
    setBaselineDiagnosticResults({});

    const total = baselineTestCases.length;

    for (let i = 0; i < total; i++) {
      setBaselineSuiteProgress(`Running test case ${i + 1} of ${total}...`);
      setBaselineDiagnosticResults(prev => ({
        ...prev,
        [i]: { running: true }
      }));

      try {
        const testCase = baselineTestCases[i];
        const result = await runSystemPromptTestCase(systemPromptText, testCase);
        
        setBaselineDiagnosticResults(prev => ({
          ...prev,
          [i]: {
            running: false,
            success: result.success,
            score: result.score,
            reasoning: result.reasoning,
            output: result.output
          }
        }));
      } catch (err: any) {
        setBaselineDiagnosticResults(prev => ({
          ...prev,
          [i]: {
            running: false,
            success: false,
            score: 0,
            reasoning: `Failure: ${err.message}`,
            error: err.message
          }
        }));
      }
    }

    setIsBaselineRunningSuite(false);
    setBaselineSuiteProgress('');
    setSnackbarMessage('Baseline diagnostics completed!');
  };

  const handleRunIndividualBaselineTestCase = async (index: number) => {
    setBaselineDiagnosticResults(prev => ({
      ...prev,
      [index]: { running: true }
    }));

    try {
      const testCase = baselineTestCases[index];
      const result = await runSystemPromptTestCase(systemPromptText, testCase);
      
      setBaselineDiagnosticResults(prev => ({
        ...prev,
        [index]: {
          running: false,
          success: result.success,
          score: result.score,
          reasoning: result.reasoning,
          output: result.output
        }
      }));
    } catch (err: any) {
      setBaselineDiagnosticResults(prev => ({
        ...prev,
        [index]: {
          running: false,
          success: false,
          score: 0,
          reasoning: `Failure: ${err.message}`,
          error: err.message
        }
      }));
    }
  };


  if (!license?.active) {
    return (
      <Stack spacing={3} sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
        <Paper sx={{ p: 4, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <Box
            sx={{
              position: 'absolute',
              top: -50,
              right: -50,
              width: 150,
              height: 150,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(25, 118, 210, 0.05) 0%, rgba(25, 118, 210, 0) 70%)',
            }}
          />
          <VpnKeyIcon color="primary" sx={{ fontSize: 48, mb: 2 }} />
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
            Strictly Spending Pro
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Unlock advanced local features like private Local AI transaction reviews, custom Agent Skills, and native Watch Folders with a one-time license key purchase.
          </Typography>
          <Stack spacing={2} sx={{ maxWidth: 360, mx: 'auto' }}>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                label="License Key"
                placeholder="PRO-..."
                value={licenseKey}
                onChange={e => setLicenseKey(e.target.value)}
                fullWidth
              />
              <Button variant="contained" onClick={onActivateLicense} disabled={!licenseKey.trim()}>
                Activate
              </Button>
            </Stack>
            {licenseError && <Alert severity="error">{licenseError}</Alert>}
            <Typography variant="caption" color="text.secondary">
              For testing and demonstration, use the license key: <strong>PRO-123</strong>
            </Typography>
          </Stack>
        </Paper>
      </Stack>
    );
  }

  if (editorSkill !== null) {
    const isBuiltIn = editorSkill.isBuiltIn;
    const virtualFileName = editorSkill.id
      ? (isBuiltIn ? editorSkill.id.split(':')[1] : `${editorSkill.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`)
      : 'new_skill';

    return (
      <Stack spacing={2.5} sx={{ height: '100%' }}>
        {/* Editor Top Bar / Navigation Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => setEditorSkill(null)}
              sx={{ textTransform: 'none', fontWeight: 600 }}
              variant="outlined"
              size="small"
            >
              Back
            </Button>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary', fontSize: 13, display: { xs: 'none', sm: 'flex' } }}>
              <FolderOpenIcon sx={{ fontSize: 16, color: 'action.active' }} />
              <span>agent</span>
              <span>/</span>
              <span>skills</span>
              <span>/</span>
              <span>{isBuiltIn ? 'builtin' : 'custom'}</span>
              <span>/</span>
              <span style={{ fontWeight: 600, color: '#1976d2', fontFamily: 'monospace' }}>
                {virtualFileName}.md
              </span>
            </Stack>
          </Stack>
          
          <Stack direction="row" spacing={1.5}>
            <Button variant="outlined" onClick={() => setEditorSkill(null)} sx={{ textTransform: 'none' }} size="small">
              Cancel
            </Button>
            {!isBuiltIn && (
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveSkillForm}
                sx={{ textTransform: 'none', px: 3 }}
                size="small"
              >
                Save
              </Button>
            )}
          </Stack>
        </Box>

        {/* Full-Page IDE Workspace */}
        <Paper
          sx={{
            display: 'flex',
            flexDirection: 'row',
            height: 'calc(100vh - 180px)',
            minHeight: '580px',
            p: 0,
            borderRadius: 2,
            overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            border: '1px solid rgba(0,0,0,0.08)',
          }}
        >
          {/* Left Panel: Sidebar (Metadata, Reference Guide, & Diagnostics) */}
          <Box
            sx={{
              width: 320,
              flexShrink: 0,
              borderRight: '1px solid rgba(0,0,0,0.08)',
              display: 'flex',
              flexDirection: 'column',
              bgcolor: '#ffffff',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            {/* Sidebar Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
              <Tabs
                value={sidebarTab}
                onChange={(_, val) => setSidebarTab(val)}
                variant="fullWidth"
                sx={{
                  minHeight: 40,
                  '& .MuiTab-root': {
                    minHeight: 40,
                    py: 1,
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'none',
                    letterSpacing: 0.5,
                  }
                }}
              >
                <Tab label="Config" />
                <Tab label="Diagnostics" />
              </Tabs>
            </Box>

            {sidebarTab === 0 && (
              <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {/* Metadata Section */}
                <Box sx={{ p: 2.5, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      fontSize: 10,
                      mb: 2,
                    }}
                  >
                    Capability Details
                  </Typography>
                  
                  {skillFormError && (
                    <Alert severity="error" sx={{ mb: 2, py: 0, '& .MuiAlert-message': { fontSize: 12 } }}>
                      {skillFormError}
                    </Alert>
                  )}

                  <Stack spacing={2.5}>
                    <TextField
                      label="Capability Name"
                      value={skillFormName}
                      onChange={(e) => setSkillFormName(e.target.value)}
                      fullWidth
                      size="small"
                      required
                      disabled={isBuiltIn}
                      placeholder="e.g., Category Triage Guide"
                      slotProps={{
                        inputLabel: { shrink: true }
                      }}
                    />
                    <TextField
                      label="Short Description"
                      value={skillFormDesc}
                      onChange={(e) => setSkillFormDesc(e.target.value)}
                      fullWidth
                      size="small"
                      multiline
                      rows={3}
                      disabled={isBuiltIn}
                      placeholder="e.g., Directs the model on how to detect and label subscription fee spikes..."
                      slotProps={{
                        inputLabel: { shrink: true }
                      }}
                    />
                  </Stack>
                </Box>

                {/* Guide & Interactive Variables */}
                <Box sx={{ p: 2.5, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      fontSize: 10,
                      mb: 1.5,
                    }}
                  >
                    Live Prompt Variables
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 11.5, lineHeight: 1.4 }}>
                    {isBuiltIn
                      ? 'Core instructions use variables linked to real transaction data:'
                      : 'Click a variable to insert it at your editor cursor position:'}
                  </Typography>

                  <Stack spacing={1.5}>
                    {[
                      { label: 'Category Baseline', code: '{{Dining:baseline}}', desc: 'Average monthly dining baseline spend.' },
                      { label: 'Category Savings', code: '{{Dining:savings}}', desc: 'Current target simulator savings.' },
                      { label: 'Category Projected', code: '{{Dining:projected}}', desc: 'Forecasted spend (baseline minus savings).' },
                      { label: 'Total Savings', code: '{{total_savings}}', desc: 'Sum of all target savings in workspace.' },
                    ].map((item) => (
                      <Paper
                        key={item.code}
                        variant="outlined"
                        onClick={() => handleInsertVariable(item.code)}
                        sx={{
                          p: 1.5,
                          cursor: isBuiltIn ? 'default' : 'pointer',
                          borderColor: 'rgba(0,0,0,0.06)',
                          bgcolor: isBuiltIn ? 'grey.50' : 'background.default',
                          transition: 'all 0.2s',
                          opacity: isBuiltIn ? 0.85 : 1,
                          '&:hover': isBuiltIn ? {} : {
                            borderColor: 'primary.main',
                            bgcolor: 'rgba(25, 118, 210, 0.02)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                          }
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', fontSize: 11 }}>
                            {item.label}
                          </Typography>
                          {!isBuiltIn && (
                            <ContentCopyIcon sx={{ fontSize: 11, color: 'text.secondary' }} />
                          )}
                        </Stack>
                        <Typography
                          variant="caption"
                          component="code"
                          sx={{
                            fontFamily: 'monospace',
                            bgcolor: 'grey.100',
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 0.5,
                            fontSize: 10.5,
                            color: 'secondary.main',
                            display: 'inline-block',
                            mb: 0.5,
                            fontWeight: 600,
                          }}
                        >
                          {item.code}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 10.5, lineHeight: 1.3 }}>
                          {item.desc}
                        </Typography>
                      </Paper>
                    ))}
                  </Stack>
                </Box>

                {/* Agent Tools & Actions Reference */}
                <Box sx={{ p: 2.5 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      fontSize: 10,
                      mb: 1.5,
                    }}
                  >
                    Agent Tools & Actions
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 11.5, lineHeight: 1.4 }}>
                    {isBuiltIn
                      ? 'The agent is equipped with these schema actions to manage filters, query data, or manipulate artifacts:'
                      : 'Click a tool to insert its system prompt template into the editor:'}
                  </Typography>

                  <Stack spacing={1.5}>
                    {AGENT_TOOLS.map((tool) => (
                      <Paper
                        key={tool.name}
                        variant="outlined"
                        onClick={() => {
                          if (isBuiltIn) return;
                          insertTextAtCursor(tool.insertTemplate, false);
                        }}
                        sx={{
                          p: 1.5,
                          cursor: isBuiltIn ? 'default' : 'pointer',
                          borderColor: 'rgba(0,0,0,0.06)',
                          bgcolor: isBuiltIn ? 'grey.50' : 'background.default',
                          transition: 'all 0.2s',
                          opacity: isBuiltIn ? 0.85 : 1,
                          '&:hover': isBuiltIn ? {} : {
                            borderColor: 'primary.main',
                            bgcolor: 'rgba(25, 118, 210, 0.02)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                          }
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', fontSize: 11 }}>
                            {tool.label}
                          </Typography>
                          {!isBuiltIn && (
                            <ContentCopyIcon sx={{ fontSize: 11, color: 'text.secondary' }} />
                          )}
                        </Stack>
                        <Typography
                          variant="caption"
                          component="code"
                          sx={{
                            fontFamily: 'monospace',
                            bgcolor: 'grey.100',
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 0.5,
                            fontSize: 10.5,
                            color: 'primary.main',
                            display: 'inline-block',
                            mb: 0.5,
                            fontWeight: 600,
                          }}
                        >
                          action: "{tool.name}"
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 10.5, lineHeight: 1.3 }}>
                          {tool.desc}
                        </Typography>
                      </Paper>
                    ))}
                  </Stack>
                </Box>

                {/* Gen UX Components Reference */}
                <Box sx={{ p: 2.5, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      fontSize: 10,
                      mb: 1.5,
                    }}
                  >
                    Gen UX Components
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 11.5, lineHeight: 1.4 }}>
                    {isBuiltIn
                      ? 'The agent can invoke these interactive user interface components within the chat stream:'
                      : 'Click a component to insert its system prompt template into the editor:'}
                  </Typography>

                  <Stack spacing={1.5}>
                    {GEN_UX_COMPONENTS.map((comp) => (
                      <Paper
                        key={comp.name}
                        variant="outlined"
                        onClick={() => {
                          if (isBuiltIn) return;
                          insertTextAtCursor(comp.insertTemplate, false);
                        }}
                        sx={{
                          p: 1.5,
                          cursor: isBuiltIn ? 'default' : 'pointer',
                          borderColor: 'rgba(0,0,0,0.06)',
                          bgcolor: isBuiltIn ? 'grey.50' : 'background.default',
                          transition: 'all 0.2s',
                          opacity: isBuiltIn ? 0.85 : 1,
                          '&:hover': isBuiltIn ? {} : {
                            borderColor: 'primary.main',
                            bgcolor: 'rgba(25, 118, 210, 0.02)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                          }
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', fontSize: 11 }}>
                            {comp.label}
                          </Typography>
                          {!isBuiltIn && (
                            <ContentCopyIcon sx={{ fontSize: 11, color: 'text.secondary' }} />
                          )}
                        </Stack>
                        <Typography
                          variant="caption"
                          component="code"
                          sx={{
                            fontFamily: 'monospace',
                            bgcolor: 'grey.100',
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 0.5,
                            fontSize: 10.5,
                            color: 'secondary.main',
                            display: 'inline-block',
                            mb: 0.5,
                            fontWeight: 600,
                          }}
                        >
                          gen_ux: "{comp.name === 'none_ux' ? 'none' : comp.name}"
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 10.5, lineHeight: 1.3 }}>
                          {comp.desc}
                        </Typography>
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              </Box>
            )}

            {sidebarTab === 1 && (
              <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
                {/* Diagnostics Suite Controls */}
                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      fontSize: 10,
                      mb: 1.5,
                    }}
                  >
                    Diagnostics Suite
                  </Typography>

                  {editorSkill.testCases && editorSkill.testCases.length > 0 ? (
                    <Stack spacing={1}>
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={handleRunDiagnostics}
                        disabled={isRunningSuite}
                        fullWidth
                        size="small"
                        startIcon={
                          isRunningSuite ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            <PlayArrowIcon />
                          )
                        }
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                      >
                        {isRunningSuite ? 'Running Suite...' : 'Run Diagnostics'}
                      </Button>
                      {isRunningSuite && (
                        <Typography variant="caption" sx={{ fontStyle: 'italic', textAlign: 'center', color: 'text.secondary', display: 'block' }}>
                          {suiteProgress}
                        </Typography>
                      )}
                    </Stack>
                  ) : (
                    <Alert severity="info" sx={{ py: 0.5, '& .MuiAlert-message': { fontSize: 11 } }}>
                      Add a test case to run diagnostics.
                    </Alert>
                  )}
                </Box>

                <Box sx={{ borderBottom: '1px solid rgba(0,0,0,0.06)', my: 1.5 }} />

                {/* Inline form to Add/Edit Test Case */}
                {showAddTestCaseForm || editingTestCaseIndex !== null ? (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderColor: 'primary.light',
                      bgcolor: 'rgba(25, 118, 210, 0.01)',
                      mb: 2,
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, fontSize: 12 }}>
                      {editingTestCaseIndex !== null ? 'Edit Test Case' : 'New Test Case'}
                    </Typography>
                    <Stack spacing={2}>
                      <TextField
                        label="Test Prompt"
                        placeholder="e.g., Audit subscription costs"
                        value={testCasePromptText}
                        onChange={(e) => setTestCasePromptText(e.target.value)}
                        size="small"
                        fullWidth
                        multiline
                        rows={2}
                        required
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                      <TextField
                        label="Expected Criteria"
                        placeholder="e.g., Must suggest double charge audits"
                        value={testCaseCriteriaText}
                        onChange={(e) => setTestCaseCriteriaText(e.target.value)}
                        size="small"
                        fullWidth
                        multiline
                        rows={2}
                        required
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          size="small"
                          onClick={() => {
                            setShowAddTestCaseForm(false);
                            setEditingTestCaseIndex(null);
                            setTestCasePromptText('');
                            setTestCaseCriteriaText('');
                          }}
                          sx={{ textTransform: 'none' }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={handleSaveTestCase}
                          disabled={!testCasePromptText.trim() || !testCaseCriteriaText.trim()}
                          sx={{ textTransform: 'none' }}
                        >
                          Save
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                ) : (
                  !isBuiltIn && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => {
                        setShowAddTestCaseForm(true);
                        setEditingTestCaseIndex(null);
                        setTestCasePromptText('');
                        setTestCaseCriteriaText('');
                      }}
                      sx={{ mb: 2, textTransform: 'none', fontWeight: 600 }}
                      fullWidth
                    >
                      Add Test Case
                    </Button>
                  )
                )}

                {/* Test Cases List */}
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    fontSize: 10,
                    mb: 1.5,
                  }}
                >
                  Test Cases ({editorSkill.testCases?.length || 0})
                </Typography>

                <Stack spacing={1.5} sx={{ pb: 2 }}>
                  {(!editorSkill.testCases || editorSkill.testCases.length === 0) ? (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', fontSize: 11, textAlign: 'center', py: 2 }}>
                      No test cases defined yet.
                    </Typography>
                  ) : (
                    editorSkill.testCases.map((tc, index) => {
                      const res = diagnosticResults[index];
                      return (
                        <Paper
                          key={index}
                          variant="outlined"
                          sx={{
                            p: 1.5,
                            borderColor: res?.running
                              ? 'primary.main'
                              : res?.success === true
                              ? 'success.light'
                              : res?.success === false
                              ? 'error.light'
                              : 'grey.200',
                            bgcolor: res?.running
                              ? 'rgba(25, 118, 210, 0.02)'
                              : res?.success === true
                              ? 'rgba(76, 175, 80, 0.01)'
                              : res?.success === false
                              ? 'rgba(244, 67, 54, 0.01)'
                              : 'background.paper',
                            boxShadow: res?.running ? '0 0 8px rgba(25, 118, 210, 0.1)' : 'none',
                          }}
                        >
                          <Stack spacing={1}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                Test Case #{index + 1}
                              </Typography>
                              {res && (
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                  {res.running ? (
                                    <Chip
                                      label="RUNNING"
                                      size="small"
                                      color="primary"
                                      variant="outlined"
                                      icon={<CircularProgress size={8} color="inherit" />}
                                      sx={{ height: 16, fontSize: 8, fontWeight: 700 }}
                                    />
                                  ) : res.success ? (
                                    <Chip
                                      label={`PASS (${res.score}%)`}
                                      size="small"
                                      color="success"
                                      sx={{ height: 16, fontSize: 8, fontWeight: 700 }}
                                    />
                                  ) : (
                                    <Chip
                                      label={`FAIL (${res.score}%)`}
                                      size="small"
                                      color="error"
                                      sx={{ height: 16, fontSize: 8, fontWeight: 700 }}
                                    />
                                  )}
                                </Stack>
                              )}
                            </Stack>

                            <Typography variant="body2" sx={{ fontSize: 11.5, fontWeight: 500, wordBreak: 'break-word' }}>
                              <strong>Prompt:</strong> "{tc.prompt}"
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10.5, display: 'block', wordBreak: 'break-word' }}>
                              <strong>Criteria:</strong> {tc.criteria}
                            </Typography>

                            {res && !res.running && (
                              <Box sx={{ mt: 0.5, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                                <Typography variant="caption" color="text.primary" sx={{ fontSize: 10.5, display: 'block', fontStyle: 'italic', wordBreak: 'break-word' }}>
                                  <strong>AI Reason:</strong> {res.reasoning}
                                </Typography>
                                <Button
                                  size="small"
                                  onClick={() => setSelectedInspectTest({ index, prompt: tc.prompt, criteria: tc.criteria, result: res })}
                                  sx={{ textTransform: 'none', fontSize: 10, mt: 0.5, p: 0, minWidth: 0, display: 'inline-block' }}
                                >
                                  Inspect Output
                                </Button>
                              </Box>
                            )}

                            {!isBuiltIn && !isRunningSuite && (
                              <Stack direction="row" spacing={0.5} justifyContent="flex-end" sx={{ mt: 0.5 }}>
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setEditingTestCaseIndex(index);
                                    setShowAddTestCaseForm(false);
                                    setTestCasePromptText(tc.prompt);
                                    setTestCaseCriteriaText(tc.criteria);
                                  }}
                                  title="Edit Test Case"
                                  sx={{ p: 0.25 }}
                                >
                                  <EditIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleDeleteTestCase(index)}
                                  title="Delete Test Case"
                                  sx={{ p: 0.25 }}
                                >
                                  <DeleteIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                              </Stack>
                            )}
                          </Stack>
                        </Paper>
                      );
                    })
                  )}
                </Stack>
              </Box>
            )}
          </Box>

          {/* Right Panel: Light Code Editor Canvas */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: 'grey.50', minWidth: 0 }}>
            {/* Editor Tab bar */}
            <Box
              sx={{
                height: 40,
                bgcolor: 'grey.100',
                borderBottom: '1px solid rgba(0,0,0,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 2.5,
                    height: '100%',
                    bgcolor: 'grey.50',
                    borderTop: '2px solid',
                    borderColor: 'primary.main',
                    color: 'text.primary',
                    fontFamily: 'monospace',
                    fontSize: '12.5px',
                    fontWeight: 600,
                  }}
                >
                  <CodeIcon sx={{ fontSize: 15, color: 'primary.main' }} />
                  instructions.md
                </Box>
              </Box>

              <Chip
                icon={isBuiltIn ? <LockIcon sx={{ fontSize: '13px !important', color: '#ff9800 !important' }} /> : <LockOpenIcon sx={{ fontSize: '13px !important', color: '#4caf50 !important' }} />}
                label={isBuiltIn ? 'READ-ONLY CORE PROMPT' : 'EDITABLE PROMPT'}
                size="small"
                variant="outlined"
                sx={{
                  height: 22,
                  fontSize: 9.5,
                  fontWeight: 600,
                  color: isBuiltIn ? '#ff9800' : '#4caf50',
                  borderColor: isBuiltIn ? 'rgba(255, 152, 0, 0.3)' : 'rgba(76, 175, 80, 0.3)',
                  bgcolor: isBuiltIn ? 'rgba(255, 152, 0, 0.04)' : 'rgba(76, 175, 80, 0.04)',
                }}
              />
            </Box>

            {/* IDE Editor Canvas */}
            <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <StyledTextarea
                ref={textareaRef}
                placeholder={
                  isBuiltIn 
                    ? "# Core instruction is blank" 
                    : "# Enter prompt instructions here...\n- Direct the model to prioritize certain spend insights\n- Teach the model to identify specific anomalies"
                }
                value={skillFormPrompt}
                onChange={handleEditorChange}
                onKeyDown={handleEditorKeyDown}
                disabled={isBuiltIn}
              />

              {/* Autocomplete floating list */}
              {showAutocomplete && filteredTools.length > 0 && (
                <Paper
                  elevation={8}
                  sx={{
                    position: 'absolute',
                    bottom: '36px',
                    left: '24px',
                    width: '380px',
                    maxHeight: '260px',
                    overflowY: 'auto',
                    zIndex: 100,
                    border: '1px solid rgba(0,0,0,0.12)',
                    borderRadius: 2,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
                    bgcolor: '#ffffff',
                  }}
                >
                  <Box sx={{ p: 1.25, borderBottom: '1px solid rgba(0,0,0,0.06)', bgcolor: 'grey.50' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Select Tool Action to Insert
                    </Typography>
                  </Box>
                  <Stack spacing={0.25} sx={{ p: 0.5 }}>
                    {filteredTools.map((tool, idx) => {
                      const isSelected = idx === selectedAutocompleteIndex;
                      return (
                        <Box
                          key={tool.name}
                          onClick={() => insertSelectedTool(tool)}
                          onMouseEnter={() => setSelectedAutocompleteIndex(idx)}
                          sx={{
                            p: 1.25,
                            borderRadius: 1,
                            cursor: 'pointer',
                            bgcolor: isSelected ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                            color: isSelected ? 'primary.main' : 'text.primary',
                            transition: 'all 0.15s',
                            '&:hover': {
                              bgcolor: 'rgba(25, 118, 210, 0.08)',
                            }
                          }}
                        >
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 12.5 }}>
                              {tool.label}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: 10,
                                bgcolor: isSelected ? 'rgba(25, 118, 210, 0.12)' : 'grey.100',
                                color: isSelected ? 'primary.main' : 'text.secondary',
                                px: 0.5,
                                py: 0.2,
                                borderRadius: 0.5,
                                fontWeight: 600,
                              }}
                            >
                              /{tool.name}
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, display: 'block', lineHeight: 1.3 }}>
                            {tool.desc}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Stack>
                </Paper>
              )}
            </Box>

            {/* Editor Status Bar */}
            <Box
              sx={{
                height: 28,
                bgcolor: 'grey.100',
                borderTop: '1px solid rgba(0,0,0,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                fontSize: '11px',
                color: 'text.secondary',
                fontFamily: 'monospace',
              }}
            >
              <Box>
                Markdown • {skillFormPrompt.length} chars • {skillFormPrompt.split('\n').length} lines
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {skillFormPrompt.length > 1500 ? (
                  <>
                    <WarningIcon sx={{ fontSize: 12, color: '#ff9800' }} />
                    <span style={{ color: '#ff9800' }}>Heavy payload for local LLM</span>
                  </>
                ) : (
                  <>
                    <CheckCircleIcon sx={{ fontSize: 12, color: '#4caf50' }} />
                    <span style={{ color: '#8f9ba8' }}>Optimal payload size</span>
                  </>
                )}
              </Box>
            </Box>
          </Box>
        </Paper>

        <Snackbar
          open={copiedVar !== null}
          autoHideDuration={2000}
          onClose={() => setCopiedVar(null)}
          message={copiedVar ? `Copied & inserted: ${copiedVar}` : ''}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        />

        {/* Inspect Test Case Completion Output Modal */}
        <Dialog
          open={selectedInspectTest !== null}
          onClose={() => setSelectedInspectTest(null)}
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: { borderRadius: 2 }
          }}
        >
          <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
            Inspect Diagnostic Completion (Test #{selectedInspectTest ? selectedInspectTest.index + 1 : 0})
          </DialogTitle>
          <DialogContent dividers>
            {selectedInspectTest && (
              <Stack spacing={2.5}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                    Test Prompt / Input
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: 12 }}>
                    {selectedInspectTest.prompt}
                  </Paper>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                    Expected Target Criteria
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, bgcolor: 'grey.50', fontSize: 12 }}>
                    {selectedInspectTest.criteria}
                  </Paper>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                    Evaluated Score & Status
                  </Typography>
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.5 }}>
                    <Chip
                      label={selectedInspectTest.result.success ? 'PASS' : 'FAIL'}
                      color={selectedInspectTest.result.success ? 'success' : 'error'}
                      size="small"
                      sx={{ fontWeight: 700 }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Score: {selectedInspectTest.result.score}/100
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic', color: 'text.secondary' }}>
                    <strong>Evaluator Reasoning:</strong> {selectedInspectTest.result.reasoning}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                    Raw Assistant Model Output
                  </Typography>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      mt: 0.5,
                      bgcolor: 'grey.900',
                      color: 'success.main',
                      fontFamily: 'monospace',
                      fontSize: 12.5,
                      whiteSpace: 'pre-wrap',
                      maxHeight: 300,
                      overflowY: 'auto'
                    }}
                  >
                    {selectedInspectTest.result.output || 'No output captured.'}
                  </Paper>
                </Box>
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelectedInspectTest(null)} variant="contained" sx={{ textTransform: 'none', px: 3 }}>
              Close
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          AI Prompts & Agent Skills Management
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Configure baseline LLM prompts and custom capability skills injected directly into the model context.
        </Typography>
      </Box>

      <Paper sx={{ p: 3 }}>
        <Stack spacing={2.5}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={activeTab} onChange={(_, val) => setActiveTab(val)}>
              <Tab label="Agent Skills Directory" />
              <Tab label="Baseline System Prompt" />
              <Tab label="Recent LLM Output" />
            </Tabs>
          </Box>

          {activeTab === 0 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Toggle active capabilities to dynamically append instructions to the LLM system prompt.
                </Typography>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleOpenAddSkill}
                  sx={{ textTransform: 'none' }}
                >
                  Add Custom Skill
                </Button>
              </Box>

              {skills.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 2, textAlign: 'center' }}>
                  No skills found. Seeding defaults...
                </Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'grey.50' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, width: 80 }}>Active</TableCell>
                        <TableCell sx={{ fontWeight: 600, width: 200 }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                        <TableCell sx={{ fontWeight: 600, width: 120 }}>Type</TableCell>
                        <TableCell sx={{ fontWeight: 600, width: 100 }} align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {skills.map((skill) => (
                        <TableRow key={skill.id} hover>
                          <TableCell>
                            <Switch
                              checked={skill.enabled}
                              onChange={() => handleToggleSkill(skill.id)}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 600,
                                cursor: 'pointer',
                                color: 'primary.main',
                                '&:hover': { textDecoration: 'underline' }
                              }}
                              onClick={() => handleOpenEditSkill(skill)}
                            >
                              {skill.name}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {skill.description}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={skill.isBuiltIn ? 'Built-in' : 'Custom'}
                              size="small"
                              color={skill.isBuiltIn ? 'primary' : 'secondary'}
                              variant="outlined"
                              sx={{ height: 20, fontSize: 10, fontWeight: 500 }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <IconButton
                                size="small"
                                onClick={() => handleOpenEditSkill(skill)}
                                color="primary"
                                title={skill.isBuiltIn ? "View Skill" : "Edit Skill"}
                              >
                                {skill.isBuiltIn ? <VisibilityIcon sx={{ fontSize: 18 }} /> : <EditIcon sx={{ fontSize: 18 }} />}
                              </IconButton>
                              {!skill.isBuiltIn && (
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteSkill(skill.id)}
                                  color="error"
                                  title="Delete Skill"
                                >
                                  <DeleteIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}

          {activeTab === 1 && (
            <Stack spacing={2} sx={{ height: 'calc(100vh - 280px)', minHeight: '520px' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  This prompt governs the offline chatbot model when matching natural language commands to page filters and reasoning over your financial data.
                </Typography>
                <Stack direction="row" spacing={1.5}>
                  <Button
                    variant="outlined"
                    color="inherit"
                    startIcon={<RefreshIcon />}
                    onClick={handleResetSystemPrompt}
                    size="small"
                    sx={{ textTransform: 'none' }}
                  >
                    Reset to Default
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={handleSaveSystemPrompt}
                    size="small"
                    sx={{ textTransform: 'none', px: 3 }}
                  >
                    Save Prompt
                  </Button>
                </Stack>
              </Box>

              <Paper
                sx={{
                  display: 'flex',
                  flexDirection: 'row',
                  flex: 1,
                  p: 0,
                  borderRadius: 2,
                  overflow: 'hidden',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                  border: '1px solid rgba(0,0,0,0.08)',
                }}
              >
                {/* Left Panel: Sidebar (Reference Guide & Diagnostics) */}
                <Box
                  sx={{
                    width: 300,
                    flexShrink: 0,
                    borderRight: '1px solid rgba(0,0,0,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: '#ffffff',
                    height: '100%',
                    overflow: 'hidden',
                  }}
                >
                  {/* Sidebar Tabs */}
                  <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
                    <Tabs
                      value={baselineSidebarTab}
                      onChange={(_, val) => setBaselineSidebarTab(val)}
                      variant="fullWidth"
                      sx={{
                        minHeight: 40,
                        '& .MuiTab-root': {
                          minHeight: 40,
                          py: 1,
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'none',
                          letterSpacing: 0.5,
                        }
                      }}
                    >
                      <Tab label="Reference" />
                      <Tab label="Diagnostics" />
                    </Tabs>
                  </Box>

                  {baselineSidebarTab === 0 && (
                    <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
                      {/* Agent Tools & Actions Reference */}
                      <Box sx={{ mb: 4 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 700,
                            color: 'text.secondary',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            fontSize: 10,
                            mb: 1.5,
                          }}
                        >
                          Agent Tools & Actions
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 11, lineHeight: 1.4 }}>
                          Click a tool to insert its system prompt template into the editor:
                        </Typography>

                        <Stack spacing={1.5}>
                          {AGENT_TOOLS.map((tool) => (
                            <Paper
                              key={tool.name}
                              variant="outlined"
                              onClick={() => insertTextAtCursor(tool.insertTemplate, true)}
                              sx={{
                                p: 1.25,
                                cursor: 'pointer',
                                borderColor: 'rgba(0,0,0,0.06)',
                                bgcolor: 'background.default',
                                transition: 'all 0.2s',
                                '&:hover': {
                                  borderColor: 'primary.main',
                                  bgcolor: 'rgba(25, 118, 210, 0.02)',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                }
                              }}
                            >
                              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', fontSize: 10.5 }}>
                                  {tool.label}
                                </Typography>
                                <ContentCopyIcon sx={{ fontSize: 11, color: 'text.secondary' }} />
                              </Stack>
                              <Typography
                                variant="caption"
                                component="code"
                                sx={{
                                  fontFamily: 'monospace',
                                  bgcolor: 'grey.100',
                                  px: 0.75,
                                  py: 0.25,
                                  borderRadius: 0.5,
                                  fontSize: 10,
                                  color: 'primary.main',
                                  display: 'inline-block',
                                  mb: 0.5,
                                  fontWeight: 600,
                                }}
                              >
                                action: "{tool.name}"
                              </Typography>
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 10, lineHeight: 1.3 }}>
                                {tool.desc}
                              </Typography>
                            </Paper>
                          ))}
                        </Stack>
                      </Box>

                      {/* Gen UX Components Reference */}
                      <Box sx={{ borderTop: '1px solid rgba(0,0,0,0.06)', pt: 2.5 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 700,
                            color: 'text.secondary',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            fontSize: 10,
                            mb: 1.5,
                          }}
                        >
                          Gen UX Components
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 11, lineHeight: 1.4 }}>
                          Click a component to insert its system prompt template into the editor:
                        </Typography>

                        <Stack spacing={1.5}>
                          {GEN_UX_COMPONENTS.map((comp) => (
                            <Paper
                              key={comp.name}
                              variant="outlined"
                              onClick={() => insertTextAtCursor(comp.insertTemplate, true)}
                              sx={{
                                p: 1.25,
                                cursor: 'pointer',
                                borderColor: 'rgba(0,0,0,0.06)',
                                bgcolor: 'background.default',
                                transition: 'all 0.2s',
                                '&:hover': {
                                  borderColor: 'primary.main',
                                  bgcolor: 'rgba(25, 118, 210, 0.02)',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                }
                              }}
                            >
                              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', fontSize: 10.5 }}>
                                  {comp.label}
                                </Typography>
                                <ContentCopyIcon sx={{ fontSize: 11, color: 'text.secondary' }} />
                              </Stack>
                              <Typography
                                variant="caption"
                                component="code"
                                sx={{
                                  fontFamily: 'monospace',
                                  bgcolor: 'grey.100',
                                  px: 0.75,
                                  py: 0.25,
                                  borderRadius: 0.5,
                                  fontSize: 10,
                                  color: 'secondary.main',
                                  display: 'inline-block',
                                  mb: 0.5,
                                  fontWeight: 600,
                                }}
                              >
                                gen_ux: "{comp.name === 'none_ux' ? 'none' : comp.name}"
                              </Typography>
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 10, lineHeight: 1.3 }}>
                                {comp.desc}
                              </Typography>
                            </Paper>
                          ))}
                        </Stack>
                      </Box>
                    </Box>
                  )}

                  {baselineSidebarTab === 1 && (
                    <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5, display: 'flex', flexDirection: 'column' }}>
                      {/* Diagnostics Suite Controls */}
                      <Box sx={{ mb: 2 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 700,
                            color: 'text.secondary',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            fontSize: 10,
                            mb: 1.5,
                          }}
                        >
                          Diagnostics Suite
                        </Typography>

                        <Stack spacing={1}>
                          <Button
                            variant="contained"
                            color="primary"
                            onClick={handleRunBaselineDiagnostics}
                            disabled={isBaselineRunningSuite}
                            fullWidth
                            size="small"
                            startIcon={
                              isBaselineRunningSuite ? (
                                <CircularProgress size={16} color="inherit" />
                              ) : (
                                <PlayArrowIcon />
                              )
                            }
                            sx={{ textTransform: 'none', fontWeight: 600 }}
                          >
                            {isBaselineRunningSuite ? 'Running Suite...' : 'Run Diagnostics'}
                          </Button>
                          {isBaselineRunningSuite && (
                            <Typography variant="caption" sx={{ fontStyle: 'italic', textAlign: 'center', color: 'text.secondary', display: 'block' }}>
                              {baselineSuiteProgress}
                            </Typography>
                          )}
                        </Stack>
                      </Box>

                      <Box sx={{ borderBottom: '1px solid rgba(0,0,0,0.06)', my: 1.5 }} />

                      {/* Inline form to Add/Edit Baseline Test Case */}
                      {showAddBaselineTestCaseForm || editingBaselineTestCaseIndex !== null ? (
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 2,
                            borderColor: 'primary.light',
                            bgcolor: 'rgba(25, 118, 210, 0.01)',
                            mb: 2,
                          }}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, fontSize: 12 }}>
                            {editingBaselineTestCaseIndex !== null ? 'Edit Baseline Test Case' : 'New Baseline Test Case'}
                          </Typography>
                          <Stack spacing={2}>
                            <TextField
                              label="Test Prompt"
                              placeholder="e.g., Show food spending"
                              value={baselineTestCasePromptText}
                              onChange={(e) => setBaselineTestCasePromptText(e.target.value)}
                              size="small"
                              fullWidth
                              multiline
                              rows={2}
                              required
                              slotProps={{ inputLabel: { shrink: true } }}
                            />
                            <TextField
                              label="Expected Criteria"
                              placeholder="e.g., Must map to Groceries"
                              value={baselineTestCaseCriteriaText}
                              onChange={(e) => setBaselineTestCaseCriteriaText(e.target.value)}
                              size="small"
                              fullWidth
                              multiline
                              rows={2}
                              required
                              slotProps={{ inputLabel: { shrink: true } }}
                            />
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              <Button
                                size="small"
                                onClick={() => {
                                  setShowAddBaselineTestCaseForm(false);
                                  setEditingBaselineTestCaseIndex(null);
                                  setBaselineTestCasePromptText('');
                                  setBaselineTestCaseCriteriaText('');
                                }}
                                sx={{ textTransform: 'none' }}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="small"
                                variant="contained"
                                onClick={handleSaveBaselineTestCase}
                                disabled={!baselineTestCasePromptText.trim() || !baselineTestCaseCriteriaText.trim()}
                                sx={{ textTransform: 'none' }}
                              >
                                Save
                              </Button>
                            </Stack>
                          </Stack>
                        </Paper>
                      ) : (
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => {
                            setShowAddBaselineTestCaseForm(true);
                            setEditingBaselineTestCaseIndex(null);
                            setBaselineTestCasePromptText('');
                            setBaselineTestCaseCriteriaText('');
                          }}
                          sx={{ mb: 2, textTransform: 'none', fontWeight: 600 }}
                          fullWidth
                        >
                          Add Baseline Test Case
                        </Button>
                      )}

                      {/* Test Cases List */}
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 700,
                          color: 'text.secondary',
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                          fontSize: 10,
                          mb: 1.5,
                        }}
                      >
                        Baseline Test Cases ({baselineTestCases.length})
                      </Typography>

                      <Stack spacing={1.5} sx={{ pb: 2 }}>
                        {baselineTestCases.map((tc, index) => {
                          const res = baselineDiagnosticResults[index];
                          return (
                            <Paper
                              key={index}
                              variant="outlined"
                              sx={{
                                p: 1.5,
                                borderColor: res?.running
                                  ? 'primary.main'
                                  : res?.success === true
                                  ? 'success.light'
                                  : res?.success === false
                                  ? 'error.light'
                                  : 'grey.200',
                                bgcolor: res?.running
                                  ? 'rgba(25, 118, 210, 0.02)'
                                  : res?.success === true
                                  ? 'rgba(76, 175, 80, 0.01)'
                                  : res?.success === false
                                  ? 'rgba(244, 67, 54, 0.01)'
                                  : 'background.paper',
                                boxShadow: res?.running ? '0 0 8px rgba(25, 118, 210, 0.1)' : 'none',
                              }}
                            >
                              <Stack spacing={1}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                    Test Case #{index + 1}
                                  </Typography>
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    {res && (
                                      <Stack direction="row" spacing={0.5} alignItems="center">
                                        {res.running ? (
                                          <Chip
                                            label="RUNNING"
                                            size="small"
                                            color="primary"
                                            variant="outlined"
                                            icon={<CircularProgress size={8} color="inherit" />}
                                            sx={{ height: 16, fontSize: 8, fontWeight: 700 }}
                                          />
                                        ) : res.success ? (
                                          <Chip
                                            label={`PASS (${res.score}%)`}
                                            size="small"
                                            color="success"
                                            sx={{ height: 16, fontSize: 8, fontWeight: 700 }}
                                          />
                                        ) : (
                                          <Chip
                                            label={`FAIL (${res.score}%)`}
                                            size="small"
                                            color="error"
                                            sx={{ height: 16, fontSize: 8, fontWeight: 700 }}
                                          />
                                        )}
                                      </Stack>
                                    )}
                                    <Button
                                      size="small"
                                      onClick={() => handleRunIndividualBaselineTestCase(index)}
                                      disabled={res?.running || isBaselineRunningSuite}
                                      variant="outlined"
                                      sx={{
                                        textTransform: 'none',
                                        fontSize: 9,
                                        height: 18,
                                        py: 0,
                                        px: 1,
                                        minWidth: 0,
                                        borderRadius: 1,
                                      }}
                                    >
                                      {res?.running ? 'Running...' : 'Run Test'}
                                    </Button>
                                  </Stack>
                                </Stack>

                                <Typography variant="body2" sx={{ fontSize: 11.5, fontWeight: 500, wordBreak: 'break-word' }}>
                                  <strong>Prompt:</strong> "{tc.prompt}"
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10.5, display: 'block', wordBreak: 'break-word' }}>
                                  <strong>Criteria:</strong> {tc.criteria}
                                </Typography>

                                {res && !res.running && (
                                  <Box sx={{ mt: 0.5, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                                    <Typography variant="caption" color="text.primary" sx={{ fontSize: 10.5, display: 'block', fontStyle: 'italic', wordBreak: 'break-word' }}>
                                      <strong>AI Reason:</strong> {res.reasoning}
                                    </Typography>
                                    <Button
                                      size="small"
                                      onClick={() => setSelectedInspectTest({ index, prompt: tc.prompt, criteria: tc.criteria, result: res })}
                                      sx={{ textTransform: 'none', fontSize: 10, mt: 0.5, p: 0, minWidth: 0, display: 'inline-block' }}
                                    >
                                      Inspect Output
                                    </Button>
                                  </Box>
                                )}

                                {!isBaselineRunningSuite && (
                                  <Stack direction="row" spacing={0.5} justifyContent="flex-end" sx={{ mt: 0.5 }}>
                                    <IconButton
                                      size="small"
                                      onClick={() => {
                                        setEditingBaselineTestCaseIndex(index);
                                        setShowAddBaselineTestCaseForm(false);
                                        setBaselineTestCasePromptText(tc.prompt);
                                        setBaselineTestCaseCriteriaText(tc.criteria);
                                      }}
                                      title="Edit Test Case"
                                      sx={{ p: 0.25 }}
                                    >
                                      <EditIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() => handleDeleteBaselineTestCase(index)}
                                      title="Delete Test Case"
                                      sx={{ p: 0.25 }}
                                    >
                                      <DeleteIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Stack>
                                )}
                              </Stack>
                            </Paper>
                          );
                        })}
                      </Stack>
                    </Box>
                  )}
                </Box>


                {/* Right Panel: Light Code Editor Canvas */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: 'grey.50', minWidth: 0, position: 'relative' }}>
                  {/* Editor Tab bar */}
                  <Box
                    sx={{
                      height: 40,
                      bgcolor: 'grey.100',
                      borderBottom: '1px solid rgba(0,0,0,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 2,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 2.5,
                          height: '100%',
                          bgcolor: 'grey.50',
                          borderTop: '2px solid',
                          borderColor: 'primary.main',
                          color: 'text.primary',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        <CodeIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                        system_prompt.md
                      </Box>
                    </Box>

                    <Chip
                      label="GLOBAL SYSTEM INSTRUCTIONS"
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 20,
                        fontSize: 9.5,
                        fontWeight: 600,
                        color: 'primary.main',
                        borderColor: 'primary.light',
                        bgcolor: 'rgba(25, 118, 210, 0.04)',
                      }}
                    />
                  </Box>

                  {/* IDE Editor Canvas */}
                  <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                    <StyledTextarea
                      ref={baselineTextareaRef}
                      placeholder="# Enter system prompt instructions here..."
                      value={systemPromptText}
                      onChange={(e) => handleEditorChange(e, true)}
                      onKeyDown={handleEditorKeyDown}
                    />

                    {/* Autocomplete floating list */}
                    {showAutocomplete && filteredTools.length > 0 && editorSkill === null && (
                      <Paper
                        elevation={8}
                        sx={{
                          position: 'absolute',
                          bottom: '36px',
                          left: '24px',
                          width: '380px',
                          maxHeight: '260px',
                          overflowY: 'auto',
                          zIndex: 100,
                          border: '1px solid rgba(0,0,0,0.12)',
                          borderRadius: 2,
                          boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
                          bgcolor: '#ffffff',
                        }}
                      >
                        <Box sx={{ p: 1.25, borderBottom: '1px solid rgba(0,0,0,0.06)', bgcolor: 'grey.50' }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Select Action to Insert
                          </Typography>
                        </Box>
                        <Stack spacing={0.25} sx={{ p: 0.5 }}>
                          {filteredTools.map((tool, idx) => {
                            const isSelected = idx === selectedAutocompleteIndex;
                            return (
                              <Box
                                key={tool.name}
                                onClick={() => insertSelectedTool(tool)}
                                onMouseEnter={() => setSelectedAutocompleteIndex(idx)}
                                sx={{
                                  p: 1.25,
                                  borderRadius: 1,
                                  cursor: 'pointer',
                                  bgcolor: isSelected ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                                  color: isSelected ? 'primary.main' : 'text.primary',
                                  transition: 'all 0.15s',
                                  '&:hover': {
                                    bgcolor: 'rgba(25, 118, 210, 0.08)',
                                  }
                                }}
                              >
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 12.5 }}>
                                    {tool.label}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontFamily: 'monospace',
                                      fontSize: 10,
                                      bgcolor: isSelected ? 'rgba(25, 118, 210, 0.12)' : 'grey.100',
                                      color: isSelected ? 'primary.main' : 'text.secondary',
                                      px: 0.5,
                                      py: 0.2,
                                      borderRadius: 0.5,
                                      fontWeight: 600,
                                    }}
                                  >
                                    /{tool.name}
                                  </Typography>
                                </Stack>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, display: 'block', lineHeight: 1.3 }}>
                                  {tool.desc}
                                </Typography>
                              </Box>
                            );
                          })}
                        </Stack>
                      </Paper>
                    )}
                  </Box>

                  {/* Editor Status Bar */}
                  <Box
                    sx={{
                      height: 28,
                      bgcolor: 'grey.100',
                      borderTop: '1px solid rgba(0,0,0,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 2,
                      fontSize: '11px',
                      color: 'text.secondary',
                      fontFamily: 'monospace',
                    }}
                  >
                    <Box>
                      Markdown • {systemPromptText.length} chars • {systemPromptText.split('\n').length} lines
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {systemPromptText.length > 5000 ? (
                        <>
                          <WarningIcon sx={{ fontSize: 12, color: '#ff9800' }} />
                          <span style={{ color: '#ff9800' }}>Heavy payload for local LLM</span>
                        </>
                      ) : (
                        <>
                          <CheckCircleIcon sx={{ fontSize: 12, color: '#4caf50' }} />
                          <span style={{ color: '#8f9ba8' }}>Optimal payload size</span>
                        </>
                      )}
                    </Box>
                  </Box>
                </Box>
              </Paper>
            </Stack>
          )}

          {activeTab === 2 && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Raw JSON output from the last {formatModelName(modelName)} completion (Developer Console).
              </Typography>
              <Paper
                variant="outlined"
                component="pre"
                sx={{
                  p: 2.5,
                  bgcolor: 'grey.900',
                  color: 'success.main',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                  maxHeight: '500px',
                  overflowY: 'auto'
                }}
              >
                {(() => {
                  const lastMsg = chatMessages.slice().reverse().find(m => m.role === 'assistant');
                  if (!lastMsg) return 'No assistant messages yet.';
                  try {
                    // Prettify if it's JSON
                    return JSON.stringify(JSON.parse(lastMsg.content), null, 2);
                  } catch (e) {
                    return lastMsg.content;
                  }
                })()}
              </Paper>
            </Box>
          )}
        </Stack>
      </Paper>
      {/* Inspect Test Case Completion Output Modal */}
      <Dialog
        open={selectedInspectTest !== null}
        onClose={() => setSelectedInspectTest(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2 }
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Inspect Diagnostic Completion (Test #{selectedInspectTest ? selectedInspectTest.index + 1 : 0})
        </DialogTitle>
        <DialogContent dividers>
          {selectedInspectTest && (
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                  Test Prompt / Input
                </Typography>
                <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: 12 }}>
                  {selectedInspectTest.prompt}
                </Paper>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                  Expected Target Criteria
                </Typography>
                <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, bgcolor: 'grey.50', fontSize: 12 }}>
                  {selectedInspectTest.criteria}
                </Paper>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                  Evaluated Score & Status
                </Typography>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.5 }}>
                  <Chip
                    label={selectedInspectTest.result.success ? 'PASS' : 'FAIL'}
                    color={selectedInspectTest.result.success ? 'success' : 'error'}
                    size="small"
                    sx={{ fontWeight: 700 }}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Score: {selectedInspectTest.result.score}/100
                  </Typography>
                </Stack>
                <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic', color: 'text.secondary' }}>
                  <strong>Evaluator Reasoning:</strong> {selectedInspectTest.result.reasoning}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                  Rendered Output (User View)
                </Typography>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    mt: 0.5,
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 350,
                    overflowY: 'auto'
                  }}
                >
                  {getRenderedOutput(selectedInspectTest.result.output)}
                </Paper>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                  Raw Assistant Model Output
                </Typography>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    mt: 0.5,
                    bgcolor: 'grey.900',
                    color: 'success.main',
                    fontFamily: 'monospace',
                    fontSize: 12.5,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 250,
                    overflowY: 'auto'
                  }}
                >
                  {selectedInspectTest.result.output || 'No output captured.'}
                </Paper>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedInspectTest(null)} variant="contained" sx={{ textTransform: 'none', px: 3 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage || ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Stack>
  );
}

function getRenderedOutput(output: string): string {
  if (!output) return 'No output captured.';
  try {
    const parsed = parseAIResponse(output);
    if (parsed) {
      return parsed.body || parsed.explanation || output;
    }
  } catch {
    // Ignore
  }
  const bodyField = extractFieldUsingRegex(output, 'body') || 
                    extractFieldUsingRegex(output, 'explanation') || 
                    extractFieldUsingRegex(output, 'message') || 
                    extractFieldUsingRegex(output, 'text');
  if (bodyField) return bodyField;
  return output;
}

