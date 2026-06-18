import { Box, Typography, Stack, CircularProgress, Chip, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { AccessibilityReport } from '../../accessibilityAuditor';

interface Props {
  accessibilityReport?: AccessibilityReport;
}

export function QueryResultAuditAccessibility({ accessibilityReport }: Props) {
  if (!accessibilityReport) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Score Circle & Overview */}
      <Stack direction="row" spacing={2.5} alignItems="center" sx={{ pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
          <CircularProgress
            variant="determinate"
            value={accessibilityReport.score}
            size={64}
            thickness={5}
            color={
              accessibilityReport.score >= 90
                ? 'success'
                : accessibilityReport.score >= 70
                ? 'warning'
                : 'error'
            }
          />
          <Box
            sx={{
              top: 0,
              left: 0,
              bottom: 0,
              right: 0,
              position: 'absolute',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography variant="body2" component="div" sx={{ fontWeight: 800, color: 'text.primary', fontSize: 13 }}>
              {accessibilityReport.score}
            </Typography>
          </Box>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
            DOM Accessibility Score
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            URL: <code>{accessibilityReport.path}</code>
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={`${(accessibilityReport.issues || []).filter(i => i.severity === 'error').length} Errors`}
              size="small"
              color="error"
              variant="outlined"
              sx={{ height: 18, fontSize: 9.5, fontWeight: 600 }}
            />
            <Chip
              label={`${(accessibilityReport.issues || []).filter(i => i.severity === 'warning').length} Warnings`}
              size="small"
              color="warning"
              variant="outlined"
              sx={{ height: 18, fontSize: 9.5, fontWeight: 600 }}
            />
          </Stack>
        </Box>
      </Stack>

      {/* Critical Issues & Remediations */}
      {(accessibilityReport.issues?.length || 0) > 0 ? (
        <Box>
          <Typography variant="caption" sx={{ color: (theme) => theme.palette.mode === 'dark' ? 'error.light' : 'error.dark', fontWeight: 700, display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Identified Violations & Fixes ({accessibilityReport.issues?.length || 0})
          </Typography>
          <Stack spacing={1} sx={{ maxHeight: 220, overflowY: 'auto', pr: 0.5 }}>
            {accessibilityReport.issues.map((iss, idx) => (
              <Box
                key={idx}
                sx={{
                  p: 1.2,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: (theme) => theme.palette.mode === 'dark' ? (iss.severity === 'error' ? 'rgba(239, 83, 80, 0.3)' : 'rgba(237, 108, 2, 0.3)') : (iss.severity === 'error' ? 'error.100' : 'warning.100'),
                  bgcolor: iss.severity === 'error' ? 'rgba(239, 83, 80, 0.015)' : 'rgba(237, 108, 2, 0.015)',
                }}
              >
                <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 0.5 }}>
                  {iss.severity === 'error' ? (
                    <ErrorIcon color="error" sx={{ fontSize: 16, mt: 0.25 }} />
                  ) : (
                    <WarningIcon color="warning" sx={{ fontSize: 16, mt: 0.25 }} />
                  )}
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', display: 'block' }}>
                      {iss.issue}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontFamily: 'monospace' }}>
                      Element: {iss.element}
                    </Typography>
                    <Typography variant="caption" color="text.primary" sx={{ display: 'block', fontStyle: 'italic', bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'grey.50', p: 0.5, borderRadius: 1, fontSize: 9.5 }}>
                      Fix: {iss.suggestion}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>
      ) : (
        <Box
          sx={{
            p: 2.5,
            borderRadius: 1,
            border: '1px solid',
            borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.3)' : 'success.100',
            bgcolor: 'rgba(46, 125, 50, 0.02)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <CheckCircleIcon color="success" sx={{ fontSize: 32 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: (theme) => theme.palette.mode === 'dark' ? 'success.light' : 'success.dark' }}>
            Perfect Accessibility!
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
            No landmarks skipped, heading hierarchy checks passed, and all analyzed interactive buttons, inputs, and links have correct accessible names.
          </Typography>
        </Box>
      )}

      {/* Structural Details Accordions */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Accordion variant="outlined" sx={{ borderRadius: 1, border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 18 }} />} sx={{ py: 0, minHeight: 32, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              Heading Structure ({accessibilityReport.headings?.length || 0})
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 1.5, pt: 0, borderTop: '1px solid', borderColor: 'divider' }}>
            {(accessibilityReport.headings?.length || 0) === 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No heading tags found on page.
              </Typography>
            ) : (
              <Stack spacing={0.5} sx={{ maxHeight: 120, overflowY: 'auto' }}>
                {accessibilityReport.headings.map((h, idx) => (
                  <Stack key={idx} direction="row" spacing={1} alignItems="center">
                    <Chip
                      label={`H${h.level}`}
                      size="small"
                      color={h.valid ? 'primary' : 'warning'}
                      sx={{ height: 16, fontSize: 8.5, fontWeight: 700, px: 0.25 }}
                    />
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', textDecoration: h.valid ? 'none' : 'line-through' }}>
                      {h.text || '<empty>'}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </AccordionDetails>
        </Accordion>

        <Accordion variant="outlined" sx={{ borderRadius: 1, border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 18 }} />} sx={{ py: 0, minHeight: 32, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              Accessibility Landmarks ({accessibilityReport.landmarks?.length || 0})
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 1.5, pt: 0, borderTop: '1px solid', borderColor: 'divider' }}>
            {(accessibilityReport.landmarks?.length || 0) === 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No landmark structures parsed on page.
              </Typography>
            ) : (
              <Stack spacing={0.5} sx={{ maxHeight: 120, overflowY: 'auto' }}>
                {accessibilityReport.landmarks.map((l, idx) => (
                  <Typography key={idx} variant="caption" sx={{ display: 'block', fontSize: 10.5 }}>
                    <strong>{l.tagName}</strong> (role: <code>{l.role}</code>) {l.label ? `[Label: "${l.label}"]` : ''}
                  </Typography>
                ))}
              </Stack>
            )}
          </AccordionDetails>
        </Accordion>

        <Accordion variant="outlined" sx={{ borderRadius: 1, border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 18 }} />} sx={{ py: 0, minHeight: 32, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              Interactive Controls Check ({(accessibilityReport.interactiveElements || []).filter(e => e.accessible).length} parsed)
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 1.5, pt: 0, borderTop: '1px solid', borderColor: 'divider' }}>
            <Stack spacing={0.5} sx={{ maxHeight: 140, overflowY: 'auto' }}>
              {accessibilityReport.interactiveElements.map((el, idx) => (
                <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ fontSize: 10 }}>
                    &lt;{el.tagName}&gt; <code>{el.text}</code> {el.label ? `[Label: ${el.label}]` : ''}
                  </Typography>
                  <Chip
                    label={el.accessible ? 'Valid' : 'Invalid'}
                    size="small"
                    color={el.accessible ? 'success' : 'error'}
                    variant="outlined"
                    sx={{ height: 14, fontSize: 8, px: 0 }}
                  />
                </Box>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      </Box>
    </Box>
  );
}
