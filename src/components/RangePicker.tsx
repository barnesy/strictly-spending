import { useEffect, useState } from 'react';
import {
  Stack,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  Popover,
  Box,
  Divider,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import {
  useFilters,
  resolveDateRange,
  type DateRangePreset,
} from '../stores/store';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { parseISO, format, lastDayOfMonth } from 'date-fns';

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'thisMonth', label: 'This Month' },
  { value: 'ytd', label: 'YTD' },
  { value: 'last30', label: '30D' },
  { value: 'last90', label: '90D' },
  { value: 'allTime', label: 'All' },
  { value: 'custom', label: 'Custom' },
];

function formatDateRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const opts: Intl.DateTimeFormatOptions = sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${startStr} – ${endStr}`;
}

function getCompactMobileLabel(
  preset: DateRangePreset,
  customStart: string,
  customEnd: string,
  start: Date,
  end: Date
): string {
  if (preset === 'thisMonth') return 'This Month';
  if (preset === 'lastMonth') return 'Last Month';
  if (preset === 'ytd') return 'YTD';
  if (preset === 'last30') return '30D';
  if (preset === 'last90') return '90D';
  if (preset === 'allTime') return 'All Time';

  // Check if custom range is an exact single calendar month (e.g. 2026-10-01 to 2026-10-31)
  if (customStart && customEnd) {
    try {
      const s = parseISO(customStart);
      const e = parseISO(customEnd);
      if (
        s.getFullYear() === e.getFullYear() &&
        s.getMonth() === e.getMonth() &&
        s.getDate() === 1 &&
        e.getDate() === lastDayOfMonth(s).getDate()
      ) {
        return s.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }
    } catch {
      // ignore parse error
    }
  }

  const sShort = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const eShort = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${sShort} – ${eShort}`;
}

export default function RangePicker() {
  const preset = useFilters((s) => s.preset);
  const customStart = useFilters((s) => s.customStart);
  const customEnd = useFilters((s) => s.customEnd);
  const earliestTransactionDate = useFilters((s) => s.earliestTransactionDate);
  const latestTransactionDate = useFilters((s) => s.latestTransactionDate);
  const shiftRange = useFilters((s) => s.shiftRange);
  const setPreset = useFilters((s) => s.setPreset);
  const setCustomRange = useFilters((s) => s.setCustomRange);

  const [mobileAnchorEl, setMobileAnchorEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (preset === 'custom' && !customEnd) {
      setCustomRange(customStart, format(new Date(), 'yyyy-MM-dd'));
    }
  }, [preset, customEnd, customStart, setCustomRange]);

  const range = resolveDateRange({
    preset,
    customStart,
    customEnd,
    earliestTransactionDate,
    latestTransactionDate,
  } as any);
  const label = formatDateRange(range.start, range.end);
  const mobileLabel = getCompactMobileLabel(preset, customStart, customEnd, range.start, range.end);

  return (
    <>
      {/* Mobile Compact Date Range Dropdown Button */}
      <Box sx={{ display: { xs: 'inline-flex', md: 'none' } }}>
        <ToggleButtonGroup
          size="small"
          sx={{
            height: { xs: 42, sm: 36 },
            '& .MuiToggleButton-root': {
              height: { xs: 42, sm: 36 },
              px: { xs: 1.35, sm: 1.2 },
              gap: 0.5,
              fontSize: { xs: '0.84rem', sm: '0.8125rem' },
              fontWeight: 600,
              textTransform: 'none',
              whiteSpace: 'nowrap',
              '&.Mui-selected': { fontWeight: 700 },
            },
          }}
        >
          <ToggleButton
            value="mobile-date-range"
            selected={preset === 'custom'}
            onClick={(e) => setMobileAnchorEl(e.currentTarget)}
          >
            <CalendarTodayIcon sx={{ fontSize: 15 }} />
            {mobileLabel}
            <ArrowDropDownIcon sx={{ fontSize: 18, ml: -0.25, mr: -0.5, opacity: 0.75 }} />
          </ToggleButton>
        </ToggleButtonGroup>

        <Popover
          open={Boolean(mobileAnchorEl)}
          anchorEl={mobileAnchorEl}
          onClose={() => setMobileAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
          slotProps={{
            paper: {
              sx: {
                mt: 0.75,
                p: 1.5,
                width: 280,
                borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              },
            },
          }}
        >
          <Stack spacing={1.25}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                {label}
              </Typography>
              <Stack direction="row" spacing={0.5}>
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={() => shiftRange(-1)}
                  sx={{ minWidth: 32, px: 0.75, height: 28, borderColor: 'divider' }}
                  title="Shift earlier"
                >
                  <ChevronLeftIcon fontSize="small" />
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={() => shiftRange(1)}
                  sx={{ minWidth: 32, px: 0.75, height: 28, borderColor: 'divider' }}
                  title="Shift later"
                >
                  <ChevronRightIcon fontSize="small" />
                </Button>
              </Stack>
            </Stack>

            <FormControl size="small" fullWidth>
              <Select
                variant="outlined"
                value={preset}
                onChange={(e) => {
                  const v = e.target.value as DateRangePreset;
                  if (v === 'custom') {
                    const todayStr = format(new Date(), 'yyyy-MM-dd');
                    setCustomRange(customStart, customEnd || todayStr);
                  } else {
                    setPreset(v);
                    setMobileAnchorEl(null);
                  }
                }}
                sx={{
                  height: 36,
                  fontSize: '0.84rem',
                  fontWeight: 600,
                }}
              >
                <MenuItem value="thisMonth">This Month</MenuItem>
                <MenuItem value="lastMonth">Last Month</MenuItem>
                <MenuItem value="ytd">Year to Date (YTD)</MenuItem>
                <MenuItem value="last30">Last 30 Days</MenuItem>
                <MenuItem value="last90">Last 90 Days</MenuItem>
                <MenuItem value="allTime">All Time</MenuItem>
                <MenuItem value="custom">Custom Date Range</MenuItem>
              </Select>
            </FormControl>

            {preset === 'custom' && (
              <>
                <Divider />
                <Stack spacing={1}>
                  <DatePicker
                    label="Start Date"
                    value={customStart ? parseISO(customStart) : null}
                    onChange={(newVal) => {
                      const todayStr = format(new Date(), 'yyyy-MM-dd');
                      const effectiveEnd = customEnd || todayStr;
                      if (newVal && !isNaN(newVal.getTime())) {
                        setCustomRange(format(newVal, 'yyyy-MM-dd'), effectiveEnd);
                      } else if (!newVal) {
                        setCustomRange('', effectiveEnd);
                      }
                    }}
                    slotProps={{
                      textField: {
                        size: 'small',
                        fullWidth: true,
                        sx: { '& .MuiInputBase-root': { height: 34, fontSize: '0.8rem' } },
                      },
                    }}
                  />
                  <DatePicker
                    label="End Date"
                    value={customEnd ? parseISO(customEnd) : new Date()}
                    onChange={(newVal) => {
                      if (newVal && !isNaN(newVal.getTime())) {
                        setCustomRange(customStart, format(newVal, 'yyyy-MM-dd'));
                      } else if (!newVal) {
                        setCustomRange(customStart, format(new Date(), 'yyyy-MM-dd'));
                      }
                    }}
                    slotProps={{
                      textField: {
                        size: 'small',
                        fullWidth: true,
                        sx: { '& .MuiInputBase-root': { height: 34, fontSize: '0.8rem' } },
                      },
                    }}
                  />
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button
                      size="small"
                      variant="outlined"
                      color="inherit"
                      onClick={() => {
                        setPreset('ytd');
                        setMobileAnchorEl(null);
                      }}
                      sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                    >
                      Reset to YTD
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => setMobileAnchorEl(null)}
                      sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                    >
                      Done
                    </Button>
                  </Stack>
                </Stack>
              </>
            )}
          </Stack>
        </Popover>
      </Box>

      {/* Desktop Full RangePicker */}
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        justifyContent="flex-end"
        sx={{ display: { xs: 'none', md: 'flex' }, width: 'auto' }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            fontWeight: 500,
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {label}
        </Typography>
        {preset !== 'custom' && (
          <ToggleButtonGroup
            value={preset}
            exclusive
            onChange={(_, v) => {
              if (!v || v === '__prev__' || v === '__next__') return;
              if (v === 'custom') {
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                setCustomRange(customStart, customEnd || todayStr);
              } else {
                setPreset(v);
              }
            }}
            size="small"
            sx={{
              height: 32,
              '& .MuiToggleButton-root': {
                height: 32,
                px: 1.25,
                fontSize: '0.75rem',
                fontWeight: 500,
                '&.Mui-selected': { fontWeight: 600 },
              },
            }}
          >
            <ToggleButton
              value="__prev__"
              onClick={() => shiftRange(-1)}
              aria-label="Shift date range earlier"
              title="Shift earlier"
              sx={{ flex: '0 0 auto !important', px: '8px !important' }}
            >
              <ChevronLeftIcon fontSize="small" />
            </ToggleButton>
            {PRESETS.map((p) => (
              <ToggleButton key={p.value} value={p.value}>
                {p.label}
              </ToggleButton>
            ))}
            <ToggleButton
              value="__next__"
              onClick={() => shiftRange(1)}
              aria-label="Shift date range later"
              title="Shift later"
              sx={{ flex: '0 0 auto !important', px: '8px !important' }}
            >
              <ChevronRightIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
        )}
        {preset === 'custom' && (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <DatePicker
              value={customStart ? parseISO(customStart) : null}
              onChange={(newVal) => {
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const effectiveEnd = customEnd || todayStr;
                if (newVal && !isNaN(newVal.getTime())) {
                  setCustomRange(format(newVal, 'yyyy-MM-dd'), effectiveEnd);
                } else if (!newVal) {
                  setCustomRange('', effectiveEnd);
                }
              }}
              slotProps={{
                textField: {
                  size: 'small',
                  placeholder: 'Start Date',
                  sx: {
                    width: 135,
                    '& .MuiInputBase-root': { height: 32, fontSize: '0.75rem' },
                  },
                },
              }}
            />
            <DatePicker
              value={customEnd ? parseISO(customEnd) : new Date()}
              onChange={(newVal) => {
                if (newVal && !isNaN(newVal.getTime())) {
                  setCustomRange(customStart, format(newVal, 'yyyy-MM-dd'));
                } else if (!newVal) {
                  setCustomRange(customStart, format(new Date(), 'yyyy-MM-dd'));
                }
              }}
              slotProps={{
                textField: {
                  size: 'small',
                  placeholder: 'End Date',
                  sx: {
                    width: 135,
                    '& .MuiInputBase-root': { height: 32, fontSize: '0.75rem' },
                  },
                },
              }}
            />
            <ToggleButtonGroup size="small" sx={{ height: 32 }}>
              <ToggleButton
                value="cancel"
                selected={false}
                onClick={() => setPreset('ytd')}
                sx={{ height: 32, px: 1.25, fontSize: '0.75rem' }}
              >
                Cancel
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        )}
      </Stack>
    </>
  );
}
