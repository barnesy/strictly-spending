import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Box, Stack, Typography, Paper, Tabs, Tab, Snackbar } from '@mui/material';
import { db } from '../db';
import type { AgentSkill, SkillTestCase } from '../types';
import { useChatStore } from '../chatStore';
import { GENERAL_SYSTEM_PROMPT, runSkillTestCase, runSystemPromptTestCase, BASELINE_TEST_CASES } from '../ai';

import { LicenseGate } from '../components/AgentSkills/LicenseGate';
import { TestCaseDialog } from '../components/AgentSkills/TestCaseDialog';
import { InspectDiagnosticModal } from '../components/AgentSkills/InspectDiagnosticModal';
import type { DiagnosticResult, InspectDiagnosticData } from '../components/AgentSkills/InspectDiagnosticModal';
import { SkillsDirectory } from '../components/AgentSkills/SkillsDirectory';
import { BaselinePromptEditor } from '../components/AgentSkills/BaselinePromptEditor';
import { RecentLLMOutput } from '../components/AgentSkills/RecentLLMOutput';
import { SkillEditor } from '../components/AgentSkills/SkillEditor';
import { AGENT_TOOLS } from '../components/AgentSkills/constants';

export const AgentSkills: React.FC = () => {
  const license = useLiveQuery(() => db.settings.get('license'), [])?.value as { active: boolean; key: string } | undefined;
  const chatMessages = useChatStore((state) => state.messages);
  const activeModel = useChatStore((state) => state.modelName);
  
  // App state
  const [activeTab, setActiveTab] = useState(0); // 0 = Skills, 1 = Baseline System Prompt, 2 = LLM Output
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  // License state
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseError, setLicenseError] = useState<string | null>(null);

  const handleActivateLicense = async () => {
    if (licenseKey.trim() === 'PRO-123') {
      await db.settings.put({
        key: 'license',
        value: { active: true, key: 'PRO-123', activatedAt: new Date().toISOString() }
      });
      setLicenseError(null);
    } else {
      setLicenseError('Invalid license key. Try "PRO-123".');
    }
  };

  // Database settings
  const skillsSetting = useLiveQuery(() => db.settings.get('app:agentSkills'), []);
  const skills = (skillsSetting?.value as AgentSkill[]) || [];
  
  const systemPromptSetting = useLiveQuery(() => db.settings.get('app:systemPrompt'), []);
  
  // Shared Editor & Autocomplete state
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const baselineTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteFilter, setAutocompleteFilter] = useState('');
  const [selectedAutocompleteIndex, setSelectedAutocompleteIndex] = useState(0);

  const filteredTools = useMemo(() => {
    return AGENT_TOOLS.filter(t => t.name.toLowerCase().includes(autocompleteFilter.toLowerCase()));
  }, [autocompleteFilter]);

  // Skill Editor state
  const [editorSkill, setEditorSkill] = useState<AgentSkill | null>(null);
  const [skillFormName, setSkillFormName] = useState('');
  const [skillFormDesc, setSkillFormDesc] = useState('');
  const [skillFormPrompt, setSkillFormPrompt] = useState('');
  const [skillFormError, setSkillFormError] = useState<string | null>(null);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  // Baseline prompt state
  const [systemPromptText, setSystemPromptText] = useState(GENERAL_SYSTEM_PROMPT);

  useEffect(() => {
    if (systemPromptSetting && systemPromptSetting.value) {
      setSystemPromptText(systemPromptSetting.value as string);
    }
  }, [systemPromptSetting]);

  // Handle autocomplete matching tools insertion
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
    
    const slashIndex = textBeforeCaret.lastIndexOf('/');
    if (slashIndex >= 0 && slashIndex >= textBeforeCaret.lastIndexOf(' ') - 1 && slashIndex >= textBeforeCaret.lastIndexOf('\n') - 1) {
      const query = textBeforeCaret.substring(slashIndex + 1);
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

      for (const skill of currentSkills) {
        if (skill.isBuiltIn) {
          hasChanges = true;
          continue;
        }
        updatedSkills.push(skill);
      }

      const runwaySkillExists = updatedSkills.some(s => s.id === 'builtin:runway');
      if (!runwaySkillExists) {
        updatedSkills.push({
          id: 'builtin:runway',
          name: 'Financial Runway & Cash Projection',
          description: 'Uses the project_runway tool to calculate budget runway based on cash reserves, CC debt, and monthly outflow.',
          systemPromptExtension: `- When asked about financial runway, cash rundown, or CC debt:
  1. Stage 1: You MUST set 'agent_action.action' to 'project_runway'. Do NOT perform calculations or output tables in the body during Stage 1.
  2. Stage 2: Once the runway metrics are returned, output the starting cash reserves, monthly outflow, and runway months in a clean markdown table.
  3. If the user asks for a simulation (e.g. "What if I get $30k more cash?"), adjust the returned base numbers mathematically.`,
          enabled: true,
          isBuiltIn: false,
          testCases: [
            {
              prompt: "How much runway do I have?",
              criteria: "Must call the project_runway action in Stage 1, and in Stage 2 format the runway metrics in a markdown table."
            },
            {
              prompt: "If I get 30k of income how much runway would I have if I raise the budget by $1000/month",
              criteria: "Must call project_runway in Stage 1, and in Stage 2 mathematically adjust the provided numbers in a markdown table (e.g. 20 months)."
            }
          ]
        });
        hasChanges = true;
      }

      const categorizationSkillExists = updatedSkills.some(s => s.id === 'builtin:categorization');
      if (!categorizationSkillExists) {
        updatedSkills.push({
          id: 'builtin:categorization',
          name: 'Manual Transaction Categorization',
          description: 'Uses local AI to auto-categorize uncategorized transactions chunk-by-chunk.',
          systemPromptExtension: `- When asked to auto-categorize, sort, organize, classify, or run AI review/categorization on remaining, new, or uncategorized transactions (e.g. phrases like "auto-categorize", "auto categorize", "AI categorize", "sort transactions using AI", "classify remaining transactions", "run categorization"):
  1. Stage 1: You MUST set 'agent_action.action' to 'categorize_transactions'. Do NOT explain results, suggest rules, or do math in the body field during Stage 1.
  2. Stage 2: Once the database updates are completed and the system returns the count of processed transactions, summarize the categorization results clearly in the body. Cite the exact count of categorized transactions.`,
          enabled: true,
          isBuiltIn: false,
          testCases: [
            {
              prompt: "AI categorize remaining transactions",
              criteria: "Must call the categorize_transactions action in Stage 1."
            },
            {
              prompt: "please auto-categorize all uncategorized items",
              criteria: "Must call categorize_transactions to initiate the AI review."
            }
          ]
        });
        hasChanges = true;
      } else {
        const existingCat = updatedSkills.find(s => s.id === 'builtin:categorization');
        if (existingCat && existingCat.systemPromptExtension.includes('or AI classify remaining or uncategorized transactions:')) {
          existingCat.systemPromptExtension = `- When asked to auto-categorize, sort, organize, classify, or run AI review/categorization on remaining, new, or uncategorized transactions (e.g. phrases like "auto-categorize", "auto categorize", "AI categorize", "sort transactions using AI", "classify remaining transactions", "run categorization"):
  1. Stage 1: You MUST set 'agent_action.action' to 'categorize_transactions'. Do NOT explain results, suggest rules, or do math in the body field during Stage 1.
  2. Stage 2: Once the database updates are completed and the system returns the count of processed transactions, summarize the categorization results clearly in the body. Cite the exact count of categorized transactions.`;
          hasChanges = true;
        }
      }

      if (hasChanges || updatedSkills.length !== currentSkills.length) {
        await db.settings.put({ key: 'app:agentSkills', value: updatedSkills });
      }

      const CURRENT_PROMPT_VERSION = 8;
      const systemPromptVersionDb = await db.settings.get('app:systemPromptVersion');
      const systemPromptDb = await db.settings.get('app:systemPrompt');
      
      let shouldOverwrite = !systemPromptVersionDb || Number(systemPromptVersionDb.value) < CURRENT_PROMPT_VERSION;
      
      if (systemPromptDb && typeof systemPromptDb.value === 'string') {
        if (!systemPromptDb.value.includes('Action Choice Rules:')) {
          shouldOverwrite = true;
        }
      } else {
        shouldOverwrite = true;
      }

      if (shouldOverwrite) {
        await db.settings.put({ key: 'app:systemPrompt', value: GENERAL_SYSTEM_PROMPT });
        await db.settings.put({ key: 'app:systemPromptVersion', value: CURRENT_PROMPT_VERSION });
      }
    };
    seedSkills();
  }, []);

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

  const [sidebarTab, setSidebarTab] = useState(0); 
  const [diagnosticResults, setDiagnosticResults] = useState<Record<number, DiagnosticResult>>({});
  const [isRunningSuite, setIsRunningSuite] = useState(false);
  const [suiteProgress, setSuiteProgress] = useState('');
  const [selectedInspectTest, setSelectedInspectTest] = useState<InspectDiagnosticData | null>(null);

  const [baselineSidebarTab, setBaselineSidebarTab] = useState(0);
  const [baselineDiagnosticResults, setBaselineDiagnosticResults] = useState<Record<number, DiagnosticResult>>({});
  const [isBaselineRunningSuite, setIsBaselineRunningSuite] = useState(false);
  const [baselineSuiteProgress, setBaselineSuiteProgress] = useState('');

  const [testCaseDialogOpen, setTestCaseDialogOpen] = useState(false);
  const [testCaseDialogType, setTestCaseDialogType] = useState<'custom' | 'baseline'>('custom');
  const [testCaseDialogIndex, setTestCaseDialogIndex] = useState<number | null>(null);
  const [testCaseDialogPrompt, setTestCaseDialogPrompt] = useState('');
  const [testCaseDialogCriteria, setTestCaseDialogCriteria] = useState('');

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
    setTestCaseDialogOpen(false);
    setTestCaseDialogIndex(null);
    setTestCaseDialogPrompt('');
    setTestCaseDialogCriteria('');
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
    setTestCaseDialogOpen(false);
    setTestCaseDialogIndex(null);
    setTestCaseDialogPrompt('');
    setTestCaseDialogCriteria('');
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

  const handleSaveTestCaseDialog = async (promptVal: string, criteriaVal: string) => {
    if (!promptVal.trim() || !criteriaVal.trim()) return;
 
    const newTestCase: SkillTestCase = {
      prompt: promptVal.trim(),
      criteria: criteriaVal.trim()
    };
 
    if (testCaseDialogType === 'custom') {
      if (!editorSkill) return;
      const currentCases = editorSkill.testCases || [];
      let updatedCases: SkillTestCase[];
 
      if (testCaseDialogIndex !== null) {
        updatedCases = [...currentCases];
        updatedCases[testCaseDialogIndex] = newTestCase;
      } else {
        updatedCases = [...currentCases, newTestCase];
      }
 
      const updatedSkill = { ...editorSkill, testCases: updatedCases };
      setEditorSkill(updatedSkill);
      await handleSaveSkill(updatedSkill);
      setSnackbarMessage(testCaseDialogIndex !== null ? 'Test case updated successfully!' : 'Test case added successfully!');
    } else {
      const currentCases = [...baselineTestCases];
      if (testCaseDialogIndex !== null) {
        currentCases[testCaseDialogIndex] = newTestCase;
      } else {
        currentCases.push(newTestCase);
      }
 
      await db.settings.put({
        key: 'app:baselineTestCases',
        value: currentCases
      });
      setSnackbarMessage(testCaseDialogIndex !== null ? 'Baseline test case updated!' : 'Baseline test case added!');
    }
 
     setTestCaseDialogOpen(false);
     setTestCaseDialogIndex(null);
     setTestCaseDialogPrompt('');
     setTestCaseDialogCriteria('');
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

  const handleRunIndividualTestCase = async (index: number) => {
    if (!editorSkill || !editorSkill.testCases) return;

    const currentSkillDraft: AgentSkill = {
      ...editorSkill,
      name: skillFormName.trim(),
      description: skillFormDesc.trim(),
      systemPromptExtension: skillFormPrompt,
    };

    setDiagnosticResults(prev => ({
      ...prev,
      [index]: { running: true }
    }));

    try {
      const testCase = editorSkill.testCases[index];
      const result = await runSkillTestCase(currentSkillDraft, testCase);
      
      setDiagnosticResults(prev => ({
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
      setDiagnosticResults(prev => ({
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

  const handleResetSystemPrompt = () => {
    if (confirm("Are you sure you want to reset the baseline system prompt back to defaults?")) {
      setSystemPromptText(GENERAL_SYSTEM_PROMPT);
      db.settings.put({ key: 'app:systemPrompt', value: GENERAL_SYSTEM_PROMPT });
      setSnackbarMessage('System prompt reset to default!');
    }
  };

  const handleSaveSystemPrompt = async () => {
    await db.settings.put({ key: 'app:systemPrompt', value: systemPromptText });
    setSnackbarMessage('Baseline system prompt saved!');
  };

  if (!license?.active) {
    return (
      <LicenseGate
        licenseKey={licenseKey}
        setLicenseKey={setLicenseKey}
        licenseError={licenseError}
        onActivateLicense={handleActivateLicense}
      />
    );
  }

  if (editorSkill !== null) {
    return (
      <>
        <SkillEditor
          editorSkill={editorSkill}
          setEditorSkill={setEditorSkill}
          skillFormName={skillFormName}
          setSkillFormName={setSkillFormName}
          skillFormDesc={skillFormDesc}
          setSkillFormDesc={setSkillFormDesc}
          skillFormPrompt={skillFormPrompt}
          skillFormError={skillFormError}
          handleSaveSkillForm={handleSaveSkillForm}
          sidebarTab={sidebarTab}
          setSidebarTab={setSidebarTab}
          textareaRef={textareaRef}
          insertTextAtCursor={insertTextAtCursor}
          handleInsertVariable={handleInsertVariable}
          copiedVar={copiedVar}
          setCopiedVar={setCopiedVar}
          diagnosticResults={diagnosticResults}
          isRunningSuite={isRunningSuite}
          suiteProgress={suiteProgress}
          handleRunDiagnostics={handleRunDiagnostics}
          handleRunIndividualTestCase={handleRunIndividualTestCase}
          setSelectedInspectTest={setSelectedInspectTest}
          setTestCaseDialogType={setTestCaseDialogType}
          setTestCaseDialogIndex={setTestCaseDialogIndex}
          setTestCaseDialogPrompt={setTestCaseDialogPrompt}
          setTestCaseDialogCriteria={setTestCaseDialogCriteria}
          setTestCaseDialogOpen={setTestCaseDialogOpen}
          handleDeleteTestCase={handleDeleteTestCase}
          handleEditorChange={handleEditorChange}
          handleEditorKeyDown={handleEditorKeyDown}
          showAutocomplete={showAutocomplete}
          filteredTools={filteredTools}
          selectedAutocompleteIndex={selectedAutocompleteIndex}
          setSelectedAutocompleteIndex={setSelectedAutocompleteIndex}
          insertSelectedTool={insertSelectedTool}
        />
        
        <InspectDiagnosticModal
          selectedInspectTest={selectedInspectTest}
          onClose={() => setSelectedInspectTest(null)}
        />

        <TestCaseDialog
          open={testCaseDialogOpen}
          onClose={() => {
            setTestCaseDialogOpen(false);
            setTestCaseDialogIndex(null);
            setTestCaseDialogPrompt('');
            setTestCaseDialogCriteria('');
          }}
          onSave={handleSaveTestCaseDialog}
          initialPrompt={testCaseDialogPrompt}
          initialCriteria={testCaseDialogCriteria}
          type={testCaseDialogType}
          isEdit={testCaseDialogIndex !== null}
        />
        
        <Snackbar
          open={snackbarMessage !== null}
          autoHideDuration={3000}
          onClose={() => setSnackbarMessage(null)}
          message={snackbarMessage || ''}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        />
      </>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Agent Skills
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
            <SkillsDirectory
              skills={skills}
              onAddSkill={handleOpenAddSkill}
              onToggleSkill={handleToggleSkill}
              onEditSkill={handleOpenEditSkill}
              onDeleteSkill={handleDeleteSkill}
            />
          )}

          {activeTab === 1 && (
            <BaselinePromptEditor
              systemPromptText={systemPromptText}
              handleResetSystemPrompt={handleResetSystemPrompt}
              handleSaveSystemPrompt={handleSaveSystemPrompt}
              baselineSidebarTab={baselineSidebarTab}
              setBaselineSidebarTab={setBaselineSidebarTab}
              insertTextAtCursor={insertTextAtCursor}
              baselineDiagnosticResults={baselineDiagnosticResults}
              isBaselineRunningSuite={isBaselineRunningSuite}
              baselineSuiteProgress={baselineSuiteProgress}
              handleRunBaselineDiagnostics={handleRunBaselineDiagnostics}
              handleRunIndividualBaselineTestCase={handleRunIndividualBaselineTestCase}
              setSelectedInspectTest={setSelectedInspectTest}
              setTestCaseDialogType={setTestCaseDialogType}
              setTestCaseDialogIndex={setTestCaseDialogIndex}
              setTestCaseDialogPrompt={setTestCaseDialogPrompt}
              setTestCaseDialogCriteria={setTestCaseDialogCriteria}
              setTestCaseDialogOpen={setTestCaseDialogOpen}
              baselineTestCases={baselineTestCases}
              handleDeleteBaselineTestCase={handleDeleteBaselineTestCase}
              baselineTextareaRef={baselineTextareaRef}
              handleEditorChange={handleEditorChange}
              handleEditorKeyDown={handleEditorKeyDown}
              showAutocomplete={showAutocomplete}
              filteredTools={filteredTools}
              selectedAutocompleteIndex={selectedAutocompleteIndex}
              setSelectedAutocompleteIndex={setSelectedAutocompleteIndex}
              insertSelectedTool={insertSelectedTool}
            />
          )}

          {activeTab === 2 && (
            <RecentLLMOutput chatMessages={chatMessages} modelName={activeModel} />
          )}

        </Stack>
      </Paper>

      <InspectDiagnosticModal
        selectedInspectTest={selectedInspectTest}
        onClose={() => setSelectedInspectTest(null)}
      />

      <TestCaseDialog
        open={testCaseDialogOpen}
        onClose={() => {
          setTestCaseDialogOpen(false);
          setTestCaseDialogIndex(null);
          setTestCaseDialogPrompt('');
          setTestCaseDialogCriteria('');
        }}
        onSave={handleSaveTestCaseDialog}
        initialPrompt={testCaseDialogPrompt}
        initialCriteria={testCaseDialogCriteria}
        type={testCaseDialogType}
        isEdit={testCaseDialogIndex !== null}
      />

      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage || ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Stack>
  );
};
