import {
  Typography,
  Paper,
  Box,
  List,
  ListItem,
  ListItemText,
  Chip,
} from "@mui/material";
import {
  People,
  Group,
  CardMembership,
  TrendingUp,
  PersonAdd,
  GroupAdd,
  Event as EventIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "../services/firebase";

export default function DashboardPage() {
  const { userData } = useAuth();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTeams: 0,
    activeLicenses: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentActivities, setRecentActivities] = useState<
    Array<{
      id: string;
      type: "user" | "team" | "event";
      title: string;
      subtitle: string;
      timestamp: Date;
    }>
  >([]);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [usersSnap, teamsSnap, eventsSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "teams")),
          getDocs(
            query(
              collection(db, "events"),
              orderBy("createdAt", "desc"),
              limit(10)
            )
          ),
        ]);

        console.log("📊 Dashboard stats - Teams count:", teamsSnap.size);

        // Count active licenses from teams collection
        const activeLicensesCount = teamsSnap.docs.filter((doc) => {
          const data = doc.data();
          console.log(
            `Team: ${data.name}, License Status:`,
            data.licenseStatus
          );
          return data.licenseStatus === "active";
        }).length;

        console.log("📊 Active licenses count:", activeLicensesCount);

        setStats({
          totalUsers: usersSnap.size,
          totalTeams: teamsSnap.size,
          activeLicenses: activeLicensesCount,
        });

        // Collect recent activities
        const activities: Array<{
          id: string;
          type: "user" | "team" | "event";
          title: string;
          subtitle: string;
          timestamp: Date;
        }> = [];

        // Add recent users
        usersSnap.docs.slice(0, 5).forEach((doc) => {
          const data = doc.data();
          if (data.createdAt) {
            activities.push({
              id: doc.id,
              type: "user",
              title: "Uusi käyttäjä rekisteröitynyt",
              subtitle: data.name || data.email || "Tuntematon",
              timestamp: data.createdAt?.toDate?.() || new Date(data.createdAt),
            });
          }
        });

        // Add recent teams
        teamsSnap.docs.slice(0, 5).forEach((doc) => {
          const data = doc.data();
          if (data.createdAt) {
            activities.push({
              id: doc.id,
              type: "team",
              title: "Uusi joukkue luotu",
              subtitle: data.name || "Nimetön joukkue",
              timestamp: data.createdAt?.toDate?.() || new Date(data.createdAt),
            });
          }
        });

        // Add recent events
        eventsSnap.docs.forEach((doc) => {
          const data = doc.data();
          if (data.createdAt) {
            activities.push({
              id: doc.id,
              type: "event",
              title: "Uusi tapahtuma luotu",
              subtitle: data.title || "Nimetön tapahtuma",
              timestamp: data.createdAt?.toDate?.() || new Date(data.createdAt),
            });
          }
        });

        // Sort by timestamp and take the 10 most recent
        activities.sort(
          (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
        );
        setRecentActivities(activities.slice(0, 10));
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
      title: "Joukkueet",
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
        {loading ? (
          <Typography variant="body2" color="text.secondary">
            Ladataan...
          </Typography>
        ) : recentActivities.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Ei vielä aktiviteetteja
          </Typography>
        ) : (
          <List>
            {recentActivities.map((activity) => {
              const getIcon = () => {
                switch (activity.type) {
                  case "user":
                    return <PersonAdd sx={{ color: "#1976d2" }} />;
                  case "team":
                    return <GroupAdd sx={{ color: "#2e7d32" }} />;
                  case "event":
                    return <EventIcon sx={{ color: "#ed6c02" }} />;
                }
              };

              const getTypeLabel = () => {
                switch (activity.type) {
                  case "user":
                    return "Käyttäjä";
                  case "team":
                    return "Joukkue";
                  case "event":
                    return "Tapahtuma";
                }
              };

              const formatTimestamp = (date: Date) => {
                const now = new Date();
                const diff = now.getTime() - date.getTime();
                const minutes = Math.floor(diff / 60000);
                const hours = Math.floor(diff / 3600000);
                const days = Math.floor(diff / 86400000);

                if (minutes < 1) return "Juuri nyt";
                if (minutes < 60) return `${minutes} min sitten`;
                if (hours < 24) return `${hours} h sitten`;
                if (days < 7) return `${days} pv sitten`;
                return date.toLocaleDateString("fi-FI", {
                  day: "numeric",
                  month: "numeric",
                  year: "numeric",
                });
              };

              return (
                <ListItem
                  key={activity.id}
                  sx={{
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    "&:last-child": { borderBottom: "none" },
                    gap: 2,
                  }}
                >
                  <Box
                    sx={{ display: "flex", alignItems: "center", minWidth: 40 }}
                  >
                    {getIcon()}
                  </Box>
                  <ListItemText
                    primary={
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <Typography variant="body1">
                          {activity.title}
                        </Typography>
                        <Chip
                          label={getTypeLabel()}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: "0.7rem",
                          }}
                        />
                      </Box>
                    }
                    secondary={activity.subtitle}
                  />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ minWidth: 100, textAlign: "right" }}
                  >
                    {formatTimestamp(activity.timestamp)}
                  </Typography>
                </ListItem>
              );
            })}
          </List>
        )}
      </Paper>
    </Box>
  );
}
