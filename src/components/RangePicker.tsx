import {
  Stack,
  Typography,
  Tooltip,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
  Button,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  useFilters,
  resolveDateRange,
  type DateRangePreset,
} from '../store';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { parseISO, format } from 'date-fns';

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'ytd', label: 'YTD' },
  { value: 'last30', label: 'Last 30D' },
  { value: 'last90', label: 'Last 90D' },
  { value: 'allTime', label: 'All Time' },
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

export default function RangePicker() {
  const preset = useFilters((s) => s.preset);
  const customStart = useFilters((s) => s.customStart);
  const customEnd = useFilters((s) => s.customEnd);
  const earliestTransactionDate = useFilters((s) => s.earliestTransactionDate);
  const latestTransactionDate = useFilters((s) => s.latestTransactionDate);
  const shiftRange = useFilters((s) => s.shiftRange);
  const setPreset = useFilters((s) => s.setPreset);
  const setCustomRange = useFilters((s) => s.setCustomRange);

  const range = resolveDateRange({
    preset,
    customStart,
    customEnd,
    earliestTransactionDate,
    latestTransactionDate,
  } as any);
  const label = formatDateRange(range.start, range.end);
  return (
    <Stack direction="row" spacing={2} alignItems="flex-end" flexWrap="wrap" justifyContent="flex-end">
      <Typography variant="caption" color="text.secondary" sx={{ height: 40, display: 'flex', alignItems: 'center', fontWeight: 500 }}>
        {label}
      </Typography>
      {preset !== 'custom' && (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title="Shift earlier">
            <IconButton
              size="small"
              onClick={() => shiftRange(-1)}
              aria-label="Shift date range earlier"
              sx={{ height: 40, width: 40 }}
            >
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <ToggleButtonGroup
            value={preset}
            exclusive
            onChange={(_, v) => v && setPreset(v)}
            size="small"
            sx={{
              height: 40,
              '& .MuiToggleButton-root': {
                height: 40,
              }
            }}
          >
            {PRESETS.map((p) => (
              <ToggleButton key={p.value} value={p.value}>
                {p.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Tooltip title="Shift later">
            <IconButton
              size="small"
              onClick={() => shiftRange(1)}
              aria-label="Shift date range later"
              sx={{ height: 40, width: 40 }}
            >
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
      {preset === 'custom' && (
        <Stack direction="row" spacing={2.5} alignItems="flex-end">
          <DatePicker
            value={customStart ? parseISO(customStart) : null}
            onChange={(newVal) => {
              if (newVal && !isNaN(newVal.getTime())) {
                setCustomRange(format(newVal, 'yyyy-MM-dd'), customEnd);
              } else if (!newVal) {
                setCustomRange('', customEnd);
              }
            }}
            slotProps={{
              textField: {
                size: 'small',
                placeholder: 'Start Date',
                sx: {
                  width: 150,
                  '& .MuiInputBase-root': { height: 40 },
                },
              },
            }}
          />
          <DatePicker
            value={customEnd ? parseISO(customEnd) : null}
            onChange={(newVal) => {
              if (newVal && !isNaN(newVal.getTime())) {
                setCustomRange(customStart, format(newVal, 'yyyy-MM-dd'));
              } else if (!newVal) {
                setCustomRange(customStart, '');
              }
            }}
            slotProps={{
              textField: {
                size: 'small',
                placeholder: 'End Date',
                sx: {
                  width: 150,
                  '& .MuiInputBase-root': { height: 40 },
                },
              },
            }}
          />
          <Button
            size="small"
            color="inherit"
            variant="outlined"
            onClick={() => setPreset('ytd')}
            sx={{ textTransform: 'none', height: 40 }}
          >
            Cancel
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
