import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import UsersPage from "./pages/UsersPage";
import TeamsPage from "./pages/TeamsPage";
import RankingsPage from "./pages/RankingsPage";
import EventsPage from "./pages/EventsPage";
import ActivityPage from "./pages/ActivityPage";
import LicensesPage from "./pages/LicensesPage";
import LicenseRequestsPage from "./pages/LicenseRequestsPage";
import TeamSettingsPage from "./pages/TeamSettingsPage";
import SettingsPage from "./pages/SettingsPage";

const theme = createTheme({
  palette: {
    primary: {
      main: "#1976d2",
    },
    secondary: {
      main: "#dc004e",
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="teams" element={<TeamsPage />} />
              <Route path="rankings" element={<RankingsPage />} />
              <Route path="events" element={<EventsPage />} />
              <Route path="activity" element={<ActivityPage />} />
              <Route path="licenses" element={<LicensesPage />} />
              <Route
                path="license-requests"
                element={<LicenseRequestsPage />}
              />
              <Route path="team-settings" element={<TeamSettingsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
