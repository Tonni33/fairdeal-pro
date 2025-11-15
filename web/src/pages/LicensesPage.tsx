import { useEffect, useState } from "react";
import {
  Typography,
  Box,
  Button,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Add, Refresh, Edit, Delete } from "@mui/icons-material";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../services/firebase";
import type { License } from "../types";
import { useAuth } from "../contexts/AuthContext";
import ColumnSelector from "../components/ColumnSelector";

export default function LicensesPage() {
  const { userData } = useAuth();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);
  const [editForm, setEditForm] = useState({
    code: "",
    type: "monthly" as "monthly" | "yearly",
    duration: 30,
    isUsed: false,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load visible columns from localStorage or use defaults
  const defaultColumns = [
    "code",
    "type",
    "duration",
    "isUsed",
    "teamName",
    "usedByTeamId",
    "usedAt",
    "expiresAt",
    "remainingDays",
    "createdAt",
    "actions",
  ];
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem("licensesPage-visibleColumns");
    return saved ? JSON.parse(saved) : defaultColumns;
  });

  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem("licensesPage-columnOrder");
    return saved ? JSON.parse(saved) : [];
  });

  // Save visible columns to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(
      "licensesPage-visibleColumns",
      JSON.stringify(visibleColumns)
    );
  }, [visibleColumns]);

  useEffect(() => {
    localStorage.setItem(
      "licensesPage-columnOrder",
      JSON.stringify(columnOrder)
    );
  }, [columnOrder]);

  const loadLicenses = async () => {
    setLoading(true);
    try {
      console.log("Fetching licenses from Firestore...");
      const licensesSnapshot = await getDocs(collection(db, "licenses"));
      console.log("Licenses snapshot size:", licensesSnapshot.size);
      console.log("Licenses docs:", licensesSnapshot.docs.length);

      // Fetch teams to get licenseExpiresAt
      const teamsSnapshot = await getDocs(collection(db, "teams"));
      console.log("=== TEAMS DEBUG ===");

      // Create two maps: one by licenseId, one by team document ID
      const teamsByLicenseId = new Map();
      const teamsByTeamId = new Map();

      teamsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const teamInfo = {
          licenseExpiresAt:
            data.licenseExpiresAt?.toDate?.()?.toISOString() ||
            data.licenseExpiresAt,
          teamName: data.name,
        };

        console.log(`Team: ${data.name} (${doc.id})`);
        console.log(`  - licenseId: ${data.licenseId}`);
        console.log(`  - licenseExpiresAt: ${data.licenseExpiresAt}`);

        // Map by team document ID (for usedByTeamId lookup)
        teamsByTeamId.set(doc.id, teamInfo);

        // Map by licenseId if it exists
        if (data.licenseId) {
          teamsByLicenseId.set(data.licenseId, teamInfo);
        }
      });

      console.log("=== TEAMS BY LICENSE ID ===", teamsByLicenseId);
      console.log("=== TEAMS BY TEAM ID ===", teamsByTeamId);

      const licensesData = licensesSnapshot.docs.map((doc) => {
        const data = doc.data();

        // Try to find team data by licenseId first, then by usedByTeamId
        let teamData = teamsByLicenseId.get(doc.id);
        if (!teamData && data.usedByTeamId) {
          teamData = teamsByTeamId.get(data.usedByTeamId);
        }

        console.log(`\n=== LICENSE ${doc.id} ===`);
        console.log(
          `  - Found by licenseId: ${
            teamsByLicenseId.has(doc.id) ? "YES" : "NO"
          }`
        );
        console.log(
          `  - Found by usedByTeamId: ${
            data.usedByTeamId && teamsByTeamId.has(data.usedByTeamId)
              ? "YES"
              : "NO"
          }`
        );
        console.log(`  - teamData:`, teamData);
        console.log(`  - usedByTeamId: ${data.usedByTeamId}`);

        return {
          id: doc.id,
          ...data,
          licenseExpiresAt: teamData?.licenseExpiresAt,
          // Convert Firestore Timestamps to ISO strings
          createdAt:
            data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt:
            data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
          usedAt: data.usedAt?.toDate?.()?.toISOString() || data.usedAt,
        };
      }) as License[];

      console.log("Processed licenses data:", licensesData);
      console.log("Number of licenses:", licensesData.length);
      setLicenses(licensesData);
    } catch (error) {
      console.error("Error loading licenses:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLicenses();
  }, []);

  // Master Admin check
  if (!userData?.isMasterAdmin) {
    return (
      <Box>
        <Alert severity="error">
          <Typography variant="h6" gutterBottom>
            Ei käyttöoikeutta
          </Typography>
          <Typography variant="body2">
            Vain pääkäyttäjillä on oikeus hallita lisenssejä.
          </Typography>
        </Alert>
      </Box>
    );
  }

  const handleEdit = (license: License) => {
    setSelectedLicense(license);
    setEditForm({
      code: license.code,
      type: license.type,
      duration: license.duration,
      isUsed: license.isUsed,
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedLicense) return;

    try {
      setError("");
      const licenseRef = doc(db, "licenses", selectedLicense.id);
      await updateDoc(licenseRef, {
        code: editForm.code,
        type: editForm.type,
        duration: editForm.duration,
        isUsed: editForm.isUsed,
        updatedAt: new Date(),
      });

      setSuccess("Lisenssi päivitetty onnistuneesti!");
      setEditOpen(false);
      loadLicenses();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error updating license:", err);
      setError("Virhe lisenssin päivittämisessä");
    }
  };

  const handleDelete = (license: License) => {
    setSelectedLicense(license);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedLicense) return;

    try {
      setError("");
      await deleteDoc(doc(db, "licenses", selectedLicense.id));
      setSuccess("Lisenssi poistettu onnistuneesti!");
      setDeleteOpen(false);
      loadLicenses();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error deleting license:", err);
      setError("Virhe lisenssin poistamisessa");
    }
  };

  const columns: GridColDef<License>[] = [
    {
      field: "code",
      headerName: "Lisenssikoodi",
      width: 200,
    },
    {
      field: "type",
      headerName: "Tyyppi",
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value === "yearly" ? "Vuosi" : "Kuukausi"}
          color={params.value === "yearly" ? "primary" : "default"}
          size="small"
        />
      ),
    },
    {
      field: "duration",
      headerName: "Kesto (pv)",
      width: 110,
    },
    {
      field: "isUsed",
      headerName: "Tila",
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value ? "Käytetty" : "Käyttämätön"}
          color={params.value ? "success" : "warning"}
          size="small"
        />
      ),
    },
    {
      field: "teamName",
      headerName: "Tiimi",
      width: 180,
      valueGetter: (value: string) => value || "-",
    },
    {
      field: "usedByTeamId",
      headerName: "Tiimi ID",
      width: 150,
      valueGetter: (value: string) => value || "-",
    },
    {
      field: "usedAt",
      headerName: "Käytetty",
      width: 130,
      renderCell: (params) => {
        if (!params.value) return "-";
        try {
          return new Date(params.value).toLocaleDateString("fi-FI");
        } catch {
          return "-";
        }
      },
    },
    {
      field: "expiresAt",
      headerName: "Vanhenee",
      width: 130,
      renderCell: (params) => {
        const licenseExpiresAt = params.row.licenseExpiresAt;
        if (!licenseExpiresAt || !params.row.isUsed) return "-";
        try {
          return new Date(licenseExpiresAt).toLocaleDateString("fi-FI");
        } catch {
          return "-";
        }
      },
    },
    {
      field: "remainingDays",
      headerName: "Jäljellä",
      width: 140,
      renderCell: (params) => {
        const licenseExpiresAt = params.row.licenseExpiresAt;
        if (!licenseExpiresAt || !params.row.isUsed) return "-";
        try {
          const expiryDate = new Date(licenseExpiresAt);
          const today = new Date();
          const daysRemaining = Math.ceil(
            (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysRemaining < 0) {
            return (
              <Chip
                label={`Vanhentunut ${Math.abs(daysRemaining)} pv sitten`}
                color="error"
                size="small"
              />
            );
          } else if (daysRemaining === 0) {
            return (
              <Chip label="Vanhenee tänään" color="warning" size="small" />
            );
          } else if (daysRemaining <= 7) {
            return (
              <Chip
                label={`${daysRemaining} päivää`}
                color="warning"
                size="small"
              />
            );
          } else {
            return (
              <Chip
                label={`${daysRemaining} päivää`}
                color="success"
                size="small"
              />
            );
          }
        } catch {
          return "-";
        }
      },
    },
    {
      field: "createdAt",
      headerName: "Luotu",
      width: 130,
      renderCell: (params) => {
        if (!params.value) return "-";
        try {
          return new Date(params.value).toLocaleDateString("fi-FI");
        } catch {
          return "-";
        }
      },
    },
    {
      field: "actions",
      headerName: "Toiminnot",
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 1 }}>
          <IconButton
            size="small"
            color="primary"
            onClick={() => handleEdit(params.row)}
          >
            <Edit fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDelete(params.row)}
          >
            <Delete fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h4">Lisenssit</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <ColumnSelector
            columns={columns.map((col) => ({
              field: col.field,
              headerName: col.headerName || col.field,
            }))}
            visibleColumns={visibleColumns}
            columnOrder={columnOrder}
            onColumnVisibilityChange={(field, visible) => {
              if (visible) {
                setVisibleColumns([...visibleColumns, field]);
              } else {
                setVisibleColumns(visibleColumns.filter((f) => f !== field));
              }
            }}
            onColumnOrderChange={(newOrder) => setColumnOrder(newOrder)}
            onSelectAll={() => {
              setVisibleColumns(columns.map((col) => col.field));
            }}
            onDeselectAll={() => {
              // Keep at least 'actions' column visible
              setVisibleColumns(["actions"]);
            }}
          />
          <Button startIcon={<Refresh />} onClick={loadLicenses}>
            Päivitä
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => alert("Lisää lisenssi -toiminto tulossa pian!")}
          >
            Lisää lisenssi
          </Button>
        </Box>
      </Box>

      <Paper
        sx={{ height: 700, width: "100%", maxWidth: "100%", overflow: "auto" }}
      >
        <DataGrid
          rows={licenses}
          columns={
            (columnOrder.length > 0
              ? columnOrder
                  .map((field) => columns.find((col) => col.field === field))
                  .filter(Boolean)
              : columns
            ).filter((col) =>
              visibleColumns.includes(col!.field)
            ) as GridColDef[]
          }
          loading={loading}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 25, page: 0 },
            },
          }}
          disableRowSelectionOnClick
          rowHeight={56}
          sx={{
            border: "none",
            "& .MuiDataGrid-main": {
              borderRadius: 0,
            },
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: "#f5f5f5",
              fontSize: "0.875rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              color: "#616161",
              borderBottom: "2px solid #e0e0e0",
            },
            "& .MuiDataGrid-columnHeaderTitle": {
              fontWeight: 600,
            },
            "& .MuiDataGrid-cell": {
              padding: "12px 16px",
              fontSize: "0.9rem",
              borderBottom: "1px solid #f0f0f0",
              display: "flex",
              alignItems: "center",
            },
            "& .MuiDataGrid-row": {
              "&:hover": {
                backgroundColor: "#fafafa",
              },
            },
            "& .MuiDataGrid-cell:focus": {
              outline: "none",
            },
            "& .MuiDataGrid-cell:focus-within": {
              outline: "none",
            },
            "& .MuiDataGrid-virtualScroller": {
              marginTop: "0 !important",
            },
          }}
        />
      </Paper>

      {/* Success/Error Messages */}
      {success && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {/* Edit Dialog */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Muokkaa lisenssiä</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
            <TextField
              label="Lisenssikoodi"
              value={editForm.code}
              onChange={(e) =>
                setEditForm({ ...editForm, code: e.target.value })
              }
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Tyyppi</InputLabel>
              <Select
                value={editForm.type}
                label="Tyyppi"
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    type: e.target.value as "monthly" | "yearly",
                  })
                }
              >
                <MenuItem value="monthly">Kuukausi</MenuItem>
                <MenuItem value="yearly">Vuosi</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Kesto (päivää)"
              type="number"
              value={editForm.duration}
              onChange={(e) =>
                setEditForm({
                  ...editForm,
                  duration: parseInt(e.target.value) || 0,
                })
              }
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Tila</InputLabel>
              <Select
                value={editForm.isUsed ? "used" : "unused"}
                label="Tila"
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    isUsed: e.target.value === "used",
                  })
                }
              >
                <MenuItem value="unused">Käyttämätön</MenuItem>
                <MenuItem value="used">Käytetty</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Peruuta</Button>
          <Button onClick={handleSaveEdit} variant="contained">
            Tallenna
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Poista lisenssi</DialogTitle>
        <DialogContent>
          <Typography>
            Haluatko varmasti poistaa lisenssin "{selectedLicense?.code}"?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Tätä toimintoa ei voi perua.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Peruuta</Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
          >
            Poista
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
