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
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CodeIcon from '@mui/icons-material/Code';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { HighlightingEditor } from './HighlightingEditor';
import { AGENT_TOOLS, GEN_UX_COMPONENTS } from './constants';
import type { SkillTestCase } from '../../types';
import type { InspectDiagnosticData, DiagnosticResult } from './InspectDiagnosticModal';

export interface BaselinePromptEditorProps {
  systemPromptText: string;
  baselineSidebarTab: number;
  setBaselineSidebarTab: (val: number) => void;
  baselineTextareaRef: React.RefObject<HTMLTextAreaElement>;
  insertTextAtCursor: (text: string, isBaseline: boolean) => void;
  handleResetSystemPrompt: () => void;
  handleSaveSystemPrompt: () => void;
  isBaselineRunningSuite: boolean;
  baselineSuiteProgress: string;
  handleRunBaselineDiagnostics: () => void;
  baselineTestCases: SkillTestCase[];
  baselineDiagnosticResults: Record<number, DiagnosticResult>;
  handleRunIndividualBaselineTestCase: (index: number) => void;
  setSelectedInspectTest: (val: InspectDiagnosticData | null) => void;
  setTestCaseDialogType: (val: 'baseline' | 'custom') => void;
  setTestCaseDialogIndex: (val: number | null) => void;
  setTestCaseDialogPrompt: (val: string) => void;
  setTestCaseDialogCriteria: (val: string) => void;
  setTestCaseDialogOpen: (val: boolean) => void;
  handleDeleteBaselineTestCase: (index: number) => void;
  handleEditorChange: (e: React.ChangeEvent<HTMLTextAreaElement>, isBaseline: boolean) => void;
  handleEditorKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  showAutocomplete: boolean;
  filteredTools: any[];
  selectedAutocompleteIndex: number;
  setSelectedAutocompleteIndex: (val: number) => void;
  insertSelectedTool: (tool: any) => void;
}

export const BaselinePromptEditor: React.FC<BaselinePromptEditorProps> = ({
  systemPromptText,
  baselineSidebarTab,
  setBaselineSidebarTab,
  baselineTextareaRef,
  insertTextAtCursor,
  handleResetSystemPrompt,
  handleSaveSystemPrompt,
  isBaselineRunningSuite,
  baselineSuiteProgress,
  handleRunBaselineDiagnostics,
  baselineTestCases,
  baselineDiagnosticResults,
  handleRunIndividualBaselineTestCase,
  setSelectedInspectTest,
  setTestCaseDialogType,
  setTestCaseDialogIndex,
  setTestCaseDialogPrompt,
  setTestCaseDialogCriteria,
  setTestCaseDialogOpen,
  handleDeleteBaselineTestCase,
  handleEditorChange,
  handleEditorKeyDown,
  showAutocomplete,
  filteredTools,
  selectedAutocompleteIndex,
  setSelectedAutocompleteIndex,
  insertSelectedTool,
}) => {
  return (
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

              <Button
                variant="outlined"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => {
                  setTestCaseDialogType('baseline');
                  setTestCaseDialogIndex(null);
                  setTestCaseDialogPrompt('');
                  setTestCaseDialogCriteria('');
                  setTestCaseDialogOpen(true);
                }}
                sx={{ mb: 2, textTransform: 'none', fontWeight: 600 }}
                fullWidth
              >
                Add Baseline Test Case
              </Button>

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
                                setTestCaseDialogType('baseline');
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
            <HighlightingEditor
              ref={baselineTextareaRef}
              placeholder="# Enter system prompt instructions here..."
              value={systemPromptText}
              onChange={(e) => handleEditorChange(e, true)}
              onKeyDown={handleEditorKeyDown}
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
  );
};
