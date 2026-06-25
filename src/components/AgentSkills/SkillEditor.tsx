import React from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Paper,
  Tabs,
  Tab,
  CircularProgress,
  Chip,
  IconButton,
  TextField,
  Alert,
  Snackbar,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CodeIcon from '@mui/icons-material/Code';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { HighlightingEditor } from './HighlightingEditor';
import { AGENT_TOOLS, GEN_UX_COMPONENTS } from '../../ai/architecture';
import type { AgentSkill, AgentSkillStage } from '../../types';
import type { InspectDiagnosticData, DiagnosticResult } from './InspectDiagnosticModal';

export interface SkillEditorProps {
  editorSkill: AgentSkill;
  setEditorSkill: (skill: AgentSkill | null) => void;
  skillFormName: string;
  setSkillFormName: (val: string) => void;
  skillFormDesc: string;
  setSkillFormDesc: (val: string) => void;
  skillFormPrompt: string;
  setSkillFormPrompt: (val: string) => void;
  skillFormStages: AgentSkillStage[];
  setSkillFormStages: (val: AgentSkillStage[]) => void;
  skillFormError: string | null;
  handleSaveSkillForm: () => void;
  sidebarTab: number;
  setSidebarTab: (val: number) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  insertTextAtCursor: (text: string, isBaseline: boolean) => void;
  handleInsertVariable: (code: string) => void;
  copiedVar: string | null;
  setCopiedVar: (val: string | null) => void;
  diagnosticResults: Record<number, DiagnosticResult>;
  isRunningSuite: boolean;
  suiteProgress: string;
  handleRunDiagnostics: () => void;
  handleRunIndividualTestCase: (index: number) => void;
  setSelectedInspectTest: (val: InspectDiagnosticData | null) => void;
  setTestCaseDialogType: (val: 'baseline' | 'custom') => void;
  setTestCaseDialogIndex: (val: number | null) => void;
  setTestCaseDialogPrompt: (val: string) => void;
  setTestCaseDialogCriteria: (val: string) => void;
  setTestCaseDialogOpen: (val: boolean) => void;
  handleDeleteTestCase: (index: number) => void;
  handleEditorChange: (e: React.ChangeEvent<HTMLTextAreaElement>, isBaseline: boolean) => void;
  handleEditorKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  showAutocomplete: boolean;
  filteredTools: any[];
  selectedAutocompleteIndex: number;
  setSelectedAutocompleteIndex: (val: number) => void;
  insertSelectedTool: (tool: any) => void;
}

export const SkillEditor: React.FC<SkillEditorProps> = ({
  editorSkill,
  setEditorSkill,
  skillFormName,
  setSkillFormName,
  skillFormDesc,
  setSkillFormDesc,
  // @ts-ignore
  skillFormPrompt,
  // @ts-ignore
  setSkillFormPrompt,
  skillFormStages,
  setSkillFormStages,
  skillFormError,
  handleSaveSkillForm,
  sidebarTab,
  setSidebarTab,
  textareaRef,
  insertTextAtCursor,
  handleInsertVariable,
  copiedVar,
  setCopiedVar,
  diagnosticResults,
  isRunningSuite,
  suiteProgress,
  handleRunDiagnostics,
  handleRunIndividualTestCase,
  setSelectedInspectTest,
  setTestCaseDialogType,
  setTestCaseDialogIndex,
  setTestCaseDialogPrompt,
  setTestCaseDialogCriteria,
  setTestCaseDialogOpen,
  handleDeleteTestCase,
  handleEditorChange,
  handleEditorKeyDown,
  showAutocomplete,
  filteredTools,
  selectedAutocompleteIndex,
  setSelectedAutocompleteIndex,
  insertSelectedTool,
}) => {
  const isBuiltIn = editorSkill.isBuiltIn;
  const isReadOnly = false;
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
          {!isReadOnly && (
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
          borderRadius: (theme) => `${theme.shape.borderRadius}px`,
          overflow: 'hidden',
          boxShadow: 'none',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        {/* Left Panel: Sidebar (Metadata, Reference Guide, & Diagnostics) */}
        <Box
          sx={{
            width: 320,
            flexShrink: 0,
            borderRight: '1px solid',
            borderRightColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'background.paper',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          {/* Sidebar Tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
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
              <Box sx={{ p: 2.5, borderBottom: '1px solid', borderBottomColor: 'divider' }}>
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
                    disabled={isReadOnly}
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
                    disabled={isReadOnly}
                    placeholder="e.g., Directs the model on how to detect and label subscription fee spikes..."
                    slotProps={{
                      inputLabel: { shrink: true }
                    }}
                  />
                </Stack>
              </Box>

              {/* Multi-Step Stages */}
              <Box sx={{ p: 2.5, borderBottom: '1px solid', borderBottomColor: 'divider' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      fontSize: 10,
                    }}
                  >
                    Multi-Step Stages
                  </Typography>
                  {!isReadOnly && (
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => setSkillFormStages([...skillFormStages, { title: '', requiredAction: '' }])}
                      sx={{ textTransform: 'none', fontSize: 11 }}
                    >
                      Add Stage
                    </Button>
                  )}
                </Stack>
                {skillFormStages.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: 11.5, fontStyle: 'italic' }}>
                    No explicit stages defined. The agent will determine steps automatically based on the prompt.
                  </Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {skillFormStages.map((stage, idx) => (
                      <Paper key={idx} variant="outlined" sx={{ p: 1.5, borderColor: 'divider' }}>
                        <Stack direction="row" spacing={1} alignItems="flex-start">
                          <Typography variant="caption" sx={{ fontWeight: 700, mt: 1 }}>
                            {idx + 1}.
                          </Typography>
                          <Stack spacing={1} flex={1}>
                            <TextField
                              label="Stage Title"
                              value={stage.title}
                              onChange={(e) => {
                                const newStages = [...skillFormStages];
                                newStages[idx].title = e.target.value;
                                setSkillFormStages(newStages);
                              }}
                              size="small"
                              fullWidth
                              disabled={isReadOnly}
                              placeholder="e.g. Query Database"
                              InputProps={{ sx: { fontSize: 12 } }}
                              InputLabelProps={{ sx: { fontSize: 12 } }}
                            />
                            <FormControl size="small" fullWidth disabled={isReadOnly}>
                              <InputLabel sx={{ fontSize: 12 }}>Required Tool</InputLabel>
                              <Select
                                value={stage.requiredAction}
                                label="Required Tool"
                                onChange={(e) => {
                                  const newStages = [...skillFormStages];
                                  newStages[idx].requiredAction = e.target.value;
                                  setSkillFormStages(newStages);
                                }}
                                sx={{ fontSize: 12 }}
                              >
                                {AGENT_TOOLS.map(t => (
                                  <MenuItem key={t.name} value={t.name} sx={{ fontSize: 12 }}>{t.name}</MenuItem>
                                ))}
                                {GEN_UX_COMPONENTS.map(t => (
                                  <MenuItem key={t.name} value={t.name} sx={{ fontSize: 12 }}>{t.name}</MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </Stack>
                          {!isReadOnly && (
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => {
                                const newStages = [...skillFormStages];
                                newStages.splice(idx, 1);
                                setSkillFormStages(newStages);
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                )}
              </Box>

              {/* Guide & Interactive Variables */}
              <Box sx={{ p: 2.5, borderBottom: '1px solid', borderBottomColor: 'divider' }}>
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
                  {isReadOnly
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
                        cursor: isReadOnly ? 'default' : 'pointer',
                        borderColor: 'divider',
                        bgcolor: isReadOnly ? 'action.hover' : 'background.default',
                        transition: 'all 0.2s',
                        opacity: isReadOnly ? 0.85 : 1,
                        '&:hover': isReadOnly ? {} : {
                          borderColor: 'primary.main',
                          bgcolor: 'action.hover',
                        }
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', fontSize: 11 }}>
                          {item.label}
                        </Typography>

                      </Stack>
                      <Typography
                        variant="caption"
                        component="code"
                        sx={{
                          fontFamily: 'monospace',
                          bgcolor: 'action.selected',
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
                  {isReadOnly
                    ? 'The agent is equipped with these schema actions to manage filters, query data, or manipulate artifacts:'
                    : 'Click a tool to insert its system prompt template into the editor:'}
                </Typography>

                <Stack spacing={1.5}>
                  {AGENT_TOOLS.map((tool) => (
                    <Paper
                      key={tool.name}
                      variant="outlined"
                      onClick={() => {
                        if (isReadOnly) return;
                        insertTextAtCursor(tool.insertTemplate, false);
                      }}
                      sx={{
                        p: 1.5,
                        cursor: isReadOnly ? 'default' : 'pointer',
                        borderColor: 'divider',
                        bgcolor: isReadOnly ? 'action.hover' : 'background.default',
                        transition: 'all 0.2s',
                        opacity: isReadOnly ? 0.85 : 1,
                        '&:hover': isReadOnly ? {} : {
                          borderColor: 'primary.main',
                          bgcolor: 'action.hover',
                        }
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', fontSize: 11 }}>
                          {tool.label}
                        </Typography>

                      </Stack>
                      <Typography
                        variant="caption"
                        component="code"
                        sx={{
                          fontFamily: 'monospace',
                          bgcolor: 'action.selected',
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
              <Box sx={{ p: 2.5, borderTop: '1px solid', borderTopColor: 'divider' }}>
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
                  {isReadOnly
                    ? 'The agent can invoke these interactive user interface components within the chat stream:'
                    : 'Click a component to insert its system prompt template into the editor:'}
                </Typography>

                <Stack spacing={1.5}>
                  {GEN_UX_COMPONENTS.map((comp) => (
                    <Paper
                      key={comp.name}
                      variant="outlined"
                      onClick={() => {
                        if (isReadOnly) return;
                        insertTextAtCursor(comp.insertTemplate, false);
                      }}
                      sx={{
                        p: 1.5,
                        cursor: isReadOnly ? 'default' : 'pointer',
                        borderColor: 'divider',
                        bgcolor: isReadOnly ? 'action.hover' : 'background.default',
                        transition: 'all 0.2s',
                        opacity: isReadOnly ? 0.85 : 1,
                        '&:hover': isReadOnly ? {} : {
                          borderColor: 'primary.main',
                          bgcolor: 'action.hover',
                        }
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', fontSize: 11 }}>
                          {comp.label}
                        </Typography>

                      </Stack>
                      <Typography
                        variant="caption"
                        component="code"
                        sx={{
                          fontFamily: 'monospace',
                          bgcolor: 'action.selected',
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
                      {isRunningSuite ? 'Running suite...' : 'Run diagnostics'}
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

              <Box sx={{ borderBottom: '1px solid', borderBottomColor: 'divider', my: 1.5 }} />

              {!isReadOnly && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setTestCaseDialogType('custom');
                    setTestCaseDialogIndex(null);
                    setTestCaseDialogPrompt('');
                    setTestCaseDialogCriteria('');
                    setTestCaseDialogOpen(true);
                  }}
                  sx={{ mb: 2, textTransform: 'none', fontWeight: 600 }}
                  fullWidth
                >
                  Add test case
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
                Test cases ({editorSkill.testCases?.length || 0})
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
                            : 'divider',
                          bgcolor: res?.running
                            ? 'rgba(25, 118, 210, 0.02)'
                            : res?.success === true
                            ? 'rgba(76, 175, 80, 0.01)'
                            : res?.success === false
                            ? 'rgba(244, 67, 54, 0.01)'
                            : 'background.paper',
                          boxShadow: 'none',
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
                                onClick={() => handleRunIndividualTestCase(index)}
                                disabled={res?.running || isRunningSuite}
                                variant="outlined"
                                sx={{
                                  textTransform: 'none',
                                  fontSize: 9,
                                  height: 18,
                                  py: 0,
                                  px: 1,
                                  minWidth: 0,
                                  borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                                }}
                              >
                                {res?.running ? 'Running...' : 'Run test'}
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
                            <Box sx={{ mt: 0.5, p: 1, bgcolor: 'action.hover', borderRadius: (theme) => `${theme.shape.borderRadius}px` }}>
                              <Typography variant="caption" color="text.primary" sx={{ fontSize: 10.5, display: 'block', fontStyle: 'italic', wordBreak: 'break-word' }}>
                                <strong>AI Reason:</strong> {res.reasoning}
                              </Typography>
                              <Button
                                size="small"
                                onClick={() => setSelectedInspectTest({ index, prompt: tc.prompt, criteria: tc.criteria, result: res })}
                                sx={{ textTransform: 'none', fontSize: 10, mt: 0.5, p: 0, minWidth: 0, display: 'inline-block' }}
                              >
                                Inspect output
                              </Button>
                            </Box>
                          )}

                          {!isReadOnly && !isRunningSuite && (
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end" sx={{ mt: 0.5 }}>
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setTestCaseDialogType('custom');
                                  setTestCaseDialogIndex(index);
                                  setTestCaseDialogPrompt(tc.prompt);
                                  setTestCaseDialogCriteria(tc.criteria);
                                  setTestCaseDialogOpen(true);
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
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: 'background.default', minWidth: 0 }}>
          {/* Editor Tab bar */}
          <Box
            sx={{
              height: 40,
              bgcolor: 'action.hover',
              borderBottom: '1px solid',
              borderBottomColor: 'divider',
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
                  bgcolor: 'background.paper',
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
              icon={<LockOpenIcon sx={{ fontSize: '13px !important', color: isBuiltIn ? '#2196f3 !important' : '#4caf50 !important' }} />}
              label={isBuiltIn ? 'CORE BUILT-IN PROMPT' : 'EDITABLE PROMPT'}
              size="small"
              variant="outlined"
              sx={{
                height: 22,
                fontSize: 9.5,
                fontWeight: 600,
                color: isBuiltIn ? '#2196f3' : '#4caf50',
                borderColor: isBuiltIn ? 'rgba(33, 150, 243, 0.3)' : 'rgba(76, 175, 80, 0.3)',
                bgcolor: isBuiltIn ? 'rgba(33, 150, 243, 0.04)' : 'rgba(76, 175, 80, 0.04)',
              }}
            />
          </Box>

          {/* IDE Editor Canvas */}
          <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <HighlightingEditor
              ref={textareaRef}
              placeholder={
                isReadOnly 
                  ? "# Core instruction is blank" 
                  : "# Enter prompt instructions here...\n- Direct the model to prioritize certain spend insights\n- Teach the model to identify specific anomalies"
              }
              value={skillFormPrompt}
              onChange={(e) => handleEditorChange(e, false)}
              onKeyDown={handleEditorKeyDown}
              disabled={isReadOnly}
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
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
                  bgcolor: 'background.paper',
                }}
              >
                <Box sx={{ p: 1.25, borderBottom: '1px solid', borderBottomColor: 'divider', bgcolor: 'action.hover' }}>
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
                          borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                          cursor: 'pointer',
                          bgcolor: isSelected ? 'action.selected' : 'transparent',
                          color: isSelected ? 'primary.main' : 'text.primary',
                          transition: 'all 0.15s',
                          '&:hover': {
                            bgcolor: 'action.selected',
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
                              bgcolor: isSelected ? 'rgba(25, 118, 210, 0.12)' : 'action.hover',
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
              bgcolor: 'action.hover',
              borderTop: '1px solid',
              borderTopColor: 'divider',
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
    </Stack>
  );
};
