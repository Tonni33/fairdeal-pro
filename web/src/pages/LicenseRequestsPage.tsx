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
  Alert,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import {
  Refresh,
  CheckCircle,
  Cancel,
  Info,
  Edit,
  Delete,
} from "@mui/icons-material";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  addDoc,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import ColumnSelector from "../components/ColumnSelector";

interface LicenseRequest {
  id: string;
  adminEmail: string;
  adminName: string;
  adminPhone: string;
  estimatedPlayerCount: number;
  requestType: "new" | "renewal";
  requestedAt: string;
  requestedBy: string;
  requestedLicenseType: "trial" | "monthly" | "yearly";
  reviewedAt?: string;
  reviewedBy?: string;
  status: "pending" | "approved" | "rejected";
  teamId: string;
  teamName: string;
}

export default function LicenseRequestsPage() {
  const { userData } = useAuth();
  const [requests, setRequests] = useState<LicenseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LicenseRequest | null>(
    null
  );
  const [editForm, setEditForm] = useState({
    adminEmail: "",
    adminName: "",
    adminPhone: "",
    estimatedPlayerCount: 0,
    requestType: "new" as "new" | "renewal",
    requestedLicenseType: "trial" as "trial" | "monthly" | "yearly",
    status: "pending" as "pending" | "approved" | "rejected",
    teamName: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load visible columns from localStorage or use defaults
  const defaultColumns = [
    "teamName",
    "adminName",
    "adminEmail",
    "adminPhone",
    "requestType",
    "requestedLicenseType",
    "estimatedPlayerCount",
    "status",
    "requestedAt",
    "reviewedBy",
    "reviewedAt",
    "details",
    "actions",
  ];
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem("licenseRequestsPage-visibleColumns");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Add 'details' if it's not in the saved list (for existing users)
      if (!parsed.includes("details")) {
        // Insert 'details' before 'actions'
        const actionsIndex = parsed.indexOf("actions");
        if (actionsIndex !== -1) {
          parsed.splice(actionsIndex, 0, "details");
        } else {
          parsed.push("details");
        }
      }
      return parsed;
    }
    return defaultColumns;
  });

  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem("licenseRequestsPage-columnOrder");
    return saved ? JSON.parse(saved) : [];
  });

  // Save visible columns to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(
      "licenseRequestsPage-visibleColumns",
      JSON.stringify(visibleColumns)
    );
  }, [visibleColumns]);

  useEffect(() => {
    localStorage.setItem(
      "licenseRequestsPage-columnOrder",
      JSON.stringify(columnOrder)
    );
  }, [columnOrder]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const requestsSnapshot = await getDocs(collection(db, "licenseRequests"));
      const requestsData = requestsSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Convert Firestore Timestamps to ISO strings
          requestedAt:
            data.requestedAt?.toDate?.()?.toISOString() || data.requestedAt,
          reviewedAt:
            data.reviewedAt?.toDate?.()?.toISOString() || data.reviewedAt,
        };
      }) as LicenseRequest[];

      // Sort by newest first, pending first
      requestsData.sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
        return (
          new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
        );
      });

      setRequests(requestsData);
    } catch (error) {
      console.error("Error loading license requests:", error);
      setError("Virhe pyyntöjen lataamisessa");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
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
            Vain pääkäyttäjillä on oikeus käsitellä lisenssipyyntöjä.
          </Typography>
        </Alert>
      </Box>
    );
  }

  const handleConfirmReview = async (action: "approve" | "reject") => {
    if (!selectedRequest || !userData) return;

    try {
      setError("");

      if (action === "approve") {
        // Helper function to generate license code (matching existing format)
        const generateLicenseCode = (type: string): string => {
          const prefix = "FD2024";
          const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
          // First letter based on type: Y=yearly, M=monthly, T=trial, H=half-season, S=season
          let suffix = "Y"; // default yearly
          if (type === "monthly") suffix = "M";
          else if (type === "trial") suffix = "T";
          else if (type === "half-season") suffix = "H";
          else if (type === "season") suffix = "S";

          let code = "";
          for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
          }

          return `${prefix}-${suffix}${code}`;
        };

        // Helper function to get duration in days
        const getDurationDays = (
          type: "trial" | "monthly" | "yearly" | "half-season" | "season"
        ): number => {
          switch (type) {
            case "trial":
              return 60; // 2 months for trial
            case "monthly":
              return 30; // 1 month
            case "yearly":
              return 365; // 1 year (matching existing 240 could be custom)
            case "half-season":
              return 183; // ~6 months
            case "season":
              return 365; // 1 year
            default:
              return 365;
          }
        };

        // Get team data
        const teamRef = doc(db, "teams", selectedRequest.teamId);
        const teamSnap = await getDoc(teamRef);
        const teamData = teamSnap.data();
        const teamName = teamData?.name || "Unknown Team";

        // Determine license type from request
        const licenseType = selectedRequest.requestedLicenseType || "trial";
        const duration = getDurationDays(licenseType);
        const licenseCode = generateLicenseCode(licenseType);

        const now = new Date();
        const expiresAt = new Date(
          now.getTime() + duration * 24 * 60 * 60 * 1000
        );

        // Create new license document
        const newLicenseRef = await addDoc(collection(db, "licenses"), {
          code: licenseCode,
          type: licenseType,
          duration: duration,
          isUsed: true,
          usedByTeamId: selectedRequest.teamId,
          teamName: teamName,
          usedAt: now,
          createdAt: now,
          createdBy: userData.id,
        });

        // Update team document with license info
        await updateDoc(teamRef, {
          licenseId: newLicenseRef.id,
          licenceCode: licenseCode,
          licenseExpiresAt: expiresAt,
          licenseType: licenseType,
          licenseStatus: "active",
          licenseActivatedAt: now,
          licenseDuration: duration,
        });

        // Update request status
        const requestRef = doc(db, "licenseRequests", selectedRequest.id);
        await updateDoc(requestRef, {
          status: "approved",
          reviewedAt: new Date(),
          reviewedBy: userData.id,
          assignedLicenseCode: licenseCode,
        });

        setSuccess("Pyyntö hyväksytty ja uusi lisenssi luotu onnistuneesti!");
      } else {
        // Reject request
        const requestRef = doc(db, "licenseRequests", selectedRequest.id);
        await updateDoc(requestRef, {
          status: "rejected",
          reviewedAt: new Date(),
          reviewedBy: userData.id,
        });

        setSuccess("Pyyntö hylätty onnistuneesti!");
      }

      setDetailsOpen(false);
      loadRequests();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error reviewing request:", err);
      setError("Virhe pyynnön käsittelyssä");
    }
  };

  const handleShowDetails = (request: LicenseRequest) => {
    setSelectedRequest(request);
    setDetailsOpen(true);
  };

  const handleEdit = (request: LicenseRequest) => {
    setSelectedRequest(request);
    setEditForm({
      adminEmail: request.adminEmail,
      adminName: request.adminName,
      adminPhone: request.adminPhone,
      estimatedPlayerCount: request.estimatedPlayerCount,
      requestType: request.requestType,
      requestedLicenseType: request.requestedLicenseType,
      status: request.status,
      teamName: request.teamName,
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedRequest) return;

    try {
      setError("");
      const requestRef = doc(db, "licenseRequests", selectedRequest.id);
      await updateDoc(requestRef, {
        adminEmail: editForm.adminEmail,
        adminName: editForm.adminName,
        adminPhone: editForm.adminPhone,
        estimatedPlayerCount: editForm.estimatedPlayerCount,
        requestType: editForm.requestType,
        requestedLicenseType: editForm.requestedLicenseType,
        status: editForm.status,
        teamName: editForm.teamName,
        updatedAt: new Date(),
      });

      setSuccess("Pyyntö päivitetty onnistuneesti!");
      setEditOpen(false);
      loadRequests();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error updating request:", err);
      setError("Virhe pyynnön päivittämisessä");
    }
  };

  const handleDelete = (request: LicenseRequest) => {
    setSelectedRequest(request);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedRequest) return;

    try {
      setError("");
      await deleteDoc(doc(db, "licenseRequests", selectedRequest.id));
      setSuccess("Pyyntö poistettu onnistuneesti!");
      setDeleteOpen(false);
      loadRequests();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error deleting request:", err);
      setError("Virhe pyynnön poistamisessa");
    }
  };

  const columns: GridColDef<LicenseRequest>[] = [
    {
      field: "status",
      headerName: "Tila",
      width: 130,
      renderCell: (params) => {
        let color: "warning" | "success" | "error" = "warning";
        let label = "Odottaa";

        if (params.value === "approved") {
          color = "success";
          label = "Hyväksytty";
        } else if (params.value === "rejected") {
          color = "error";
          label = "Hylätty";
        }

        return <Chip label={label} color={color} size="small" />;
      },
    },
    {
      field: "teamName",
      headerName: "Joukkue",
      width: 180,
    },
    {
      field: "requestType",
      headerName: "Tyyppi",
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value === "new" ? "Uusi" : "Uusinta"}
          variant="outlined"
          size="small"
        />
      ),
    },
    {
      field: "requestedLicenseType",
      headerName: "Lisenssi",
      width: 120,
      renderCell: (params) => {
        let label = "Kokeilu";
        if (params.value === "monthly") label = "Kuukausi";
        if (params.value === "yearly") label = "Vuosi";
        return <Chip label={label} size="small" />;
      },
    },
    {
      field: "adminName",
      headerName: "Admin",
      width: 180,
    },
    {
      field: "adminEmail",
      headerName: "Sähköposti",
      width: 200,
    },
    {
      field: "adminPhone",
      headerName: "Puhelin",
      width: 130,
    },
    {
      field: "estimatedPlayerCount",
      headerName: "Pelaajia",
      width: 100,
      type: "number",
    },
    {
      field: "requestedAt",
      headerName: "Pyydetty",
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
      field: "reviewedAt",
      headerName: "Käsitelty",
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
      field: "details",
      headerName: "Tiedot",
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <Button
          variant="outlined"
          size="small"
          startIcon={<Info fontSize="small" />}
          onClick={() => handleShowDetails(params.row)}
          sx={{ whiteSpace: "nowrap" }}
        >
          Avaa
        </Button>
      ),
    },
    {
      field: "actions",
      headerName: "Toiminnot",
      width: 200,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <IconButton
            size="small"
            color="primary"
            onClick={() => handleEdit(params.row)}
            title="Muokkaa"
          >
            <Edit fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDelete(params.row)}
            title="Poista"
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
        <Typography variant="h4">Lisenssipyynnöt</Typography>
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
              setVisibleColumns(["actions"]);
            }}
          />
          <Button startIcon={<Refresh />} onClick={loadRequests}>
            Päivitä
          </Button>
        </Box>
      </Box>

      {/* Success/Error Messages */}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper
        sx={{ height: 700, width: "100%", maxWidth: "100%", overflow: "auto" }}
      >
        <DataGrid
          rows={requests}
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

      {/* Details Dialog */}
      <Dialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Pyynnön tiedot</DialogTitle>
        <DialogContent>
          {selectedRequest && (
            <Box sx={{ mt: 2 }}>
              <TextField
                label="Joukkue"
                value={selectedRequest.teamName}
                fullWidth
                margin="normal"
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Tila"
                value={
                  selectedRequest.status === "pending"
                    ? "Odottaa"
                    : selectedRequest.status === "approved"
                    ? "Hyväksytty"
                    : "Hylätty"
                }
                fullWidth
                margin="normal"
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Pyyntötyyppi"
                value={
                  selectedRequest.requestType === "new" ? "Uusi" : "Uusinta"
                }
                fullWidth
                margin="normal"
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Lisenssin tyyppi"
                value={
                  selectedRequest.requestedLicenseType === "trial"
                    ? "Kokeilu"
                    : selectedRequest.requestedLicenseType === "monthly"
                    ? "Kuukausi"
                    : "Vuosi"
                }
                fullWidth
                margin="normal"
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Arvioitu pelaajamäärä"
                value={selectedRequest.estimatedPlayerCount}
                fullWidth
                margin="normal"
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Admin"
                value={selectedRequest.adminName}
                fullWidth
                margin="normal"
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Sähköposti"
                value={selectedRequest.adminEmail}
                fullWidth
                margin="normal"
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Puhelin"
                value={selectedRequest.adminPhone}
                fullWidth
                margin="normal"
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Pyydetty"
                value={
                  selectedRequest.requestedAt
                    ? new Date(selectedRequest.requestedAt).toLocaleString(
                        "fi-FI"
                      )
                    : "-"
                }
                fullWidth
                margin="normal"
                InputProps={{ readOnly: true }}
              />
              {selectedRequest.reviewedAt && (
                <TextField
                  label="Käsitelty"
                  value={new Date(selectedRequest.reviewedAt).toLocaleString(
                    "fi-FI"
                  )}
                  fullWidth
                  margin="normal"
                  InputProps={{ readOnly: true }}
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>Sulje</Button>
          {selectedRequest?.status === "pending" && (
            <>
              <Button
                onClick={() => handleConfirmReview("reject")}
                color="error"
                variant="contained"
                startIcon={<Cancel />}
              >
                Hylkää
              </Button>
              <Button
                onClick={() => handleConfirmReview("approve")}
                color="success"
                variant="contained"
                startIcon={<CheckCircle />}
              >
                Hyväksy
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Muokkaa pyyntöä</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <TextField
              label="Joukkue"
              value={editForm.teamName}
              onChange={(e) =>
                setEditForm({ ...editForm, teamName: e.target.value })
              }
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Tila</InputLabel>
                <Select
                  value={editForm.status}
                  label="Tila"
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      status: e.target.value as
                        | "pending"
                        | "approved"
                        | "rejected",
                    })
                  }
                >
                  <MenuItem value="pending">Odottaa</MenuItem>
                  <MenuItem value="approved">Hyväksytty</MenuItem>
                  <MenuItem value="rejected">Hylätty</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Pyyntötyyppi</InputLabel>
                <Select
                  value={editForm.requestType}
                  label="Pyyntötyyppi"
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      requestType: e.target.value as "new" | "renewal",
                    })
                  }
                >
                  <MenuItem value="new">Uusi</MenuItem>
                  <MenuItem value="renewal">Uusinta</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <FormControl fullWidth>
              <InputLabel>Lisenssin tyyppi</InputLabel>
              <Select
                value={editForm.requestedLicenseType}
                label="Lisenssin tyyppi"
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    requestedLicenseType: e.target.value as
                      | "trial"
                      | "monthly"
                      | "yearly",
                  })
                }
              >
                <MenuItem value="trial">Kokeilu</MenuItem>
                <MenuItem value="monthly">Kuukausi</MenuItem>
                <MenuItem value="yearly">Vuosi</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Arvioitu pelaajamäärä"
              type="number"
              value={editForm.estimatedPlayerCount}
              onChange={(e) =>
                setEditForm({
                  ...editForm,
                  estimatedPlayerCount: parseInt(e.target.value) || 0,
                })
              }
              fullWidth
            />
            <TextField
              label="Admin"
              value={editForm.adminName}
              onChange={(e) =>
                setEditForm({ ...editForm, adminName: e.target.value })
              }
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Sähköposti"
                type="email"
                value={editForm.adminEmail}
                onChange={(e) =>
                  setEditForm({ ...editForm, adminEmail: e.target.value })
                }
                fullWidth
              />
              <TextField
                label="Puhelin"
                value={editForm.adminPhone}
                onChange={(e) =>
                  setEditForm({ ...editForm, adminPhone: e.target.value })
                }
                fullWidth
              />
            </Stack>
          </Stack>
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
        <DialogTitle>Poista pyyntö</DialogTitle>
        <DialogContent>
          <Typography>
            Haluatko varmasti poistaa joukkueen "{selectedRequest?.teamName}"
            lisenssipyynnön?
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
