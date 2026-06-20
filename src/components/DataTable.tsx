import React from 'react';
import { TableContainer, Table, type TableProps, Box } from '@mui/material';

export interface DataTableProps extends TableProps {
  children: React.ReactNode;
  containerSx?: React.CSSProperties | any;
  component?: React.ElementType;
}

export default function DataTable({ children, containerSx, component = Box, ...tableProps }: DataTableProps) {
  return (
    <TableContainer 
      component={component}
      sx={{ 
        flexGrow: 1, 
        minHeight: 0,
        overflow: 'auto', 
        borderRadius: (theme) => `${theme.shape.borderRadius}px`,
        border: '1px solid',
        borderColor: 'divider',
        ...containerSx 
      }}
    >
      <Table {...tableProps}>
        {children}
      </Table>
    </TableContainer>
  );
}
