import { useLiveQuery } from 'dexie-react-hooks';
import {
  Stack,
  Typography,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Box,
  Chip,
} from '@mui/material';
import { db } from '../db';

export default function Categories() {
  const categories = useLiveQuery(
    () => db.categories.orderBy('sortOrder').toArray(),
    []
  );
  const txns = useLiveQuery(() => db.transactions.toArray(), []);

  const counts = (txns || []).reduce<Record<string, number>>((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + 1;
    return acc;
  }, {});

  return (
    <Stack spacing={3}>
      <Typography variant="h5">Categories</Typography>
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">Transactions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {categories?.map((c) => (
              <TableRow key={c.id} hover>
                <TableCell>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box
                      sx={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        bgcolor: c.color,
                      }}
                    />
                    <Typography>{c.name}</Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Chip size="small" label={c.type} />
                </TableCell>
                <TableCell align="right">{counts[c.name] || 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
