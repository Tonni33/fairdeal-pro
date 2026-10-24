import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Delete, Edit, PushPin } from "@mui/icons-material";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import type { Announcement, Team } from "../types";

// Joukkueen ilmoitustaulu: admin kirjoittaa ilmoituksia (esim. pikkujoulut,
// kausimaksut), pelaajat näkevät ne sovelluksen etusivulla. Uudesta
// ilmoituksesta lähtee push-ilmoitus (functions: sendAnnouncementPush).

type FormState = {
  id?: string;
  teamId: string;
  title: string;
  body: string;
  link: string;
  pinned: boolean;
  visibleUntil: string; // yyyy-mm-dd tai tyhjä
  sendPush: boolean;
};

const emptyForm = (teamId: string): FormState => ({
  teamId,
  title: "",
  body: "",
  link: "",
  pinned: false,
  visibleUntil: "",
  sendPush: true,
});

const toDate = (value: unknown): Date | null => {
  const v = value as { toDate?: () => Date } | string | null | undefined;
  if (!v) return null;
  if (typeof v === "object" && v.toDate) return v.toDate();
  const parsed = new Date(v as string);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const toInputDate = (date: Date | null | undefined) =>
  date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    : "";

const formatDate = (date: Date) =>
  `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;

const normalizeLink = (link: string) => {
  const trimmed = link.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const AnnouncementsPage = () => {
  const { user: authUser, userData } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [teamFilter, setTeamFilter] = useState("all");
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Joukkueet, joissa käyttäjä on admin (master admin: kaikki)
  const adminTeams = useMemo(
    () =>
      teams.filter(
        (team) =>
          userData?.isMasterAdmin ||
          team.adminIds?.includes(authUser?.uid || "") ||
          team.adminId === authUser?.uid,
      ),
    [teams, userData?.isMasterAdmin, authUser?.uid],
  );
  const teamName = (teamId: string) =>
    teams.find((t) => t.id === teamId)?.name || teamId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const teamSnap = await getDocs(collection(db, "teams"));
      const loadedTeams = teamSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Team,
      );
      setTeams(loadedTeams);
      const ids = loadedTeams
        .filter(
          (team) =>
            userData?.isMasterAdmin ||
            team.adminIds?.includes(authUser?.uid || "") ||
            team.adminId === authUser?.uid,
        )
        .map((team) => team.id);

      const items: Announcement[] = [];
      // Firestoren in-ehto ottaa enintään 30 arvoa kerrallaan
      for (let i = 0; i < ids.length; i += 30) {
        const snap = await getDocs(
          query(
            collection(db, "announcements"),
            where("teamId", "in", ids.slice(i, i + 30)),
          ),
        );
        snap.docs.forEach((d) => {
          const data = d.data();
          items.push({
            id: d.id,
            teamId: data.teamId,
            title: data.title || "",
            body: data.body || "",
            link: data.link || "",
            pinned: data.pinned === true,
            visibleUntil: toDate(data.visibleUntil),
            createdAt: toDate(data.createdAt) || new Date(0),
            createdBy: data.createdBy || "",
            createdById: data.createdById,
          });
        });
      }
      items.sort(
        (a, b) =>
          Number(!!b.pinned) - Number(!!a.pinned) ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );
      setAnnouncements(items);
    } catch (err) {
      console.error("Error loading announcements:", err);
      setError("Ilmoitusten lataaminen epäonnistui");
    } finally {
      setLoading(false);
    }
  }, [authUser?.uid, userData?.isMasterAdmin]);

  useEffect(() => {
    if (authUser) load();
  }, [authUser, load]);

  const visible = announcements.filter(
    (a) => teamFilter === "all" || a.teamId === teamFilter,
  );
  const isExpired = (a: Announcement) =>
    !!a.visibleUntil && a.visibleUntil.getTime() <= Date.now();

  const save = async () => {
    if (!form) return;
    if (!form.teamId || !form.title.trim() || !form.body.trim()) {
      setError("Joukkue, otsikko ja teksti ovat pakollisia");
      return;
    }
    setError("");
    setSaving(true);
    // Päivämäärän loppuun asti: näkyy vielä valittuna päivänä
    const visibleUntil = form.visibleUntil
      ? new Date(`${form.visibleUntil}T23:59:59`)
      : null;
    const data = {
      teamId: form.teamId,
      title: form.title.trim(),
      body: form.body.trim(),
      link: normalizeLink(form.link),
      pinned: form.pinned,
      visibleUntil,
    };
    try {
      if (form.id) {
        await updateDoc(doc(db, "announcements", form.id), {
          ...data,
          updatedAt: new Date(),
        });
      } else {
        await addDoc(collection(db, "announcements"), {
          ...data,
          sendPush: form.sendPush,
          createdAt: new Date(),
          createdBy: userData?.name?.trim() || "Admin",
          createdById: authUser?.uid || "",
        });
      }
      setForm(null);
      await load();
    } catch (err) {
      console.error("Error saving announcement:", err);
      setError("Ilmoituksen tallentaminen epäonnistui");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: Announcement) => {
    if (!window.confirm(`Poistetaanko ilmoitus "${a.title}"?`)) return;
    try {
      await deleteDoc(doc(db, "announcements", a.id));
      await load();
    } catch (err) {
      console.error("Error deleting announcement:", err);
      setError("Ilmoituksen poistaminen epäonnistui");
    }
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          mb: 3,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="h4" sx={{ flex: 1 }}>
          Ilmoitustaulu
        </Typography>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Joukkue</InputLabel>
          <Select
            label="Joukkue"
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
          >
            <MenuItem value="all">Kaikki joukkueet</MenuItem>
            {adminTeams.map((team) => (
              <MenuItem key={team.id} value={team.id}>
                {team.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="contained"
          startIcon={<Add />}
          disabled={adminTeams.length === 0}
          onClick={() =>
            setForm(
              emptyForm(
                teamFilter !== "all" ? teamFilter : adminTeams[0]?.id || "",
              ),
            )
          }
        >
          Uusi ilmoitus
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Ilmoitukset näkyvät joukkueen pelaajille sovelluksen etusivulla. Uudesta
        ilmoituksesta lähtee push-ilmoitus pelaajille, jotka eivät ole kytkeneet
        niitä pois profiilistaan.
      </Typography>

      {error && !form && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {!loading && visible.length === 0 && (
        <Typography color="text.secondary">Ei ilmoituksia</Typography>
      )}

      {visible.map((a) => (
        <Paper
          key={a.id}
          sx={{
            p: 2,
            mb: 2,
            opacity: isExpired(a) ? 0.55 : 1,
            bgcolor: isExpired(a) ? "grey.100" : "background.paper",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {a.pinned && <PushPin fontSize="small" color="warning" />}
            <Typography variant="h6" sx={{ flex: 1 }}>
              {a.title}
            </Typography>
            {isExpired(a) && <Chip label="Vanhentunut" size="small" />}
            <IconButton
              onClick={() =>
                setForm({
                  id: a.id,
                  teamId: a.teamId,
                  title: a.title,
                  body: a.body,
                  link: a.link || "",
                  pinned: !!a.pinned,
                  visibleUntil: toInputDate(a.visibleUntil),
                  sendPush: false,
                })
              }
            >
              <Edit />
            </IconButton>
            <IconButton color="error" onClick={() => remove(a)}>
              <Delete />
            </IconButton>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {teamName(a.teamId)} · {formatDate(a.createdAt)}
            {a.createdBy ? ` · ${a.createdBy}` : ""}
            {a.visibleUntil
              ? ` · näkyy ${formatDate(a.visibleUntil)} asti`
              : ""}
          </Typography>
          <Typography sx={{ whiteSpace: "pre-wrap", mt: 1 }}>
            {a.body}
          </Typography>
          {a.link && (
            <Link
              href={a.link}
              target="_blank"
              rel="noopener"
              sx={{ display: "block", mt: 1 }}
            >
              {a.link}
            </Link>
          )}
        </Paper>
      ))}

      <Dialog
        open={!!form}
        onClose={() => setForm(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {form?.id ? "Muokkaa ilmoitusta" : "Uusi ilmoitus"}
        </DialogTitle>
        {form && (
          <DialogContent
            sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
          >
            {error && <Alert severity="error">{error}</Alert>}
            <FormControl fullWidth sx={{ mt: 1 }} disabled={!!form.id}>
              <InputLabel>Joukkue</InputLabel>
              <Select
                label="Joukkue"
                value={form.teamId}
                onChange={(e) => setForm({ ...form, teamId: e.target.value })}
              >
                {adminTeams.map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Otsikko"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              inputProps={{ maxLength: 80 }}
              placeholder="Esim. Pikkujoulut 12.12."
            />
            <TextField
              label="Teksti"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              multiline
              minRows={6}
            />
            <TextField
              label="Linkki (vapaaehtoinen)"
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              placeholder="esim. ilmoittautumislomake"
            />
            <TextField
              label="Näkyy asti (tyhjä = ei rajaa)"
              type="date"
              value={form.visibleUntil}
              onChange={(e) =>
                setForm({ ...form, visibleUntil: e.target.value })
              }
              InputLabelProps={{ shrink: true }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.pinned}
                  onChange={(e) =>
                    setForm({ ...form, pinned: e.target.checked })
                  }
                />
              }
              label="Kiinnitä ylimmäksi"
            />
            {!form.id && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.sendPush}
                    onChange={(e) =>
                      setForm({ ...form, sendPush: e.target.checked })
                    }
                  />
                }
                label="Lähetä push-ilmoitus pelaajille"
              />
            )}
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setForm(null)}>Peruuta</Button>
          <Button variant="contained" onClick={save} disabled={saving}>
            {form?.id ? "Tallenna" : "Julkaise"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AnnouncementsPage;
