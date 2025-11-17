import { useEffect, useState } from "react";
import {
  Typography,
  Box,
  Button,
  Paper,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Add, Refresh, Edit, Delete } from "@mui/icons-material";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import type { User, Team } from "../types";
import ColumnSelector from "../components/ColumnSelector";

export default function UsersPage() {
  const { userData } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Load visible columns from localStorage or use defaults
  const defaultColumns = [
    "name",
    "email",
    "phone",
    "positions",
    "teams",
    "teamMember",
    "isAdmin",
    "createdAt",
    "actions",
  ];
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem("usersPage-visibleColumns");
    return saved ? JSON.parse(saved) : defaultColumns;
  });

  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem("usersPage-columnOrder");
    return saved ? JSON.parse(saved) : [];
  });

  // Save visible columns to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(
      "usersPage-visibleColumns",
      JSON.stringify(visibleColumns)
    );
  }, [visibleColumns]);

  useEffect(() => {
    localStorage.setItem("usersPage-columnOrder", JSON.stringify(columnOrder));
  }, [columnOrder]);

  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    positions: [] as string[],
    isAdmin: false,
    teamIds: [] as string[],
    teamAdminIds: [] as string[], // Which teams user is admin in
    teamSkills: {} as User["teamSkills"],
    teamMember: {} as User["teamMember"],
  });

  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    phone: "",
    positions: [] as string[],
    category: 2,
    multiplier: 2.0,
    isAdmin: false,
    isRegularMember: true,
    teamIds: [] as string[],
    teamAdminIds: [] as string[], // Which teams user is admin in
    teamSkills: {} as User["teamSkills"],
    teamMember: {} as User["teamMember"],
  });

  const [error, setError] = useState("");

  const loadTeams = async () => {
    try {
      const teamsSnapshot = await getDocs(collection(db, "teams"));
      const teamsData = teamsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Team[];
      setTeams(teamsData);

      // Set HC KeLo as default if it exists
      const hcKelo = teamsData.find((team) => team.name === "HC KeLo");
      if (hcKelo) {
        setSelectedTeam(hcKelo.id);
      }
    } catch (error) {
      console.error("Error loading teams:", error);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const usersSnapshot = await getDocs(collection(db, "users"));
      const usersData = usersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as User[];

      // Sort by last name (Finnish alphabetical order)
      usersData.sort((a, b) => {
        const aLastName = a.name.split(" ").pop() || a.name;
        const bLastName = b.name.split(" ").pop() || b.name;
        return aLastName.localeCompare(bLastName, "fi");
      });

      setAllUsers(usersData);
      setUsers(usersData);
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeams();
    loadUsers();
  }, []);

  useEffect(() => {
    if (!selectedTeam) {
      setUsers(allUsers);
    } else {
      const filtered = allUsers.filter((user) =>
        user.teamIds?.includes(selectedTeam)
      );

      // Sort by last name (Finnish alphabetical order)
      filtered.sort((a, b) => {
        const aLastName = a.name.split(" ").pop() || a.name;
        const bLastName = b.name.split(" ").pop() || b.name;
        return aLastName.localeCompare(bLastName, "fi");
      });

      setUsers(filtered);
    }
  }, [selectedTeam, allUsers]);

  const handleEditClick = (user: User) => {
    setSelectedUser(user);

    // Find which teams the user is admin in
    const userTeamAdminIds = teams
      .filter((team) => team.adminIds?.includes(user.id))
      .map((team) => team.id);

    setEditForm({
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      positions: user.positions || [],
      isAdmin: user.isAdmin || false,
      teamIds: user.teamIds || [],
      teamAdminIds: userTeamAdminIds,
      teamSkills: user.teamSkills || {},
      teamMember: user.teamMember || {},
    });
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!selectedUser) return;

    setError("");
    try {
      // Update user document
      await updateDoc(doc(db, "users", selectedUser.id), {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        positions: editForm.positions,
        isAdmin: editForm.isAdmin,
        teamIds: editForm.teamIds,
        teamSkills: editForm.teamSkills,
        teamMember: editForm.teamMember,
      });

      // Update team adminIds based on teamAdminIds array
      // For each team the user belongs to
      for (const teamId of editForm.teamIds) {
        const teamRef = doc(db, "teams", teamId);
        const teamDoc = await getDoc(teamRef);

        if (teamDoc.exists()) {
          const teamData = teamDoc.data();
          const currentAdminIds = teamData.adminIds || [];
          const shouldBeAdmin = editForm.teamAdminIds.includes(teamId);

          if (shouldBeAdmin) {
            // Add user to adminIds if not already there
            if (!currentAdminIds.includes(selectedUser.id)) {
              await updateDoc(teamRef, {
                adminIds: [...currentAdminIds, selectedUser.id],
              });
            }
          } else {
            // Remove user from adminIds if they're there
            if (currentAdminIds.includes(selectedUser.id)) {
              await updateDoc(teamRef, {
                adminIds: currentAdminIds.filter(
                  (id: string) => id !== selectedUser.id
                ),
              });
            }
          }
        }
      }

      // Also remove from teams the user no longer belongs to
      const removedTeamIds = (selectedUser.teamIds || []).filter(
        (id) => !editForm.teamIds.includes(id)
      );
      for (const teamId of removedTeamIds) {
        const teamRef = doc(db, "teams", teamId);
        const teamDoc = await getDoc(teamRef);

        if (teamDoc.exists()) {
          const teamData = teamDoc.data();
          const currentAdminIds = teamData.adminIds || [];

          if (currentAdminIds.includes(selectedUser.id)) {
            await updateDoc(teamRef, {
              adminIds: currentAdminIds.filter(
                (id: string) => id !== selectedUser.id
              ),
            });
          }
        }
      }

      await loadUsers();
      await loadTeams(); // Reload teams to get updated adminIds
      setEditDialogOpen(false);
      setSelectedUser(null);
    } catch (err) {
      console.error("Error updating user:", err);
      setError("Käyttäjän päivitys epäonnistui");
    }
  };

  const handleAddUser = async () => {
    setError("");

    // Validation
    if (!addForm.name.trim()) {
      setError("Nimi on pakollinen");
      return;
    }

    if (!addForm.email.trim()) {
      setError("Sähköposti on pakollinen");
      return;
    }

    if (addForm.positions.length === 0) {
      setError("Valitse vähintään yksi pelipaikka");
      return;
    }

    if (addForm.teamIds.length === 0) {
      setError("Valitse vähintään yksi joukkue");
      return;
    }

    try {
      // Build teams array (team names)
      const teamNames = addForm.teamIds
        .map((teamId) => {
          const team = teams.find((t) => t.id === teamId);
          return team?.name;
        })
        .filter((name): name is string => name !== undefined);

      // Build teamSkills object - use current category and multiplier for all teams
      const teamSkills: User["teamSkills"] = {};
      addForm.teamIds.forEach((teamId) => {
        teamSkills[teamId] = {
          field: {
            category: addForm.category,
            multiplier: addForm.multiplier,
          },
          goalkeeper: {
            category: addForm.category,
            multiplier: addForm.multiplier,
          },
        };
      });

      // Build teamMember object for selected teams
      const teamMemberStatus: { [teamId: string]: boolean } = {};
      addForm.teamIds.forEach((teamId) => {
        teamMemberStatus[teamId] = addForm.isRegularMember;
      });

      // Compute primary position (legacy field)
      const position = addForm.positions.includes("MV")
        ? "MV"
        : addForm.positions.includes("P")
        ? "P"
        : "H";

      const playerData = {
        name: addForm.name.trim(),
        displayName: addForm.name.trim(),
        email: addForm.email.trim().toLowerCase(),
        phone: addForm.phone.trim(),
        teamIds: addForm.teamIds,
        teams: teamNames,
        positions: addForm.positions,
        position: position,
        category: addForm.category,
        multiplier: addForm.multiplier,
        teamSkills: teamSkills,
        isAdmin: addForm.isAdmin,
        teamMember: teamMemberStatus,
        createdAt: new Date(),
        createdBy: userData?.id,
        needsPasswordChange: addForm.email.trim() ? true : false,
      };

      // Create user in Firestore
      await addDoc(collection(db, "users"), playerData);

      // Note: Team adminIds assignment is not done during user creation
      // Admin can update this later through the edit dialog

      await loadUsers();
      setAddDialogOpen(false);

      // Reset form
      setAddForm({
        name: "",
        email: "",
        phone: "",
        positions: [],
        category: 2,
        multiplier: 2.0,
        isAdmin: false,
        isRegularMember: true,
        teamIds: [],
        teamAdminIds: [],
        teamSkills: {},
        teamMember: {},
      });

      alert("Käyttäjä luotu onnistuneesti!");
    } catch (err) {
      console.error("Error creating user:", err);
      setError("Käyttäjän luominen epäonnistui");
    }
  };

  const handleDeleteClick = (user: User) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedUser) return;

    setError("");
    try {
      await deleteDoc(doc(db, "users", selectedUser.id));
      await loadUsers();
      setDeleteDialogOpen(false);
      setSelectedUser(null);
    } catch (err) {
      console.error("Error deleting user:", err);
      setError("Käyttäjän poisto epäonnistui");
    }
  };

  const columns: GridColDef<User>[] = [
    {
      field: "name",
      headerName: "Nimi",
      width: 220,
    },
    {
      field: "email",
      headerName: "Sähköposti",
      width: 260,
    },
    {
      field: "teamIds",
      headerName: "Joukkueet",
      width: 140,
      renderCell: (params) => {
        const teamIds = params.value as string[] | undefined;
        if (!teamIds || teamIds.length === 0) return "-";

        return (
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {teamIds.map((teamId) => {
              const team = teams.find((t) => t.id === teamId);
              if (!team) return null;

              return (
                <Box
                  key={teamId}
                  sx={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    bgcolor: team.color || "#1976d2",
                    border: "1.5px solid rgba(0,0,0,0.1)",
                  }}
                  title={team.name}
                />
              );
            })}
          </Box>
        );
      },
    },
    {
      field: "positions",
      headerName: "Pelipaikat",
      width: 120,
      valueGetter: (value: string[]) => {
        return value?.join(", ") || "-";
      },
    },
    {
      field: "category",
      headerName: "Category",
      width: 120,
      valueGetter: (_value: unknown, row: User) => {
        if (!row.teamSkills || !selectedTeam || selectedTeam === "all")
          return "-";
        const teamSkill = row.teamSkills[selectedTeam];
        return teamSkill?.field?.category || "-";
      },
    },
    {
      field: "multiplier",
      headerName: "Multiplier",
      width: 120,
      valueGetter: (_value: unknown, row: User) => {
        if (!row.teamSkills || !selectedTeam || selectedTeam === "all")
          return "-";
        const teamSkill = row.teamSkills[selectedTeam];
        return teamSkill?.field?.multiplier || "-";
      },
    },
    {
      field: "teamMember",
      headerName: "Vakiokävijä",
      width: 130,
      renderCell: (params) => {
        const teamMember = params.row.teamMember;
        if (!selectedTeam || selectedTeam === "all") return "-";

        const value = teamMember?.[selectedTeam];

        // Ei asetettu
        if (value === undefined) {
          return <Chip label="Ei asetettu" color="default" size="small" />;
        }

        const isTeamMember = value === true;
        return (
          <Chip
            label={isTeamMember ? "Kyllä" : "Ei"}
            color={isTeamMember ? "success" : "default"}
            size="small"
          />
        );
      },
    },
    {
      field: "isAdmin",
      headerName: "Rooli",
      width: 120,
      renderCell: (params) => {
        // Check if user is admin for the selected team
        const isTeamAdmin = selectedTeam
          ? teams
              .find((t) => t.id === selectedTeam)
              ?.adminIds?.includes(params.row.id) || false
          : params.row.isAdmin;

        return (
          <Chip
            label={isTeamAdmin ? "Admin" : "Jäsen"}
            color={isTeamAdmin ? "primary" : "default"}
            size="small"
          />
        );
      },
    },
    {
      field: "phone",
      headerName: "Puhelinnumero",
      width: 170,
    },
    {
      field: "actions",
      headerName: "Toiminnot",
      width: 140,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 1 }}>
          <IconButton
            size="small"
            color="primary"
            onClick={() => handleEditClick(params.row)}
          >
            <Edit fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDeleteClick(params.row)}
          >
            <Delete fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  // Admin check
  if (!userData?.isAdmin) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Sinulla ei ole oikeuksia käyttää tätä sivua. Vain adminit voivat
          hallita käyttäjiä.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Typography variant="h4">Käyttäjät</Typography>
        <Box
          sx={{
            display: "flex",
            gap: 2,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Joukkue</InputLabel>
            <Select
              value={selectedTeam}
              label="Joukkue"
              onChange={(e) => setSelectedTeam(e.target.value)}
            >
              {teams.map((team) => (
                <MenuItem key={team.id} value={team.id}>
                  {team.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
          <Button startIcon={<Refresh />} onClick={loadUsers}>
            Päivitä
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setAddDialogOpen(true)}
          >
            Lisää käyttäjä
          </Button>
        </Box>
      </Box>

      <Paper
        sx={{ height: 800, width: "100%", maxWidth: "100%", overflow: "auto" }}
      >
        <DataGrid
          rows={users}
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

      {/* Add User Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Lisää käyttäjä</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 2,
              mt: 1,
            }}
          >
            <TextField
              fullWidth
              label="Nimi *"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
            />
            <TextField
              fullWidth
              label="Sähköposti *"
              type="email"
              value={addForm.email}
              onChange={(e) =>
                setAddForm({ ...addForm, email: e.target.value })
              }
            />
            <TextField
              fullWidth
              label="Puhelinnumero"
              value={addForm.phone}
              onChange={(e) =>
                setAddForm({ ...addForm, phone: e.target.value })
              }
            />
          </Box>

          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Joukkueet *
            </Typography>
            <Box
              sx={{
                p: 2,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                bgcolor: "background.paper",
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {teams.map((team) => (
                <Box
                  key={team.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 1,
                  }}
                >
                  <Checkbox
                    checked={addForm.teamIds.includes(team.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setAddForm({
                          ...addForm,
                          teamIds: [...addForm.teamIds, team.id],
                        });
                      } else {
                        setAddForm({
                          ...addForm,
                          teamIds: addForm.teamIds.filter(
                            (id) => id !== team.id
                          ),
                          teamAdminIds: addForm.teamAdminIds.filter(
                            (id) => id !== team.id
                          ),
                        });
                      }
                    }}
                  />
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      bgcolor: team.color || "#1976d2",
                    }}
                  />
                  <Typography>{team.name}</Typography>
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Pelipaikat *
            </Typography>
            <Box
              sx={{
                p: 2,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                bgcolor: "background.paper",
              }}
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, auto)",
                  gap: 6,
                  justifyContent: "start",
                }}
              >
                {["H", "P", "MV"].map((position) => (
                  <Box
                    key={position}
                    sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
                  >
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      sx={{ textAlign: "center" }}
                    >
                      {position}
                    </Typography>
                    <Checkbox
                      checked={addForm.positions.includes(position)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAddForm({
                            ...addForm,
                            positions: [...addForm.positions, position],
                          });
                        } else {
                          setAddForm({
                            ...addForm,
                            positions: addForm.positions.filter(
                              (p) => p !== position
                            ),
                          });
                        }
                      }}
                      sx={{ p: 0 }}
                    />
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Taitotaso
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 2,
              }}
            >
              <TextField
                size="small"
                type="number"
                label="Category"
                value={addForm.category}
                onChange={(e) =>
                  setAddForm({
                    ...addForm,
                    category: Number(e.target.value),
                  })
                }
              />
              <TextField
                size="small"
                type="number"
                label="Multiplier"
                value={addForm.multiplier}
                inputProps={{ step: 0.1 }}
                onChange={(e) =>
                  setAddForm({
                    ...addForm,
                    multiplier: Number(e.target.value),
                  })
                }
              />
            </Box>
          </Box>

          <Box sx={{ mt: 3 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={addForm.isRegularMember}
                  onChange={(e) =>
                    setAddForm({
                      ...addForm,
                      isRegularMember: e.target.checked,
                    })
                  }
                />
              }
              label="Vakiokävijä kaikissa valituissa joukkueissa"
            />
          </Box>

          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={addForm.isAdmin}
                  onChange={(e) =>
                    setAddForm({
                      ...addForm,
                      isAdmin: e.target.checked,
                    })
                  }
                />
              }
              label="Admin-oikeudet"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Peruuta</Button>
          <Button onClick={handleAddUser} variant="contained">
            Luo käyttäjä
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <span>Muokkaa käyttäjää</span>
            {selectedTeam && (
              <>
                <span>-</span>
                <Box
                  sx={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    bgcolor:
                      teams.find((t) => t.id === selectedTeam)?.color ||
                      "#1976d2",
                    border: "2px solid rgba(0,0,0,0.1)",
                  }}
                />
                <span>{teams.find((t) => t.id === selectedTeam)?.name}</span>
              </>
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 2,
              mt: 1,
            }}
          >
            <TextField
              fullWidth
              label="Nimi"
              value={editForm.name}
              onChange={(e) =>
                setEditForm({ ...editForm, name: e.target.value })
              }
            />
            <TextField
              fullWidth
              label="Sähköposti"
              type="email"
              value={editForm.email}
              onChange={(e) =>
                setEditForm({ ...editForm, email: e.target.value })
              }
            />
            <TextField
              fullWidth
              label="Puhelinnumero"
              value={editForm.phone}
              onChange={(e) =>
                setEditForm({ ...editForm, phone: e.target.value })
              }
            />
          </Box>

          {/* Team Selection for Admins */}
          {userData &&
            teams.filter((t) => t.adminIds?.includes(userData.id)).length >
              0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Joukkueet (voit lisätä joukkueisiin joissa olet admin)
                </Typography>
                <Box
                  sx={{
                    p: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    bgcolor: "background.paper",
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                >
                  {teams
                    .filter((team) => team.adminIds?.includes(userData.id))
                    .map((team) => (
                      <Box
                        key={team.id}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          mb: 1,
                        }}
                      >
                        <Checkbox
                          checked={editForm.teamIds.includes(team.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditForm({
                                ...editForm,
                                teamIds: [...editForm.teamIds, team.id],
                              });
                            } else {
                              const newTeamMember = { ...editForm.teamMember };
                              delete newTeamMember[team.id];
                              setEditForm({
                                ...editForm,
                                teamIds: editForm.teamIds.filter(
                                  (id) => id !== team.id
                                ),
                                teamAdminIds: editForm.teamAdminIds.filter(
                                  (id) => id !== team.id
                                ),
                                teamMember: newTeamMember,
                              });
                            }
                          }}
                        />
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            bgcolor: team.color || "#1976d2",
                          }}
                        />
                        <Typography>{team.name}</Typography>
                      </Box>
                    ))}
                </Box>
              </Box>
            )}

          {selectedTeam && (
            <>
              <Box sx={{ mt: 3 }}>
                <Box
                  sx={{
                    p: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    bgcolor: "background.paper",
                  }}
                >
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 2,
                      mb: 1,
                    }}
                  >
                    <Typography variant="body2" fontWeight={600}>
                      Jäsenyys
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      Vakiokävijä
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      Admin
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 2,
                    }}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={editForm.teamIds.includes(selectedTeam)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditForm({
                                ...editForm,
                                teamIds: [...editForm.teamIds, selectedTeam],
                              });
                            } else {
                              setEditForm({
                                ...editForm,
                                teamIds: editForm.teamIds.filter(
                                  (id) => id !== selectedTeam
                                ),
                                teamAdminIds: editForm.teamAdminIds.filter(
                                  (id) => id !== selectedTeam
                                ),
                                teamMember: {
                                  ...editForm.teamMember,
                                  [selectedTeam]: false,
                                },
                              });
                            }
                          }}
                        />
                      }
                      label="Jäsen"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={editForm.teamMember?.[selectedTeam] === true}
                          disabled={!editForm.teamIds.includes(selectedTeam)}
                          onChange={(e) => {
                            setEditForm({
                              ...editForm,
                              teamMember: {
                                ...editForm.teamMember,
                                [selectedTeam]: e.target.checked,
                              },
                            });
                          }}
                        />
                      }
                      label="Kyllä"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={editForm.teamAdminIds.includes(selectedTeam)}
                          disabled={!editForm.teamIds.includes(selectedTeam)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditForm({
                                ...editForm,
                                teamAdminIds: [
                                  ...editForm.teamAdminIds,
                                  selectedTeam,
                                ],
                              });
                            } else {
                              setEditForm({
                                ...editForm,
                                teamAdminIds: editForm.teamAdminIds.filter(
                                  (id) => id !== selectedTeam
                                ),
                              });
                            }
                          }}
                        />
                      }
                      label="Kyllä"
                    />
                  </Box>
                </Box>
              </Box>
            </>
          )}

          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Pelipaikat
            </Typography>
            <Box
              sx={{
                p: 2,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                bgcolor: "background.paper",
              }}
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, auto)",
                  gap: 6,
                  justifyContent: "start",
                }}
              >
                {["H", "P", "MV"].map((position) => (
                  <Box
                    key={position}
                    sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
                  >
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      sx={{ textAlign: "center" }}
                    >
                      {position}
                    </Typography>
                    <Checkbox
                      checked={editForm.positions.includes(position)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditForm({
                            ...editForm,
                            positions: [...editForm.positions, position],
                          });
                        } else {
                          setEditForm({
                            ...editForm,
                            positions: editForm.positions.filter(
                              (p) => p !== position
                            ),
                          });
                        }
                      }}
                      sx={{ p: 0 }}
                    />
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

          {editForm.teamIds.length > 0 &&
            selectedTeam &&
            editForm.teamIds.includes(selectedTeam) && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Joukkuekohtaiset taidot
                </Typography>
                {(() => {
                  const team = teams.find((t) => t.id === selectedTeam);
                  const skills = editForm.teamSkills?.[selectedTeam];
                  return (
                    <Box
                      sx={{
                        p: 2,
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                        bgcolor: "background.paper",
                      }}
                    >
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        gutterBottom
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          mb: 2,
                        }}
                      >
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            bgcolor: team?.color || "#1976d2",
                          }}
                        />
                        {team?.name || selectedTeam}
                      </Typography>
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 1.5,
                        }}
                      >
                        <TextField
                          size="small"
                          type="number"
                          label="Kenttä Category"
                          value={skills?.field?.category || 0}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              teamSkills: {
                                ...editForm.teamSkills,
                                [selectedTeam]: {
                                  ...skills,
                                  field: {
                                    ...skills?.field,
                                    category: Number(e.target.value),
                                    multiplier: skills?.field?.multiplier || 1,
                                  },
                                  goalkeeper: skills?.goalkeeper || {
                                    category: 0,
                                    multiplier: 1,
                                  },
                                },
                              },
                            })
                          }
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Kenttä Multiplier"
                          value={skills?.field?.multiplier || 1}
                          inputProps={{ step: 0.1 }}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              teamSkills: {
                                ...editForm.teamSkills,
                                [selectedTeam]: {
                                  ...skills,
                                  field: {
                                    ...skills?.field,
                                    category: skills?.field?.category || 0,
                                    multiplier: Number(e.target.value),
                                  },
                                  goalkeeper: skills?.goalkeeper || {
                                    category: 0,
                                    multiplier: 1,
                                  },
                                },
                              },
                            })
                          }
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Maalivahti Category"
                          value={skills?.goalkeeper?.category || 0}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              teamSkills: {
                                ...editForm.teamSkills,
                                [selectedTeam]: {
                                  ...skills,
                                  field: skills?.field || {
                                    category: 0,
                                    multiplier: 1,
                                  },
                                  goalkeeper: {
                                    ...skills?.goalkeeper,
                                    category: Number(e.target.value),
                                    multiplier:
                                      skills?.goalkeeper?.multiplier || 1,
                                  },
                                },
                              },
                            })
                          }
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Maalivahti Multiplier"
                          value={skills?.goalkeeper?.multiplier || 1}
                          inputProps={{ step: 0.1 }}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              teamSkills: {
                                ...editForm.teamSkills,
                                [selectedTeam]: {
                                  ...skills,
                                  field: skills?.field || {
                                    category: 0,
                                    multiplier: 1,
                                  },
                                  goalkeeper: {
                                    ...skills?.goalkeeper,
                                    category: skills?.goalkeeper?.category || 0,
                                    multiplier: Number(e.target.value),
                                  },
                                },
                              },
                            })
                          }
                        />
                      </Box>
                    </Box>
                  );
                })()}
              </Box>
            )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Peruuta</Button>
          <Button onClick={handleEditSave} variant="contained">
            Tallenna
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Poista käyttäjä</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography>
            Haluatko varmasti poistaa käyttäjän{" "}
            <strong>{selectedUser?.name}</strong>? Tätä toimintoa ei voi
            peruuttaa.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Peruuta</Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
          >
            Poista
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
