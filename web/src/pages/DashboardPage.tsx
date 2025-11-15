import { Typography, Paper, Box } from "@mui/material";
import { People, Group, CardMembership, TrendingUp } from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../services/firebase";

export default function DashboardPage() {
  const { userData } = useAuth();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTeams: 0,
    activeLicenses: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [usersSnap, teamsSnap, licensesSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "teams")),
          getDocs(collection(db, "licenses")),
        ]);

        setStats({
          totalUsers: usersSnap.size,
          totalTeams: teamsSnap.size,
          activeLicenses: licensesSnap.docs.filter((doc) => doc.data().isActive)
            .length,
        });
      } catch (error) {
        console.error("Error loading stats:", error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  const statCards = [
    {
      title: "Käyttäjät",
      value: stats.totalUsers,
      icon: <People sx={{ fontSize: 40 }} />,
      color: "#1976d2",
    },
    {
      title: "Tiimit",
      value: stats.totalTeams,
      icon: <Group sx={{ fontSize: 40 }} />,
      color: "#2e7d32",
    },
    {
      title: "Aktiiviset lisenssit",
      value: stats.activeLicenses,
      icon: <CardMembership sx={{ fontSize: 40 }} />,
      color: "#ed6c02",
    },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Tervetuloa, {userData?.name || "Admin"}!
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Yleiskatsaus järjestelmän tilaan
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: 3,
          mt: 2,
        }}
      >
        {statCards.map((card) => (
          <Paper
            key={card.title}
            sx={{
              p: 3,
              display: "flex",
              flexDirection: "column",
              height: 140,
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                mb: 2,
              }}
            >
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {card.title}
                </Typography>
                <Typography variant="h3" component="div">
                  {loading ? "..." : card.value}
                </Typography>
              </Box>
              <Box sx={{ color: card.color }}>{card.icon}</Box>
            </Box>
          </Paper>
        ))}
      </Box>

      <Paper sx={{ mt: 4, p: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <TrendingUp sx={{ mr: 1, color: "primary.main" }} />
          <Typography variant="h6">Viimeisimmät tapahtumat</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Aktiviteettiloki tulossa pian...
        </Typography>
      </Paper>
    </Box>
  );
}
