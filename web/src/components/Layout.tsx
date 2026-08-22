import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  AppBar,
  Box,
  Toolbar,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Alert,
  Button,
} from "@mui/material";
import {
  AccountCircle,
  People,
  Group,
  CardMembership,
  Dashboard,
  RequestPage,
  Settings,
  SettingsApplications,
  Event,
  EmojiEvents,
  Timeline,
  Psychology,
} from "@mui/icons-material";
import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
} from "firebase/firestore";
import { db } from "../services/firebase";

const drawerWidth = 240;

export default function Layout() {
  const { userData, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  // Uusimmat versiot, jotka käyttäjien laitteet ovat raportoineet. Tämä ei
  // ole EAS:n totuus vaan havainto: uusin julkaisu näkyy tässä vasta kun
  // ensimmäinen laite on ottanut sen käyttöön.
  const [latestSeen, setLatestSeen] = useState<{
    appVersion?: string;
    jsAt?: Date;
  }>({});
  const [hasPendingRequests, setHasPendingRequests] = useState(false);

  // Listen to pending license requests
  useEffect(() => {
    if (!userData?.isMasterAdmin) return;

    const q = query(
      collection(db, "licenseRequests"),
      where("status", "==", "pending"),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHasPendingRequests(!snapshot.empty);
    });

    return () => unsubscribe();
  }, [userData?.isMasterAdmin]);

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
    handleClose();
  };

  const menuItems = [
    {
      text: "Dashboard",
      icon: <Dashboard />,
      path: "/",
      masterAdminOnly: false,
    },
    {
      text: "Käyttäjät",
      icon: <People />,
      path: "/users",
      masterAdminOnly: false,
    },
    {
      text: "Joukkueet",
      icon: <Group />,
      path: "/teams",
      masterAdminOnly: false,
    },
    {
      text: "Ranking",
      icon: <EmojiEvents />,
      path: "/rankings",
      masterAdminOnly: false,
    },
    {
      text: "Tapahtumat",
      icon: <Event />,
      path: "/events",
      masterAdminOnly: false,
    },
    {
      text: "Aktiivisuus",
      icon: <Timeline />,
      path: "/activity",
      masterAdminOnly: false,
    },
    {
      text: "Lisenssit",
      icon: <CardMembership />,
      path: "/licenses",
      masterAdminOnly: true,
    },
    {
      text: "LisenssiPyynnöt",
      icon: <RequestPage />,
      path: "/license-requests",
      masterAdminOnly: true,
    },
    {
      text: "JoukkueAsetukset",
      icon: <Settings />,
      path: "/team-settings",
      masterAdminOnly: true,
    },
    {
      text: "Asetukset",
      icon: <SettingsApplications />,
      path: "/settings",
      masterAdminOnly: true,
    },
    {
      text: "TeamBalancer Test",
      icon: <Psychology />,
      path: "/team-balancer-test",
      masterAdminOnly: true,
    },
  ];

  // Admin check - only admins can access the web admin panel
  useEffect(() => {
    if (!userData?.isAdmin) return;
    const loadLatestVersions = async () => {
      try {
        const snapshot = await getDocs(collection(db, "users"));
        let appVersion: string | undefined;
        let newestJs = 0;
        snapshot.forEach((docSnap) => {
          const info = (
            docSnap.data() as {
              appInfo?: {
                runtimeVersion?: string;
                updateCreatedAt?: { toDate?: () => Date };
              };
            }
          ).appInfo;
          if (!info) return;
          if (
            info.runtimeVersion &&
            (!appVersion ||
              info.runtimeVersion.localeCompare(appVersion, undefined, {
                numeric: true,
              }) > 0)
          ) {
            appVersion = info.runtimeVersion;
          }
          const time = info.updateCreatedAt?.toDate?.()?.getTime() ?? 0;
          if (time > newestJs) newestJs = time;
        });
        setLatestSeen({
          appVersion,
          jsAt: newestJs ? new Date(newestJs) : undefined,
        });
      } catch (error) {
        console.log("Versiotietojen luku epäonnistui:", error);
      }
    };
    loadLatestVersions();
  }, [userData?.isAdmin]);

  if (!userData?.isAdmin) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          bgcolor: "#f5f5f5",
          p: 3,
        }}
      >
        <Box sx={{ maxWidth: 500, width: "100%" }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Ei käyttöoikeutta
            </Typography>
            <Typography variant="body2">
              Tämä hallintapaneeli on tarkoitettu vain järjestelmän
              pääkäyttäjille. Sinulla ei ole admin-oikeuksia.
            </Typography>
          </Alert>
          <Button variant="contained" fullWidth onClick={handleSignOut}>
            Kirjaudu ulos
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <AppBar
        position="fixed"
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
      >
        <Toolbar>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            FairDealPro - Admin
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            {(latestSeen.appVersion || latestSeen.jsAt) && (
              <Typography
                variant="body2"
                title="Uusin versio, jonka jokin käyttäjän laite on raportoinut"
                sx={{ opacity: 0.85, display: { xs: "none", md: "block" } }}
              >
                {latestSeen.appVersion
                  ? `Sovellus ${latestSeen.appVersion}`
                  : ""}
                {latestSeen.jsAt
                  ? ` · JS ${latestSeen.jsAt.toLocaleDateString("fi-FI", {
                      day: "numeric",
                      month: "numeric",
                    })} klo ${latestSeen.jsAt.toLocaleTimeString("fi-FI", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : ""}
              </Typography>
            )}
            <Typography variant="body2">{userData?.email}</Typography>
            <IconButton
              size="large"
              aria-label="account of current user"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={handleMenu}
              color="inherit"
            >
              <AccountCircle />
            </IconButton>
            <Menu
              id="menu-appbar"
              anchorEl={anchorEl}
              anchorOrigin={{
                vertical: "top",
                horizontal: "right",
              }}
              keepMounted
              transformOrigin={{
                vertical: "top",
                horizontal: "right",
              }}
              open={Boolean(anchorEl)}
              onClose={handleClose}
            >
              <MenuItem onClick={handleSignOut}>Kirjaudu ulos</MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: "border-box",
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: "auto" }}>
          <List>
            {menuItems
              .filter(
                (item) => !item.masterAdminOnly || userData?.isMasterAdmin,
              )
              .map((item) => (
                <ListItem key={item.text} disablePadding>
                  <ListItemButton
                    selected={location.pathname === item.path}
                    onClick={() => navigate(item.path)}
                    sx={{
                      ...(item.path === "/license-requests" &&
                        hasPendingRequests && {
                          bgcolor: "warning.light",
                          "&:hover": {
                            bgcolor: "warning.main",
                          },
                          "&.Mui-selected": {
                            bgcolor: "warning.main",
                            "&:hover": {
                              bgcolor: "warning.dark",
                            },
                          },
                        }),
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        ...(item.path === "/license-requests" &&
                          hasPendingRequests && {
                            color: "warning.contrastText",
                          }),
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.text}
                      sx={{
                        ...(item.path === "/license-requests" &&
                          hasPendingRequests && {
                            color: "warning.contrastText",
                          }),
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
          </List>
          <Divider />
        </Box>
      </Drawer>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          mt: 8,
          bgcolor: "#f5f5f5",
          overflowY: "auto",
          height: "calc(100vh - 64px)",
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
