import { useState } from "react";
import {
  IconButton,
  Menu,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Typography,
  Divider,
  Button,
  Box,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import { ViewColumn, ArrowUpward, ArrowDownward } from "@mui/icons-material";

interface Column {
  field: string;
  headerName: string;
}

interface ColumnSelectorProps {
  columns: Column[];
  visibleColumns: string[];
  columnOrder?: string[];
  onColumnVisibilityChange: (columnField: string, visible: boolean) => void;
  onColumnOrderChange?: (newOrder: string[]) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export default function ColumnSelector({
  columns,
  visibleColumns,
  columnOrder = [],
  onColumnVisibilityChange,
  onColumnOrderChange,
  onSelectAll,
  onDeselectAll,
}: ColumnSelectorProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [tabValue, setTabValue] = useState(0);
  const open = Boolean(anchorEl);

  // Get ordered columns based on columnOrder prop or default order
  const orderedColumns =
    columnOrder.length > 0
      ? columnOrder
          .map((field) => columns.find((col) => col.field === field))
          .filter(Boolean)
      : columns;

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0 || !onColumnOrderChange) return;
    const newOrder = [...(orderedColumns as Column[]).map((col) => col.field)];
    [newOrder[index - 1], newOrder[index]] = [
      newOrder[index],
      newOrder[index - 1],
    ];
    onColumnOrderChange(newOrder);
  };

  const handleMoveDown = (index: number) => {
    if (index === orderedColumns.length - 1 || !onColumnOrderChange) return;
    const newOrder = [...(orderedColumns as Column[]).map((col) => col.field)];
    [newOrder[index], newOrder[index + 1]] = [
      newOrder[index + 1],
      newOrder[index],
    ];
    onColumnOrderChange(newOrder);
  };

  return (
    <>
      <IconButton
        onClick={handleClick}
        color="primary"
        title="Valitse sarakkeet"
      >
        <ViewColumn />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          style: {
            maxHeight: 500,
            width: "320px",
          },
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            Sarakkeiden hallinta
          </Typography>
          <Tabs
            value={tabValue}
            onChange={(_, newValue) => setTabValue(newValue)}
            variant="fullWidth"
          >
            <Tab label="Näkyvyys" />
            <Tab label="Järjestys" disabled={!onColumnOrderChange} />
          </Tabs>
        </Box>
        <Divider />

        {/* Visibility Tab */}
        {tabValue === 0 && [
          <Box key="controls" sx={{ px: 2, py: 1 }}>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button size="small" onClick={onSelectAll}>
                Valitse kaikki
              </Button>
              <Button size="small" onClick={onDeselectAll}>
                Tyhjennä
              </Button>
            </Box>
          </Box>,
          ...columns.map((column) => (
            <MenuItem
              key={column.field}
              dense
              onClick={(e) => {
                e.stopPropagation();
                onColumnVisibilityChange(
                  column.field,
                  !visibleColumns.includes(column.field)
                );
              }}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={visibleColumns.includes(column.field)}
                    size="small"
                  />
                }
                label={column.headerName}
                sx={{ width: "100%", m: 0 }}
              />
            </MenuItem>
          )),
        ]}

        {/* Order Tab */}
        {tabValue === 1 && onColumnOrderChange && (
          <List dense sx={{ py: 0 }}>
            {(orderedColumns as Column[]).map((column, index) => (
              <ListItem
                key={column.field}
                secondaryAction={
                  <Box>
                    <IconButton
                      size="small"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                    >
                      <ArrowUpward fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === orderedColumns.length - 1}
                    >
                      <ArrowDownward fontSize="small" />
                    </IconButton>
                  </Box>
                }
                sx={{
                  bgcolor: visibleColumns.includes(column.field)
                    ? "transparent"
                    : "action.disabledBackground",
                }}
              >
                <ListItemText
                  primary={column.headerName}
                  secondary={
                    !visibleColumns.includes(column.field) ? "Piilotettu" : ""
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Menu>
    </>
  );
}
