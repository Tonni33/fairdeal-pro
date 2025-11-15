import { useEffect, useState } from "react";
import {
  Typography,
  Box,
  Paper,
  Alert,
  TextField,
  Stack,
  Switch,
  FormControlLabel,
  Button,
  Divider,
} from "@mui/material";
import { Save } from "@mui/icons-material";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";

interface EventDefaults {
  defaultLocation: string;
  defaultTime: string;
  defaultTitle: string;
  eventDuration: number;
  maxGoalkeepers: number;
  maxPlayers: number;
  notificationEnabled: boolean;
  teamAName: string;
  teamBName: string;
  updatedAt?: string;
  updatedBy?: string;
}

interface GlobalSettings {
  defaultEventDuration: number;
  defaultMaxGoalkeepers: number;
  defaultMaxPlayers: number;
  emailNotifications: boolean;
  notificationsEnabled: boolean;
  reminderHours: number;
  smsNotifications: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export default function SettingsPage() {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [eventDefaults, setEventDefaults] = useState<EventDefaults>({
    defaultLocation: "",
    defaultTime: "19:00",
    defaultTitle: "Jäävuoro",
    eventDuration: 50,
    maxGoalkeepers: 2,
    maxPlayers: 20,
    notificationEnabled: true,
    teamAName: "Joukkue A",
    teamBName: "Joukkue B",
  });

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    defaultEventDuration: 50,
    defaultMaxGoalkeepers: 2,
    defaultMaxPlayers: 20,
    emailNotifications: false,
    notificationsEnabled: false,
    reminderHours: 24,
    smsNotifications: false,
  });

  const loadSettings = async () => {
    setLoading(true);
    try {
      // Load eventDefaults
      const eventDefaultsDoc = await getDoc(
        doc(db, "settings", "eventDefaults")
      );
      if (eventDefaultsDoc.exists()) {
        const data = eventDefaultsDoc.data();
        setEventDefaults({
          defaultLocation: data.defaultLocation || "",
          defaultTime: data.defaultTime || "19:00",
          defaultTitle: data.defaultTitle || "Jäävuoro",
          eventDuration: data.eventDuration || 50,
          maxGoalkeepers: data.maxGoalkeepers || 2,
          maxPlayers: data.maxPlayers || 20,
          notificationEnabled: data.notificationEnabled ?? true,
          teamAName: data.teamAName || "Joukkue A",
          teamBName: data.teamBName || "Joukkue B",
          updatedAt:
            data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
          updatedBy: data.updatedBy,
        });
      }

      // Load global settings
      const globalDoc = await getDoc(doc(db, "settings", "global"));
      if (globalDoc.exists()) {
        const data = globalDoc.data();
        setGlobalSettings({
          defaultEventDuration: data.defaultEventDuration || 50,
          defaultMaxGoalkeepers: data.defaultMaxGoalkeepers || 2,
          defaultMaxPlayers: data.defaultMaxPlayers || 20,
          emailNotifications: data.emailNotifications ?? false,
          notificationsEnabled: data.notificationsEnabled ?? false,
          reminderHours: data.reminderHours || 24,
          smsNotifications: data.smsNotifications ?? false,
          updatedAt:
            data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
          updatedBy: data.updatedBy,
        });
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      setError("Virhe asetusten lataamisessa");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
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
            Vain pääkäyttäjillä on oikeus hallita yleisiä asetuksia.
          </Typography>
        </Alert>
      </Box>
    );
  }

  const handleSaveEventDefaults = async () => {
    try {
      setError("");
      const eventDefaultsRef = doc(db, "settings", "eventDefaults");
      await updateDoc(eventDefaultsRef, {
        ...eventDefaults,
        updatedAt: new Date(),
        updatedBy: userData?.email || "",
      });

      setSuccess("Tapahtumaoletukset päivitetty onnistuneesti!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error updating event defaults:", err);
      setError("Virhe tapahtumaoletuksien päivittämisessä");
    }
  };

  const handleSaveGlobalSettings = async () => {
    try {
      setError("");
      const globalRef = doc(db, "settings", "global");
      await updateDoc(globalRef, {
        ...globalSettings,
        updatedAt: new Date(),
        updatedBy: userData?.email || "",
      });

      setSuccess("Yleiset asetukset päivitetty onnistuneesti!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error updating global settings:", err);
      setError("Virhe yleisten asetusten päivittämisessä");
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Ladataan asetuksia...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Yleiset asetukset
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      {/* Event Defaults Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Tapahtumaoletukset
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Nämä asetukset käytetään oletusarvoina uusille tapahtumille.
        </Typography>

        <Stack spacing={3}>
          <Typography variant="h6">Tapahtumatiedot</Typography>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Oletuspaikka"
              value={eventDefaults.defaultLocation}
              onChange={(e) =>
                setEventDefaults({
                  ...eventDefaults,
                  defaultLocation: e.target.value,
                })
              }
              fullWidth
            />
            <TextField
              label="Oletusaika"
              type="time"
              value={eventDefaults.defaultTime}
              onChange={(e) =>
                setEventDefaults({
                  ...eventDefaults,
                  defaultTime: e.target.value,
                })
              }
              fullWidth
            />
          </Stack>

          <Stack direction="row" spacing={2}>
            <TextField
              label="Oletusotsikko"
              value={eventDefaults.defaultTitle}
              onChange={(e) =>
                setEventDefaults({
                  ...eventDefaults,
                  defaultTitle: e.target.value,
                })
              }
              fullWidth
            />
            <TextField
              label="Tapahtuman kesto (min)"
              type="number"
              value={eventDefaults.eventDuration}
              onChange={(e) =>
                setEventDefaults({
                  ...eventDefaults,
                  eventDuration: parseInt(e.target.value) || 50,
                })
              }
              fullWidth
            />
          </Stack>

          <Typography variant="h6" sx={{ mt: 2 }}>
            Pelaaja-asetukset
          </Typography>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Max pelaajat"
              type="number"
              value={eventDefaults.maxPlayers}
              onChange={(e) =>
                setEventDefaults({
                  ...eventDefaults,
                  maxPlayers: parseInt(e.target.value) || 20,
                })
              }
              fullWidth
            />
            <TextField
              label="Max maalivahdit"
              type="number"
              value={eventDefaults.maxGoalkeepers}
              onChange={(e) =>
                setEventDefaults({
                  ...eventDefaults,
                  maxGoalkeepers: parseInt(e.target.value) || 2,
                })
              }
              fullWidth
            />
          </Stack>

          <Typography variant="h6" sx={{ mt: 2 }}>
            Joukkuenimet
          </Typography>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Joukkue A nimi"
              value={eventDefaults.teamAName}
              onChange={(e) =>
                setEventDefaults({
                  ...eventDefaults,
                  teamAName: e.target.value,
                })
              }
              fullWidth
            />
            <TextField
              label="Joukkue B nimi"
              value={eventDefaults.teamBName}
              onChange={(e) =>
                setEventDefaults({
                  ...eventDefaults,
                  teamBName: e.target.value,
                })
              }
              fullWidth
            />
          </Stack>

          <Typography variant="h6" sx={{ mt: 2 }}>
            Muut asetukset
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={eventDefaults.notificationEnabled}
                onChange={(e) =>
                  setEventDefaults({
                    ...eventDefaults,
                    notificationEnabled: e.target.checked,
                  })
                }
              />
            }
            label="Ilmoitukset käytössä"
          />

          <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
            <Button
              variant="contained"
              startIcon={<Save />}
              onClick={handleSaveEventDefaults}
            >
              Tallenna tapahtumaoletukset
            </Button>
          </Box>
        </Stack>
      </Paper>

      {/* Global Settings Section */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Järjestelmän yleiset asetukset
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Nämä asetukset vaikuttavat koko järjestelmän toimintaan.
        </Typography>

        <Stack spacing={3}>
          <Typography variant="h6">Oletusarvot</Typography>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Oletus tapahtuman kesto (min)"
              type="number"
              value={globalSettings.defaultEventDuration}
              onChange={(e) =>
                setGlobalSettings({
                  ...globalSettings,
                  defaultEventDuration: parseInt(e.target.value) || 50,
                })
              }
              fullWidth
            />
            <TextField
              label="Muistutus (tuntia ennen)"
              type="number"
              value={globalSettings.reminderHours}
              onChange={(e) =>
                setGlobalSettings({
                  ...globalSettings,
                  reminderHours: parseInt(e.target.value) || 24,
                })
              }
              fullWidth
            />
          </Stack>

          <Stack direction="row" spacing={2}>
            <TextField
              label="Oletus max pelaajat"
              type="number"
              value={globalSettings.defaultMaxPlayers}
              onChange={(e) =>
                setGlobalSettings({
                  ...globalSettings,
                  defaultMaxPlayers: parseInt(e.target.value) || 20,
                })
              }
              fullWidth
            />
            <TextField
              label="Oletus max maalivahdit"
              type="number"
              value={globalSettings.defaultMaxGoalkeepers}
              onChange={(e) =>
                setGlobalSettings({
                  ...globalSettings,
                  defaultMaxGoalkeepers: parseInt(e.target.value) || 2,
                })
              }
              fullWidth
            />
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Typography variant="h6">Ilmoitusasetukset</Typography>
          <FormControlLabel
            control={
              <Switch
                checked={globalSettings.notificationsEnabled}
                onChange={(e) =>
                  setGlobalSettings({
                    ...globalSettings,
                    notificationsEnabled: e.target.checked,
                  })
                }
              />
            }
            label="Ilmoitukset käytössä"
          />
          <FormControlLabel
            control={
              <Switch
                checked={globalSettings.emailNotifications}
                onChange={(e) =>
                  setGlobalSettings({
                    ...globalSettings,
                    emailNotifications: e.target.checked,
                  })
                }
              />
            }
            label="Sähköposti-ilmoitukset"
          />
          <FormControlLabel
            control={
              <Switch
                checked={globalSettings.smsNotifications}
                onChange={(e) =>
                  setGlobalSettings({
                    ...globalSettings,
                    smsNotifications: e.target.checked,
                  })
                }
              />
            }
            label="SMS-ilmoitukset"
          />

          <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
            <Button
              variant="contained"
              startIcon={<Save />}
              onClick={handleSaveGlobalSettings}
            >
              Tallenna yleiset asetukset
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
