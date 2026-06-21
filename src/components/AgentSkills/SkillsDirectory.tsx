import React from 'react';
import {
  Box,
  Typography,
  Button,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Switch,
  Chip,
  IconButton,
  Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DataTable from '../DataTable';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RestoreIcon from '@mui/icons-material/Restore';
import type { AgentSkill } from '../../types';

export interface SkillsDirectoryProps {
  skills: AgentSkill[];
  onAddSkill: () => void;
  onToggleSkill: (id: string) => void;
  onEditSkill: (skill: AgentSkill) => void;
  onDeleteSkill: (id: string) => void;
  onResetSkill?: (skill: AgentSkill) => void;
}

export const SkillsDirectory: React.FC<SkillsDirectoryProps> = ({
  skills,
  onAddSkill,
  onToggleSkill,
  onEditSkill,
  onDeleteSkill,
  onResetSkill,
}) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 2 }}>
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onAddSkill}
          sx={{ textTransform: 'none' }}
        >
          Add custom skill
        </Button>
      </Box>

      {skills.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 2, textAlign: 'center' }}>
          No skills found. Seeding defaults...
        </Typography>
      ) : (
        <DataTable>
            <TableHead sx={{ bgcolor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, width: 80 }}>Active</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 300 }}>Name</TableCell>
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
                      onChange={() => onToggleSkill(skill.id!)}
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
                      onClick={() => onEditSkill(skill)}
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
                      {skill.isBuiltIn && skill.isModified && onResetSkill && (
                        <IconButton
                          size="small"
                          onClick={() => onResetSkill(skill)}
                          color="warning"
                          title="Reset to Default"
                        >
                          <RestoreIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      )}
                      <IconButton
                        size="small"
                        onClick={() => onEditSkill(skill)}
                        color="primary"
                        title="Edit Skill"
                      >
                        <EditIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                      {!skill.isBuiltIn && (
                        <IconButton
                          size="small"
                          onClick={() => onDeleteSkill(skill.id!)}
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
          </DataTable>
      )}
    </Box>
  );
};
