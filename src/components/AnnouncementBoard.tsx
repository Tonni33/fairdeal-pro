import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import * as Updates from "expo-updates";
import { db } from "../services/firebase";
import { Announcement, Team } from "../types";
import { JS_VERSION } from "../constants/jsVersion";

/**
 * Joukkueen ilmoitustaulu etusivulla. Joukkueen admin kirjoittaa ilmoituksia
 * (esim. pikkujoulut, kausimaksut), pelaajat lukevat. Uudesta ilmoituksesta
 * lähtee push-ilmoitus (functions: sendAnnouncementPush), jos pelaaja ei ole
 * kytkenyt niitä pois profiilistaan.
 */

type Props = {
  teams: Team[]; // käyttäjän joukkueet
  adminTeams: Team[]; // joukkueet, joissa käyttäjä on admin
  userId?: string;
  userName: string;
};

// Kuinka kauan ilmoitus näkyy: valmiit vaihtoehdot päivämäärävalitsimen sijaan
const VISIBILITY_OPTIONS: { label: string; days: number | null }[] = [
  { label: "Ei rajaa", days: null },
  { label: "1 vko", days: 7 },
  { label: "2 vko", days: 14 },
  { label: "1 kk", days: 30 },
  { label: "3 kk", days: 90 },
];

const PREVIEW_COUNT = 2;

const toDate = (value: any): Date | null =>
  value?.toDate ? value.toDate() : value ? new Date(value) : null;

const formatDate = (date: Date) =>
  `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;

const normalizeLink = (link: string) => {
  const trimmed = link.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

type FormState = {
  id?: string;
  teamId: string;
  title: string;
  body: string;
  link: string;
  pinned: boolean;
  visibleDays: number | null;
  keepVisibleUntil?: Date | null; // muokatessa säilytetään nykyinen raja
  sendPush: boolean;
};

export const AnnouncementBoard: React.FC<Props> = ({
  teams,
  adminTeams,
  userId,
  userName,
}) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [listVisible, setListVisible] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSeen, setLastSeen] = useState<number | null>(null);
  const [latest, setLatest] = useState<{
    appVersion?: string;
    jsVersion?: number;
  } | null>(null);
  const insets = useSafeAreaInsets();
  const topPadding = { paddingTop: insets.top + 12 };

  const teamIds = useMemo(() => teams.map((t) => t.id).slice(0, 30), [teams]);
  const teamIdKey = teamIds.join(",");
  const lastSeenKey = `announcements_last_seen_${userId || "anon"}`;
  const multipleTeams = teamIds.length > 1;
  const teamName = (teamId: string) =>
    teams.find((t) => t.id === teamId)?.name ||
    adminTeams.find((t) => t.id === teamId)?.name ||
    "";
  const isAdminOf = (teamId: string) =>
    adminTeams.some((team) => team.id === teamId);

  // Uusin julkaistu versio (scripts/publishUpdate.js kirjaa sen), jotta
  // käyttäjä voi verrata sitä omaansa
  useEffect(
    () =>
      onSnapshot(
        doc(db, "settings", "app"),
        (snapshot) => {
          const data = snapshot.data();
          setLatest({
            appVersion:
              typeof data?.latestRuntimeVersion === "string"
                ? data.latestRuntimeVersion
                : undefined,
            jsVersion:
              typeof data?.latestJsVersion === "number"
                ? data.latestJsVersion
                : undefined,
          });
        },
        (error) =>
          console.log("[Announcements] Versiotiedon luku epäonnistui:", error),
      ),
    [],
  );

  useEffect(() => {
    AsyncStorage.getItem(lastSeenKey)
      .then((value) => setLastSeen(value ? Number(value) : 0))
      .catch(() => setLastSeen(0));
  }, [lastSeenKey]);

  useEffect(() => {
    if (teamIds.length === 0) {
      setAnnouncements([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      query(collection(db, "announcements"), where("teamId", "in", teamIds)),
      (snapshot) => {
        const now = Date.now();
        const items = snapshot.docs
          .map((d) => {
            const data = d.data();
            return {
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
            } as Announcement;
          })
          .filter((a) => !a.visibleUntil || a.visibleUntil.getTime() > now)
          .sort(
            (a, b) =>
              Number(!!b.pinned) - Number(!!a.pinned) ||
              b.createdAt.getTime() - a.createdAt.getTime(),
          );
        setAnnouncements(items);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading announcements:", error);
        setLoading(false);
      },
    );
    return () => unsubscribe();
    // teamIdKey kattaa teamIds-listan sisällön
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamIdKey]);

  const isNew = (a: Announcement) =>
    lastSeen !== null &&
    a.createdById !== userId &&
    a.createdAt.getTime() > lastSeen;
  const newCount = announcements.filter(isNew).length;

  const openList = () => {
    setListVisible(true);
  };

  const closeList = () => {
    setListVisible(false);
    // Ilmoitukset on nähty, kun lista suljetaan: "Uusi"-merkinnät näkyvät
    // vielä listaa luettaessa
    const now = Date.now();
    setLastSeen(now);
    AsyncStorage.setItem(lastSeenKey, String(now)).catch(() => {});
  };

  const startCreate = () => {
    setForm({
      teamId:
        adminTeams.find((t) => teamIds.includes(t.id))?.id ||
        adminTeams[0]?.id ||
        "",
      title: "",
      body: "",
      link: "",
      pinned: false,
      visibleDays: null,
      sendPush: true,
    });
  };

  const startEdit = (a: Announcement) => {
    setForm({
      id: a.id,
      teamId: a.teamId,
      title: a.title,
      body: a.body,
      link: a.link || "",
      pinned: !!a.pinned,
      visibleDays: null,
      keepVisibleUntil: a.visibleUntil || null,
      sendPush: false,
    });
  };

  const saveForm = async () => {
    if (!form) return;
    if (!form.teamId) {
      Alert.alert("Virhe", "Valitse joukkue");
      return;
    }
    if (!form.title.trim() || !form.body.trim()) {
      Alert.alert("Virhe", "Otsikko ja teksti ovat pakollisia");
      return;
    }
    const visibleUntil =
      form.visibleDays !== null
        ? new Date(Date.now() + form.visibleDays * 24 * 60 * 60 * 1000)
        : form.id
          ? form.keepVisibleUntil || null
          : null;
    const data = {
      teamId: form.teamId,
      title: form.title.trim(),
      body: form.body.trim(),
      link: normalizeLink(form.link),
      pinned: form.pinned,
      visibleUntil,
    };

    setSaving(true);
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
          createdBy: userName,
          createdById: userId || "",
        });
      }
      setForm(null);
    } catch (error) {
      console.error("Error saving announcement:", error);
      Alert.alert("Virhe", "Ilmoituksen tallentaminen epäonnistui");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (a: Announcement) => {
    Alert.alert("Poista ilmoitus", `Poistetaanko "${a.title}"?`, [
      { text: "Peruuta", style: "cancel" },
      {
        text: "Poista",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "announcements", a.id));
          } catch (error) {
            console.error("Error deleting announcement:", error);
            Alert.alert("Virhe", "Ilmoituksen poistaminen epäonnistui");
          }
        },
      },
    ]);
  };

  const canCreate = adminTeams.length > 0;

  // Versiotiedot aina ilmoitustaulun alimpana: uusin julkaistu ja oma
  const ownAppVersion = Updates.runtimeVersion || "";
  const appBehind =
    !!latest?.appVersion &&
    !!ownAppVersion &&
    ownAppVersion.localeCompare(latest.appVersion, undefined, {
      numeric: true,
    }) < 0;
  const jsBehind =
    typeof latest?.jsVersion === "number" &&
    !appBehind &&
    JS_VERSION < latest.jsVersion;
  const versionFooter = latest?.appVersion ? (
    <View style={styles.versionFooter}>
      <Text style={styles.versionText}>
        Uusin: Sovellus {latest.appVersion}
        {typeof latest.jsVersion === "number"
          ? ` · JS ${latest.jsVersion}`
          : ""}
      </Text>
      <Text
        style={[
          styles.versionText,
          appBehind || jsBehind ? styles.versionBehind : styles.versionOk,
        ]}
      >
        Sinulla: Sovellus {ownAppVersion || "?"} · JS {JS_VERSION}
        {appBehind
          ? " – päivitä sovelluskaupasta"
          : jsBehind
            ? " – päivittyy seuraavalla avauksella"
            : " ✓"}
      </Text>
    </View>
  ) : null;

  const renderMeta = (a: Announcement) => (
    <Text style={styles.meta}>
      {multipleTeams ? `${teamName(a.teamId)} · ` : ""}
      {formatDate(a.createdAt)}
      {a.createdBy ? ` · ${a.createdBy}` : ""}
    </Text>
  );

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={openList}>
        <Ionicons name="megaphone-outline" size={20} color="#1976d2" />
        <Text style={styles.headerTitle}>Ilmoitustaulu</Text>
        {newCount > 0 && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>{newCount} uutta</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="small" color="#1976d2" />
      ) : announcements.length === 0 ? (
        <Text style={styles.empty}>Ei ilmoituksia</Text>
      ) : (
        announcements.slice(0, PREVIEW_COUNT).map((a) => (
          <TouchableOpacity
            key={a.id}
            style={styles.previewItem}
            onPress={openList}
          >
            <View style={styles.titleRow}>
              {a.pinned && <Ionicons name="pin" size={14} color="#ff9800" />}
              <Text style={styles.previewTitle} numberOfLines={1}>
                {a.title}
              </Text>
              {isNew(a) && <Text style={styles.newChip}>Uusi</Text>}
            </View>
            <Text style={styles.previewBody} numberOfLines={2}>
              {a.body}
            </Text>
          </TouchableOpacity>
        ))
      )}
      {!loading && announcements.length > PREVIEW_COUNT && (
        <TouchableOpacity onPress={openList}>
          <Text style={styles.showAll}>
            Näytä kaikki ({announcements.length})
          </Text>
        </TouchableOpacity>
      )}
      {canCreate && (
        <TouchableOpacity style={styles.addButton} onPress={startCreate}>
          <Ionicons name="add-circle-outline" size={18} color="#1976d2" />
          <Text style={styles.addButtonText}>Uusi ilmoitus</Text>
        </TouchableOpacity>
      )}
      {versionFooter}

      {/* Kaikki ilmoitukset */}
      <Modal
        visible={listVisible}
        animationType="slide"
        onRequestClose={closeList}
      >
        <View style={[styles.modalContainer, topPadding]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Ilmoitustaulu</Text>
            <TouchableOpacity onPress={closeList}>
              <Ionicons name="close" size={26} color="#333" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {announcements.length === 0 && (
              <Text style={styles.empty}>Ei ilmoituksia</Text>
            )}
            {announcements.map((a) => (
              <View key={a.id} style={styles.item}>
                <View style={styles.titleRow}>
                  {a.pinned && (
                    <Ionicons name="pin" size={16} color="#ff9800" />
                  )}
                  <Text style={styles.itemTitle}>{a.title}</Text>
                  {isNew(a) && <Text style={styles.newChip}>Uusi</Text>}
                </View>
                {renderMeta(a)}
                <Text style={styles.itemBody}>{a.body}</Text>
                {!!a.link && (
                  <TouchableOpacity
                    onPress={() =>
                      Linking.openURL(a.link!).catch(() =>
                        Alert.alert("Virhe", "Linkin avaaminen epäonnistui"),
                      )
                    }
                  >
                    <Text style={styles.link} numberOfLines={1}>
                      {a.link}
                    </Text>
                  </TouchableOpacity>
                )}
                {isAdminOf(a.teamId) && (
                  <View style={styles.itemActions}>
                    {a.visibleUntil && (
                      <Text style={styles.meta}>
                        Näkyy {formatDate(a.visibleUntil)} asti
                      </Text>
                    )}
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={() => startEdit(a)}>
                      <Text style={styles.actionText}>Muokkaa</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmDelete(a)}>
                      <Text style={[styles.actionText, styles.deleteText]}>
                        Poista
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
            {canCreate && (
              <TouchableOpacity style={styles.addButton} onPress={startCreate}>
                <Ionicons name="add-circle-outline" size={18} color="#1976d2" />
                <Text style={styles.addButtonText}>Uusi ilmoitus</Text>
              </TouchableOpacity>
            )}
            {versionFooter}
          </ScrollView>

          {/* Lomake listan päällä, jotta muokkaus onnistuu listasta */}
          {form && listVisible && renderForm()}
        </View>
      </Modal>

      {form && !listVisible && (
        <Modal
          visible
          animationType="slide"
          onRequestClose={() => setForm(null)}
        >
          <View style={[styles.modalContainer, topPadding]}>
            {renderForm()}
          </View>
        </Modal>
      )}
    </View>
  );

  function renderForm() {
    if (!form) return null;
    const formTeams = adminTeams;
    return (
      <KeyboardAvoidingView
        style={[styles.formOverlay, topPadding]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {form.id ? "Muokkaa ilmoitusta" : "Uusi ilmoitus"}
          </Text>
          <TouchableOpacity onPress={() => setForm(null)}>
            <Ionicons name="close" size={26} color="#333" />
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          {formTeams.length > 1 && !form.id && (
            <>
              <Text style={styles.label}>Joukkue</Text>
              <View style={styles.chips}>
                {formTeams.map((team) => (
                  <TouchableOpacity
                    key={team.id}
                    style={[
                      styles.chip,
                      form.teamId === team.id && styles.chipActive,
                    ]}
                    onPress={() => setForm({ ...form, teamId: team.id })}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        form.teamId === team.id && styles.chipTextActive,
                      ]}
                    >
                      {team.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>Otsikko</Text>
          <TextInput
            style={styles.input}
            value={form.title}
            onChangeText={(title) => setForm({ ...form, title })}
            placeholder="Esim. Pikkujoulut 12.12."
            placeholderTextColor="#999"
            maxLength={80}
          />

          <Text style={styles.label}>Teksti</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={form.body}
            onChangeText={(body) => setForm({ ...form, body })}
            placeholder="Mitä, missä, milloin…"
            placeholderTextColor="#999"
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.label}>Linkki (vapaaehtoinen)</Text>
          <TextInput
            style={styles.input}
            value={form.link}
            onChangeText={(link) => setForm({ ...form, link })}
            placeholder="esim. ilmoittautumislomake"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={styles.label}>
            Näkyy{" "}
            {form.id && form.visibleDays === null
              ? form.keepVisibleUntil
                ? `(nyt ${formatDate(form.keepVisibleUntil)} asti)`
                : "(nyt ilman rajaa)"
              : ""}
          </Text>
          <View style={styles.chips}>
            {VISIBILITY_OPTIONS.map((option) => {
              const active =
                form.visibleDays === option.days &&
                !(form.id && option.days === null && form.keepVisibleUntil);
              return (
                <TouchableOpacity
                  key={option.label}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() =>
                    setForm({
                      ...form,
                      visibleDays: option.days,
                      keepVisibleUntil:
                        option.days === null ? null : form.keepVisibleUntil,
                    })
                  }
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Kiinnitä ylimmäksi</Text>
            <Switch
              value={form.pinned}
              onValueChange={(pinned) => setForm({ ...form, pinned })}
            />
          </View>

          {!form.id && (
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                Lähetä push-ilmoitus pelaajille
              </Text>
              <Switch
                value={form.sendPush}
                onValueChange={(sendPush) => setForm({ ...form, sendPush })}
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.6 }]}
            onPress={saveForm}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>
                {form.id ? "Tallenna" : "Julkaise"}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "#333" },
  newBadge: {
    backgroundColor: "#d32f2f",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  newBadgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  empty: { color: "#888", fontSize: 14, paddingVertical: 4 },
  previewItem: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  previewTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#222",
    flexShrink: 1,
  },
  previewBody: { fontSize: 13, color: "#555", marginTop: 2 },
  newChip: {
    backgroundColor: "#ffebee",
    color: "#d32f2f",
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  showAll: { color: "#1976d2", fontSize: 14, marginTop: 6 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  addButtonText: { color: "#1976d2", fontSize: 14, fontWeight: "600" },
  modalContainer: { flex: 1, backgroundColor: "#f5f5f5" },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    backgroundColor: "#f5f5f5",
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#333" },
  modalContent: { padding: 16, paddingBottom: 48 },
  item: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  itemTitle: { fontSize: 16, fontWeight: "700", color: "#222", flexShrink: 1 },
  meta: { fontSize: 12, color: "#888", marginTop: 2 },
  itemBody: { fontSize: 15, color: "#333", marginTop: 8, lineHeight: 21 },
  link: { color: "#1976d2", marginTop: 8, textDecorationLine: "underline" },
  itemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 10,
  },
  actionText: { color: "#1976d2", fontWeight: "600" },
  deleteText: { color: "#d32f2f" },
  formOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#f5f5f5",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#222",
  },
  multiline: { minHeight: 140 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#1976d2",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#1976d2" },
  chipText: { color: "#1976d2", fontSize: 13 },
  chipTextActive: { color: "#fff" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
  },
  switchLabel: { fontSize: 15, color: "#333", flex: 1 },
  versionFooter: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  versionText: { fontSize: 12, color: "#888" },
  versionOk: { color: "#2e7d32" },
  versionBehind: { color: "#ef6c00", fontWeight: "600" },
  saveButton: {
    backgroundColor: "#1976d2",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

export default AnnouncementBoard;
