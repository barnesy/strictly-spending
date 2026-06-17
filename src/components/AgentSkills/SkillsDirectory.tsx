import React from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Switch,
  Chip,
  IconButton,
  Stack,
  Paper,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import type { AgentSkill } from '../../types';

export interface SkillsDirectoryProps {
  skills: AgentSkill[];
  onAddSkill: () => void;
  onToggleSkill: (id: string) => void;
  onEditSkill: (skill: AgentSkill) => void;
  onDeleteSkill: (id: string) => void;
}

export const SkillsDirectory: React.FC<SkillsDirectoryProps> = ({
  skills,
  onAddSkill,
  onToggleSkill,
  onEditSkill,
  onDeleteSkill,
}) => {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Toggle active capabilities to dynamically append instructions to the LLM system prompt.
        </Typography>
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onAddSkill}
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
                      <IconButton
                        size="small"
                        onClick={() => onEditSkill(skill)}
                        color="primary"
                        title={skill.isBuiltIn ? "View Skill" : "Edit Skill"}
                      >
                        {skill.isBuiltIn ? <VisibilityIcon sx={{ fontSize: 18 }} /> : <EditIcon sx={{ fontSize: 18 }} />}
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
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};
