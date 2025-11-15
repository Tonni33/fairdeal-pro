import { useEffect, useState, useMemo } from "react";
import {
  Typography,
  Box,
  Button,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Alert,
  IconButton,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Refresh, Lock, LockOpen } from "@mui/icons-material";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import type { User, Team } from "../types";

export default function RankingsPage() {
  const { userData } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set());
  const [tempValues, setTempValues] = useState<
    Record<string, { category?: number; multiplier?: number }>
  >({});

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

  // Get admin teams for current user
  const adminTeams = useMemo(() => {
    if (!userData) return [];
    return teams.filter((team) => team.adminIds?.includes(userData.id));
  }, [teams, userData]);

  // Filter and sort all players by selected team
  const allPlayers = useMemo(() => {
    if (!selectedTeam) return [];

    const filtered = users.filter((user) =>
      user.teamIds?.includes(selectedTeam)
    );

    // Sort: field players first (by multiplier), then goalkeepers (by multiplier)
    filtered.sort((a, b) => {
      const aIsGK = a.positions?.includes("MV");
      const bIsGK = b.positions?.includes("MV");

      // Goalkeepers always at the end
      if (aIsGK && !bIsGK) return 1;
      if (!aIsGK && bIsGK) return -1;

      // Within same type, sort by multiplier
      const aSkills = a.teamSkills?.[selectedTeam];
      const bSkills = b.teamSkills?.[selectedTeam];
      const aMult = aIsGK
        ? aSkills?.goalkeeper?.multiplier || 1
        : aSkills?.field?.multiplier || 1;
      const bMult = bIsGK
        ? bSkills?.goalkeeper?.multiplier || 1
        : bSkills?.field?.multiplier || 1;

      return aMult - bMult;
    });

    return filtered;
  }, [users, selectedTeam]);

  const handleUpdatePlayer = async (
    playerId: string,
    category: number,
    multiplier: number,
    isGoalkeeper: boolean
  ) => {
    if (!selectedTeam) return;

    try {
      const playerRef = doc(db, "users", playerId);
      const skillType = isGoalkeeper ? "goalkeeper" : "field";

      await updateDoc(playerRef, {
        [`teamSkills.${selectedTeam}.${skillType}.category`]: category,
        [`teamSkills.${selectedTeam}.${skillType}.multiplier`]: multiplier,
        [`teamSkills.${selectedTeam}.updatedAt`]: new Date(),
        updatedAt: new Date(),
      });

      await loadUsers();
    } catch (error) {
      console.error("Error updating player:", error);
      alert("Tallentaminen epäonnistui");
    }
  };

  const columns: GridColDef<User>[] = [
    {
      field: "name",
      headerName: "Nimi",
      width: 250,
      renderCell: (params) => {
        const isGoalkeeper = params.row.positions?.includes("MV");
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2">{params.value}</Typography>
            {isGoalkeeper && <span>🥅</span>}
          </Box>
        );
      },
    },
    {
      field: "category",
      headerName: "Kategoria",
      width: 120,
      renderCell: (params) => {
        const isEditing = editingRows.has(params.row.id);
        const isGoalkeeper = params.row.positions?.includes("MV");
        const teamSkill = params.row.teamSkills?.[selectedTeam];
        const skills = isGoalkeeper ? teamSkill?.goalkeeper : teamSkill?.field;
        const category = skills?.category || 1;

        if (isEditing) {
          return (
            <TextField
              type="number"
              size="small"
              defaultValue={category}
              inputProps={{ min: 1, max: 3, step: 1 }}
              sx={{ width: 70 }}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (value >= 1 && value <= 3) {
                  setTempValues((prev) => ({
                    ...prev,
                    [params.row.id]: {
                      ...prev[params.row.id],
                      category: value,
                    },
                  }));
                }
              }}
            />
          );
        }

        return <Typography variant="body2">{category}</Typography>;
      },
    },
    {
      field: "multiplier",
      headerName: "Kerroin",
      width: 120,
      renderCell: (params) => {
        const isEditing = editingRows.has(params.row.id);
        const isGoalkeeper = params.row.positions?.includes("MV");
        const teamSkill = params.row.teamSkills?.[selectedTeam];
        const skills = isGoalkeeper ? teamSkill?.goalkeeper : teamSkill?.field;
        const multiplier = skills?.multiplier || 1;

        if (isEditing) {
          return (
            <TextField
              type="number"
              size="small"
              defaultValue={multiplier.toFixed(1)}
              inputProps={{ min: 1.0, max: 3.9, step: 0.1 }}
              sx={{ width: 70 }}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                if (value >= 1.0 && value <= 3.9) {
                  setTempValues((prev) => ({
                    ...prev,
                    [params.row.id]: {
                      ...prev[params.row.id],
                      multiplier: value,
                    },
                  }));
                }
              }}
            />
          );
        }

        return <Typography variant="body2">{multiplier.toFixed(1)}</Typography>;
      },
    },
    {
      field: "actions",
      headerName: "Toiminnot",
      width: 100,
      sortable: false,
      align: "center",
      headerAlign: "center",
      renderCell: (params) => {
        const isEditing = editingRows.has(params.row.id);
        const isGoalkeeper = params.row.positions?.includes("MV");

        return (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            <IconButton
              size="small"
              color={isEditing ? "success" : "primary"}
              onClick={() => {
                if (isEditing) {
                  // Save
                  const teamSkill = params.row.teamSkills?.[selectedTeam];
                  const skills = isGoalkeeper
                    ? teamSkill?.goalkeeper
                    : teamSkill?.field;
                  const currentCategory = skills?.category || 1;
                  const currentMultiplier = skills?.multiplier || 1;

                  const tempValue = tempValues[params.row.id];
                  const newCategory = tempValue?.category || currentCategory;
                  const newMultiplier =
                    tempValue?.multiplier || currentMultiplier;

                  handleUpdatePlayer(
                    params.row.id,
                    newCategory,
                    newMultiplier,
                    isGoalkeeper
                  );

                  setEditingRows((prev) => {
                    const next = new Set(prev);
                    next.delete(params.row.id);
                    return next;
                  });

                  // Clear temp values for this row
                  setTempValues((prev) => {
                    const next = { ...prev };
                    delete next[params.row.id];
                    return next;
                  });
                } else {
                  // Edit
                  setEditingRows((prev) => new Set(prev).add(params.row.id));
                }
              }}
            >
              {isEditing ? <LockOpen /> : <Lock />}
            </IconButton>
          </Box>
        );
      },
    },
  ];

  // Admin check
  if (!userData?.isAdmin) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Sinulla ei ole oikeuksia käyttää tätä sivua. Vain adminit voivat
          hallita rankingeja.
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
        <Typography variant="h4">Ranking</Typography>
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
              {adminTeams.map((team) => (
                <MenuItem key={team.id} value={team.id}>
                  {team.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button startIcon={<Refresh />} onClick={loadUsers}>
            Päivitä
          </Button>
        </Box>
      </Box>

      {!selectedTeam && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Valitse joukkue nähdäksesi pelaajien rankingin
        </Alert>
      )}

      {selectedTeam && (
        <>
          {allPlayers.length > 0 ? (
            <Paper
              sx={{
                height: 800,
                width: "100%",
                maxWidth: "100%",
                overflow: "auto",
              }}
            >
              <DataGrid
                rows={allPlayers}
                columns={columns}
                loading={loading}
                disableRowSelectionOnClick
                pageSizeOptions={[10, 25, 50, 100]}
                initialState={{
                  pagination: {
                    paginationModel: { pageSize: 25, page: 0 },
                  },
                }}
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
          ) : (
            <Alert severity="info">Ei pelaajia valitussa joukkueessa</Alert>
          )}
        </>
      )}
    </Box>
  );
}
