const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Cloud Function to delete a user from both Firestore and Authentication
 * Callable from the mobile app with proper authentication
 */
exports.deleteUser = onCall(async (request) => {
  const data = request.data;
  const context = request.auth;

  // Debug logging
  console.log("deleteUser called with data:", JSON.stringify(data));
  console.log("context:", context ? "present" : "MISSING");

  if (context) {
    console.log("context.uid:", context.uid);
    console.log("context.token:", Object.keys(context.token || {}));
  }

  // Verify that the request is made by an authenticated user
  if (!context) {
    throw new HttpsError(
      "unauthenticated",
      "Käyttäjän tulee olla kirjautunut."
    );
  }

  const { userId } = data;
  const callerId = context.uid;

  if (!userId) {
    throw new HttpsError("invalid-argument", "Käyttäjän ID puuttuu.");
  }

  try {
    // Check if caller exists
    const callerDoc = await admin
      .firestore()
      .collection("users")
      .doc(callerId)
      .get();

    if (!callerDoc.exists) {
      throw new HttpsError("permission-denied", "Käyttäjätietoja ei löytynyt.");
    }

    const callerData = callerDoc.data();

    // Check if user is master admin
    const isMasterAdmin = callerData.masterAdmin === true;

    // Check if user is admin of any team by looking at teams collection
    const teamsSnapshot = await admin.firestore().collection("teams").get();
    let isTeamAdmin = false;

    for (const teamDoc of teamsSnapshot.docs) {
      const teamData = teamDoc.data();
      // Check both adminId and adminIds fields
      if (teamData.adminId === callerId) {
        isTeamAdmin = true;
        console.log(`User is admin (adminId) of team: ${teamDoc.id}`);
        break;
      }
      if (teamData.adminIds && teamData.adminIds.includes(callerId)) {
        isTeamAdmin = true;
        console.log(`User is admin (adminIds) of team: ${teamDoc.id}`);
        break;
      }
    }

    console.log("Admin check:", {
      callerId,
      callerName: callerData.name,
      isMasterAdmin,
      isTeamAdmin,
    });

    if (!isMasterAdmin && !isTeamAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Vain adminit voivat poistaa käyttäjiä."
      );
    }

    // Prevent self-deletion
    if (userId === callerId) {
      throw new HttpsError("invalid-argument", "Et voi poistaa omaa tiliäsi.");
    }

    // Get user data before deletion for logging
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .get();
    const userData = userDoc.exists ? userDoc.data() : null;

    console.log(`Admin ${callerId} deleting user ${userId}`, {
      userName: userData?.name,
      userEmail: userData?.email,
    });

    // Delete from Firestore
    if (userDoc.exists) {
      await admin.firestore().collection("users").doc(userId).delete();
      console.log(`✓ Deleted user ${userId} from Firestore`);
    }

    // Delete from Authentication
    try {
      await admin.auth().deleteUser(userId);
      console.log(`✓ Deleted user ${userId} from Authentication`);
    } catch (authError) {
      // If user doesn't exist in Auth, that's okay
      if (authError.code === "auth/user-not-found") {
        console.log(
          `User ${userId} not found in Authentication (already deleted)`
        );
      } else {
        throw authError;
      }
    }

    return {
      success: true,
      message: `Käyttäjä ${userData?.name || userId} poistettu onnistuneesti.`,
      deletedFrom: {
        firestore: userDoc.exists,
        authentication: true,
      },
    };
  } catch (error) {
    console.error("Error deleting user:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      `Käyttäjän poistaminen epäonnistui: ${error.message}`
    );
  }
});

/**
 * Cloud Function to delete a team and clean related references
 * - Verifies caller is master admin or admin of the team
 * - Deletes the team document
 * - Removes team references from users (teamIds, teamMember, teams)
 * - Deletes associated license document if present
 * - Deletes events that belong to the team
 * - Deletes license requests for the team
 */
exports.deleteTeam = onCall(async (request) => {
  const data = request.data;
  const context = request.auth;

  console.log("deleteTeam called with data:", JSON.stringify(data));
  console.log("context:", context ? "present" : "MISSING");

  if (!context) {
    throw new HttpsError(
      "unauthenticated",
      "Käyttäjän tulee olla kirjautunut."
    );
  }

  const { teamId } = data;
  const callerId = context.uid;

  if (!teamId) {
    throw new HttpsError("invalid-argument", "Joukkueen ID puuttuu.");
  }

  try {
    const db = admin.firestore();

    // Load caller user document
    const callerDoc = await db.collection("users").doc(callerId).get();
    if (!callerDoc.exists) {
      throw new HttpsError("permission-denied", "Käyttäjätietoja ei löytynyt.");
    }
    const callerData = callerDoc.data();
    const isMasterAdmin = callerData.masterAdmin === true;

    // Load team
    const teamRef = db.collection("teams").doc(teamId);
    const teamDoc = await teamRef.get();
    if (!teamDoc.exists) {
      throw new HttpsError("not-found", "Joukkuetta ei löytynyt.");
    }
    const teamData = teamDoc.data();

    const isTeamAdmin = Boolean(
      teamData.adminId === callerId ||
        (Array.isArray(teamData.adminIds) &&
          teamData.adminIds.includes(callerId))
    );

    console.log("deleteTeam permission check", {
      callerId,
      callerName: callerData.name,
      isMasterAdmin,
      isTeamAdmin,
    });

    if (!isMasterAdmin && !isTeamAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Vain joukkueen admin tai master admin voi poistaa joukkueen."
      );
    }

    const batch = db.batch();

    // Remove team references from users
    const usersSnapshot = await db
      .collection("users")
      .where("teamIds", "array-contains", teamId)
      .get();

    console.log("Users in team to clean:", usersSnapshot.size);

    usersSnapshot.forEach((userDoc) => {
      const userData = userDoc.data();
      const userRef = userDoc.ref;

      const teamIds = Array.isArray(userData.teamIds) ? userData.teamIds : [];
      const updatedTeamIds = teamIds.filter((id) => id !== teamId);

      const teamMember = userData.teamMember || {};
      if (
        teamMember &&
        Object.prototype.hasOwnProperty.call(teamMember, teamId)
      ) {
        delete teamMember[teamId];
      }

      const teams = Array.isArray(userData.teams) ? userData.teams : [];
      const updatedTeams = teams.filter((name) => name !== teamData.name);

      batch.update(userRef, {
        teamIds: updatedTeamIds,
        teamMember,
        teams: updatedTeams,
      });
    });

    // Delete events that belong to this team
    const eventsSnapshot = await db
      .collection("events")
      .where("teamId", "==", teamId)
      .get();

    console.log("Events to delete for team:", eventsSnapshot.size);

    eventsSnapshot.forEach((eventDoc) => {
      batch.delete(eventDoc.ref);
    });

    // Delete license requests for this team
    const licenseRequestsSnapshot = await db
      .collection("licenseRequests")
      .where("teamId", "==", teamId)
      .get();

    console.log(
      "License requests to delete for team:",
      licenseRequestsSnapshot.size
    );

    licenseRequestsSnapshot.forEach((reqDoc) => {
      batch.delete(reqDoc.ref);
    });

    // Delete associated license if present
    if (teamData.licenseId) {
      const licenseRef = db.collection("licenses").doc(teamData.licenseId);
      batch.delete(licenseRef);
      console.log("Will delete license", teamData.licenseId);
    }

    // Finally delete team document
    batch.delete(teamRef);

    await batch.commit();

    console.log("Team deleted successfully with cleaned user references", {
      teamId,
      teamName: teamData.name,
    });

    return {
      success: true,
      message: `Joukkue ${teamData.name || teamId} poistettu onnistuneesti.`,
    };
  } catch (error) {
    console.error("Error deleting team:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      `Joukkueen poistaminen epäonnistui: ${error.message}`
    );
  }
});

/**
 * Cloud Function to create user accounts with passwords
 * This allows admins to create users without logging out
 */
exports.createUserAccounts = onCall(async (request) => {
  const data = request.data;
  const context = request.auth;

  console.log("createUserAccounts called");

  // Verify authentication
  if (!context) {
    throw new HttpsError(
      "unauthenticated",
      "Käyttäjän tulee olla kirjautunut."
    );
  }

  const { users, commonPassword } = data;
  const callerId = context.uid;

  if (!users || !Array.isArray(users) || users.length === 0) {
    throw new HttpsError("invalid-argument", "Käyttäjälista puuttuu.");
  }

  if (!commonPassword || commonPassword.length < 6) {
    throw new HttpsError(
      "invalid-argument",
      "Salasanan tulee olla vähintään 6 merkkiä."
    );
  }

  try {
    // Verify caller is admin
    const callerDoc = await admin
      .firestore()
      .collection("users")
      .doc(callerId)
      .get();

    if (!callerDoc.exists) {
      throw new HttpsError("permission-denied", "Käyttäjätietoja ei löytynyt.");
    }

    const callerData = callerDoc.data();
    const isMasterAdmin = callerData.masterAdmin === true;

    // Check if user is team admin
    const teamsSnapshot = await admin.firestore().collection("teams").get();
    let isTeamAdmin = false;

    for (const teamDoc of teamsSnapshot.docs) {
      const teamData = teamDoc.data();
      if (
        teamData.adminId === callerId ||
        (teamData.adminIds && teamData.adminIds.includes(callerId))
      ) {
        isTeamAdmin = true;
        break;
      }
    }

    if (!isMasterAdmin && !isTeamAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Vain adminit voivat luoda käyttäjätilejä."
      );
    }

    // Create users
    const results = [];
    for (const user of users) {
      try {
        console.log(`Creating user: ${user.email}`);

        // Create Firebase Auth user
        const userRecord = await admin.auth().createUser({
          email: user.email,
          password: commonPassword,
          displayName: user.displayName,
        });

        console.log(`Auth user created: ${userRecord.uid}`);

        // Check if Firestore user document exists
        const existingUserDoc = await admin
          .firestore()
          .collection("users")
          .doc(user.id)
          .get();

        if (existingUserDoc.exists) {
          // Get existing user data
          const existingData = existingUserDoc.data();

          // Create new document with Auth UID (copy all existing data)
          await admin
            .firestore()
            .collection("users")
            .doc(userRecord.uid)
            .set({
              ...existingData,
              uid: userRecord.uid,
              needsPasswordChange: true,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedBy: callerData.email || "unknown",
            });
          console.log(`Created new user document with UID: ${userRecord.uid}`);

          // Update all references in events before deleting old document
          if (user.id !== userRecord.uid) {
            console.log(
              `Updating event references from ${user.id} to ${userRecord.uid}`
            );

            // Find all events that reference the old user ID
            const eventsSnapshot = await admin
              .firestore()
              .collection("events")
              .get();

            const batch = admin.firestore().batch();
            let eventsUpdated = 0;

            eventsSnapshot.docs.forEach((eventDoc) => {
              const eventData = eventDoc.data();
              let needsUpdate = false;
              const updates = {};

              // Update registeredPlayers array
              if (
                eventData.registeredPlayers &&
                Array.isArray(eventData.registeredPlayers)
              ) {
                const index = eventData.registeredPlayers.indexOf(user.id);
                if (index !== -1) {
                  const updatedPlayers = [...eventData.registeredPlayers];
                  updatedPlayers[index] = userRecord.uid;
                  updates.registeredPlayers = updatedPlayers;
                  needsUpdate = true;
                }
              }

              // Update reservePlayers array
              if (
                eventData.reservePlayers &&
                Array.isArray(eventData.reservePlayers)
              ) {
                const index = eventData.reservePlayers.indexOf(user.id);
                if (index !== -1) {
                  const updatedReserves = [...eventData.reservePlayers];
                  updatedReserves[index] = userRecord.uid;
                  updates.reservePlayers = updatedReserves;
                  needsUpdate = true;
                }
              }

              if (needsUpdate) {
                batch.update(eventDoc.ref, updates);
                eventsUpdated++;
              }
            });

            if (eventsUpdated > 0) {
              await batch.commit();
              console.log(`Updated ${eventsUpdated} events with new user ID`);
            }

            // Now delete the old document
            await admin.firestore().collection("users").doc(user.id).delete();
            console.log(`Deleted old user document: ${user.id}`);
          }
        } else {
          // Create new document
          await admin
            .firestore()
            .collection("users")
            .doc(userRecord.uid)
            .set({
              email: user.email,
              displayName: user.displayName,
              name: user.displayName,
              uid: userRecord.uid,
              isAdmin: false,
              playerId: user.id,
              category: 2,
              multiplier: 2.0,
              position: "H",
              teamIds: [],
              teams: [],
              phone: "",
              image: "",
              role: "user",
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              needsPasswordChange: true,
              createdBy: callerData.email || "unknown",
            });
          console.log(`Created new user document: ${userRecord.uid}`);
        }

        results.push({
          email: user.email,
          success: true,
        });
      } catch (error) {
        console.error(`Error creating user ${user.email}:`, error);
        results.push({
          email: user.email,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const errorCount = results.filter((r) => !r.success).length;

    return {
      success: true,
      successCount,
      errorCount,
      results,
    };
  } catch (error) {
    console.error("Error in createUserAccounts:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      `Käyttäjien luominen epäonnistui: ${error.message}`
    );
  }
});

/**
 * Get HC KeLo team member emails (for testing purposes)
 */
exports.getHCKeLoEmails = onCall(async (request) => {
  try {
    const db = admin.firestore();

    // Get HC KeLo team
    const teamsSnapshot = await db
      .collection("teams")
      .where("name", "==", "HC KeLo")
      .get();

    if (teamsSnapshot.empty) {
      return { emails: [], count: 0, message: "HC KeLo team not found" };
    }

    const teamId = teamsSnapshot.docs[0].id;

    // Get users
    const usersSnapshot = await db
      .collection("users")
      .where("teamIds", "array-contains", teamId)
      .get();

    const emails = [];
    usersSnapshot.forEach((doc) => {
      const user = doc.data();
      if (user.email) {
        emails.push(user.email);
      }
    });

    emails.sort();

    return {
      emails,
      count: emails.length,
      commaSeparated: emails.join(", "),
    };
  } catch (error) {
    console.error("Error:", error);
    throw new HttpsError("internal", error.message);
  }
});

// ============================================
// PUSH NOTIFICATIONS FOR ROSTER PROMOTIONS
// ============================================

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { Expo } = require("expo-server-sdk");

// Create a new Expo SDK client
const expo = new Expo();

/**
 * Cloud Function triggered when an event document is updated
 * Sends push notification to players who were promoted from reserve to roster
 */
exports.onEventUpdated = onDocumentUpdated(
  "events/{eventId}",
  async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const eventId = event.params.eventId;

    // Get players who were in reservePlayers before but are now in registeredPlayers
    const beforeReserve = beforeData?.reservePlayers || [];
    const afterReserve = afterData?.reservePlayers || [];
    const afterRegistered = afterData?.registeredPlayers || [];

    // Find players who were promoted (were in reserve, now in registered, no longer in reserve)
    const promotedPlayerIds = beforeReserve.filter(
      (playerId) =>
        afterRegistered.includes(playerId) && !afterReserve.includes(playerId)
    );

    if (promotedPlayerIds.length === 0) {
      return null; // No promotions happened
    }

    console.log(
      `[Push] Event ${eventId}: ${promotedPlayerIds.length} players promoted from reserve`
    );

    // Get event details for notification
    const eventTitle = afterData?.title || "Tapahtuma";
    const eventDate = afterData?.date?.toDate
      ? afterData.date.toDate()
      : new Date(afterData?.date);
    const teamId = afterData?.teamId;

    // Get team name
    let teamName = "Joukkue";
    if (teamId) {
      try {
        const teamDoc = await admin
          .firestore()
          .collection("teams")
          .doc(teamId)
          .get();
        if (teamDoc.exists) {
          teamName = teamDoc.data().name || teamName;
        }
      } catch (err) {
        console.error("[Push] Error getting team:", err);
      }
    }

    // Format date for notification
    const days = ["su", "ma", "ti", "ke", "to", "pe", "la"];
    const dayName = days[eventDate.getDay()];
    const dateStr = `${dayName} ${eventDate.getDate()}.${
      eventDate.getMonth() + 1
    }.`;
    const timeStr = eventDate.toLocaleTimeString("fi-FI", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Get push tokens for promoted players
    const messages = [];

    for (const playerId of promotedPlayerIds) {
      try {
        const userDoc = await admin
          .firestore()
          .collection("users")
          .doc(playerId)
          .get();

        if (!userDoc.exists) {
          console.log(`[Push] User ${playerId} not found`);
          continue;
        }

        const userData = userDoc.data();
        const pushToken = userData.pushToken;

        // Check if user has disabled roster promotion notifications
        if (userData.notificationSettings?.rosterPromotions === false) {
          console.log(
            `[Push] User ${playerId} has disabled roster promotion notifications`
          );
          continue;
        }

        if (!pushToken) {
          console.log(`[Push] User ${playerId} has no push token`);
          continue;
        }

        // Validate Expo push token
        if (!Expo.isExpoPushToken(pushToken)) {
          console.log(
            `[Push] Invalid push token for user ${playerId}: ${pushToken}`
          );
          continue;
        }

        console.log(
          `[Push] Sending notification to ${userData.name || playerId}`
        );

        messages.push({
          to: pushToken,
          sound: "default",
          title: "🎉 Pääsit mukaan!",
          body: `${eventTitle} (${teamName}) - ${dateStr} klo ${timeStr}`,
          data: {
            eventId: eventId,
            type: "roster-promotion",
            playerId: playerId,
          },
          channelId: "roster-updates",
        });
      } catch (err) {
        console.error(`[Push] Error processing player ${playerId}:`, err);
      }
    }

    if (messages.length === 0) {
      console.log("[Push] No valid push tokens found");
      return null;
    }

    // Send notifications in chunks (Expo recommends max 100 per request)
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        console.log(`[Push] Sent ${ticketChunk.length} notifications`);
      } catch (err) {
        console.error("[Push] Error sending notifications:", err);
      }
    }

    // Log any errors from tickets
    tickets.forEach((ticket, index) => {
      if (ticket.status === "error") {
        console.error(
          `[Push] Notification error for ${messages[index]?.to}:`,
          ticket.message
        );
      }
    });

    console.log(
      `[Push] Successfully processed ${tickets.length} notifications`
    );
    return { sent: tickets.length };
  }
);

// ============================================
// SCHEDULED 24H EVENT REMINDERS
// ============================================

const { onSchedule } = require("firebase-functions/v2/scheduler");

/**
 * Scheduled Cloud Function that runs every hour
 * Sends 24h reminder notifications for upcoming events
 */
exports.sendEventReminders = onSchedule(
  {
    schedule: "0 * * * *", // Run at the start of every hour
    timeZone: "Europe/Helsinki",
    retryCount: 3,
  },
  async (event) => {
    console.log("[Reminder] Starting 24h event reminder check...");

    const now = new Date();
    const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    console.log(
      `[Reminder] Looking for events between ${in23Hours.toISOString()} and ${in25Hours.toISOString()}`
    );

    try {
      // Get all events happening in approximately 24 hours (23-25h window)
      const eventsSnapshot = await admin
        .firestore()
        .collection("events")
        .where("date", ">=", in23Hours)
        .where("date", "<=", in25Hours)
        .get();

      if (eventsSnapshot.empty) {
        console.log("[Reminder] No events found in the 24h window");
        return null;
      }

      console.log(
        `[Reminder] Found ${eventsSnapshot.size} events to send reminders for`
      );

      const messages = [];
      const processedPlayers = new Set(); // Avoid duplicate notifications

      for (const eventDoc of eventsSnapshot.docs) {
        const eventData = eventDoc.data();
        const eventId = eventDoc.id;
        const eventTitle = eventData.title || "Tapahtuma";
        const teamId = eventData.teamId;
        const registeredPlayers = eventData.registeredPlayers || [];

        if (registeredPlayers.length === 0) {
          console.log(`[Reminder] Event ${eventId} has no registered players`);
          continue;
        }

        // Get team name
        let teamName = "Joukkue";
        if (teamId) {
          try {
            const teamDoc = await admin
              .firestore()
              .collection("teams")
              .doc(teamId)
              .get();
            if (teamDoc.exists) {
              teamName = teamDoc.data().name || teamName;
            }
          } catch (err) {
            console.error("[Reminder] Error getting team:", err);
          }
        }

        // Format time for notification
        const eventDate = eventData.date.toDate();
        const timeStr = eventDate.toLocaleTimeString("fi-FI", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Helsinki",
        });

        console.log(
          `[Reminder] Processing event: ${eventTitle} (${teamName}) - ${registeredPlayers.length} players`
        );

        // Get push tokens for all registered players
        for (const playerId of registeredPlayers) {
          // Skip if we already processed this player (could be in multiple events)
          const playerEventKey = `${playerId}-${eventId}`;
          if (processedPlayers.has(playerEventKey)) {
            continue;
          }
          processedPlayers.add(playerEventKey);

          try {
            const userDoc = await admin
              .firestore()
              .collection("users")
              .doc(playerId)
              .get();

            if (!userDoc.exists) {
              continue;
            }

            const userData = userDoc.data();
            const pushToken = userData.pushToken;

            // Check if user has disabled event reminder notifications
            if (userData.notificationSettings?.eventReminders === false) {
              console.log(
                `[Reminder] User ${playerId} has disabled event reminders`
              );
              continue;
            }

            if (!pushToken || !Expo.isExpoPushToken(pushToken)) {
              continue;
            }

            messages.push({
              to: pushToken,
              sound: "default",
              title: "📅 Tapahtuma huomenna!",
              body: `${eventTitle} (${teamName}) - klo ${timeStr}`,
              data: {
                eventId: eventId,
                type: "event-reminder",
                playerId: playerId,
              },
              channelId: "event-reminders",
            });
          } catch (err) {
            console.error(
              `[Reminder] Error processing player ${playerId}:`,
              err
            );
          }
        }
      }

      if (messages.length === 0) {
        console.log("[Reminder] No valid push tokens found");
        return null;
      }

      console.log(
        `[Reminder] Sending ${messages.length} reminder notifications`
      );

      // Send notifications in chunks
      const chunks = expo.chunkPushNotifications(messages);
      let totalSent = 0;

      for (const chunk of chunks) {
        try {
          const tickets = await expo.sendPushNotificationsAsync(chunk);
          totalSent += tickets.length;

          // Log any errors
          tickets.forEach((ticket, index) => {
            if (ticket.status === "error") {
              console.error(`[Reminder] Notification error:`, ticket.message);
            }
          });
        } catch (err) {
          console.error("[Reminder] Error sending notifications:", err);
        }
      }

      console.log(
        `[Reminder] Successfully sent ${totalSent} reminder notifications`
      );
      return { sent: totalSent };
    } catch (err) {
      console.error("[Reminder] Error in scheduled function:", err);
      throw err;
    }
  }
);

// ============================================
// AUTOMAATTINEN VARALTA-NOSTO (palvelinpuolella)
// ============================================
//
// Aiemmin varalta-nosto tehtiin jokaisen käyttäjän laitteella (HomeScreen,
// EventsScreen, web EventsPage). Siitä seurasi kaksi ongelmaa:
//   1) laskentatavat erosivat toisistaan (HomeScreen ei huomioinut
//      tapahtumakohtaista playerRoles-valintaa, jolloin MV+kenttä -pelaaja
//      laskettiin maalivahdiksi ja kenttäpaikkoja näytti olevan yksi liikaa),
//   2) sama nosto ajettiin rinnakkain monella laitteella ilman transaktiota.
//
// Nyt nosto tehdään yhdessä paikassa transaktion sisällä, jossa kokoonpano
// luetaan uudelleen juuri ennen kirjoitusta.

const DEFAULT_GUEST_REGISTRATION_HOURS = 24;
const FIELD_POSITIONS = ["H", "P", "H/P"];

/**
 * Pelaajan rooli tapahtumassa: tapahtumakohtainen valinta (playerRoles) menee
 * aina käyttäjän oletuspositioiden edelle. Sama logiikka kuin EventsScreenin
 * getFieldPlayers/getGoalkeepers-funktioissa.
 */
const isFieldPlayerInEvent = (userData, role) => {
  if (role) {
    return FIELD_POSITIONS.includes(role);
  }
  const positions = userData?.positions || [];
  return positions.some((pos) => FIELD_POSITIONS.includes(pos));
};

const isGoalkeeperInEvent = (userData, role) => {
  if (role) {
    return role === "MV";
  }
  const positions = userData?.positions || [];
  // Maalivahti vain jos pelaajalla ei ole lainkaan kenttäpelipaikkaa
  return (
    positions.includes("MV") &&
    !positions.some((pos) => FIELD_POSITIONS.includes(pos))
  );
};

/**
 * Nostaa varalla olevat kokoonpanoon jos tilaa on. Koko päättely tehdään
 * transaktiossa, joten rinnakkaiset kutsut eivät voi ylittää rajoja.
 *
 * @param {string} eventId
 * @returns {Promise<string[]|null>} nostettujen pelaajien id:t, tai null
 */
const promoteReservesForEvent = async (eventId) => {
  const db = admin.firestore();
  const eventRef = db.collection("events").doc(eventId);

  return db.runTransaction(async (t) => {
    const eventSnap = await t.get(eventRef);
    if (!eventSnap.exists) {
      return null;
    }

    const eventData = eventSnap.data();
    const reserves = eventData.reservePlayers || [];
    if (reserves.length === 0) {
      return null;
    }

    // Mennyt tapahtuma jätetään rauhaan
    const eventDate = eventData.date?.toDate
      ? eventData.date.toDate()
      : new Date(eventData.date);
    if (isNaN(eventDate.getTime())) {
      console.log(`[Promo] Event ${eventId}: invalid date, skipping`);
      return null;
    }
    const hoursUntilEvent = (eventDate.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilEvent < 0) {
      return null;
    }

    // Ennen thresholdia vakiokävijöillä on etuoikeus eikä varalta nosteta
    let guestRegistrationHours = DEFAULT_GUEST_REGISTRATION_HOURS;
    if (eventData.teamId) {
      const teamSnap = await t.get(
        db.collection("teams").doc(eventData.teamId)
      );
      if (teamSnap.exists) {
        guestRegistrationHours =
          teamSnap.data().guestRegistrationHours ||
          DEFAULT_GUEST_REGISTRATION_HOURS;
      }
    }
    if (hoursUntilEvent > guestRegistrationHours) {
      return null;
    }

    const registered = eventData.registeredPlayers || [];
    const playerRoles = eventData.playerRoles || {};
    const maxPlayers =
      typeof eventData.maxPlayers === "number" ? eventData.maxPlayers : Infinity;
    const maxGoalkeepers =
      typeof eventData.maxGoalkeepers === "number"
        ? eventData.maxGoalkeepers
        : Infinity;

    // Käyttäjätiedot yhdellä lukukierroksella (transaktion luvut ennen kirjoituksia)
    const allIds = [...new Set([...registered, ...reserves])];
    const userSnaps = allIds.length
      ? await t.getAll(...allIds.map((id) => db.collection("users").doc(id)))
      : [];
    const usersById = {};
    userSnaps.forEach((snap) => {
      if (snap.exists) {
        usersById[snap.id] = snap.data();
      }
    });

    // Nykyinen kokoonpano. Tuntematon id lasketaan kenttäpelaajaksi, jotta
    // puuttuva käyttäjädokumentti ei vahingossa avaa ylimääräistä paikkaa.
    let fieldCount = 0;
    let goalkeeperCount = 0;
    for (const id of registered) {
      const userData = usersById[id];
      if (userData && isGoalkeeperInEvent(userData, playerRoles[id])) {
        goalkeeperCount += 1;
      } else {
        fieldCount += 1;
      }
    }

    const promoted = [];
    const remainingReserves = [];

    for (const id of reserves) {
      // Jo kokoonpanossa oleva siivotaan pois varalistalta
      if (registered.includes(id) || promoted.includes(id)) {
        continue;
      }

      const userData = usersById[id];
      if (!userData) {
        console.log(`[Promo] Event ${eventId}: no user doc for ${id}, skipping`);
        remainingReserves.push(id);
        continue;
      }

      const isGoalkeeper = isGoalkeeperInEvent(userData, playerRoles[id]);
      const isFull = isGoalkeeper
        ? goalkeeperCount >= maxGoalkeepers
        : fieldCount >= maxPlayers;

      if (isFull) {
        remainingReserves.push(id);
        continue;
      }

      promoted.push(id);
      if (isGoalkeeper) {
        goalkeeperCount += 1;
      } else {
        fieldCount += 1;
      }
    }

    const reservesChanged = remainingReserves.length !== reserves.length;
    if (promoted.length === 0 && !reservesChanged) {
      return null;
    }

    t.update(eventRef, {
      registeredPlayers: [...registered, ...promoted],
      reservePlayers: remainingReserves,
    });

    console.log(
      `[Promo] Event ${eventId}: promoted ${promoted.length} (${promoted.join(
        ", "
      )}), kenttä ${fieldCount}/${maxPlayers}, MV ${goalkeeperCount}/${maxGoalkeepers}`
    );

    return promoted;
  });
};

/**
 * Ajetaan aina kun tapahtuman ilmoittautuneet tai varalla olevat muuttuvat:
 * joku ilmoittautuu varalle, joku peruu paikkansa, admin muokkaa listoja.
 *
 * Ei jää silmukkaan: oma kirjoitus laukaisee funktion uudelleen, mutta
 * seuraavalla kierroksella tilaa ei enää ole eikä kirjoitusta tapahdu.
 */
exports.promoteReservesOnEventUpdate = onDocumentUpdated(
  "events/{eventId}",
  async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const eventId = event.params.eventId;

    const beforeReserve = (beforeData?.reservePlayers || []).join(",");
    const afterReserve = (afterData?.reservePlayers || []).join(",");
    const beforeRegistered = (beforeData?.registeredPlayers || []).join(",");
    const afterRegistered = (afterData?.registeredPlayers || []).join(",");

    if (
      beforeReserve === afterReserve &&
      beforeRegistered === afterRegistered
    ) {
      return null; // Muutos ei koskenut kokoonpanoa
    }

    if ((afterData?.reservePlayers || []).length === 0) {
      return null;
    }

    try {
      const promoted = await promoteReservesForEvent(eventId);
      return promoted ? { promoted: promoted.length } : null;
    } catch (err) {
      console.error(`[Promo] Event ${eventId}: promotion failed:`, err);
      throw err;
    }
  }
);

/**
 * Varmistus kerran tunnissa: nostaa varalla olevat myös silloin kun kukaan ei
 * kirjoita tapahtumaan mitään (esim. threshold ylittyy yöllä).
 */
exports.promoteReservesScheduled = onSchedule(
  {
    schedule: "5 * * * *", // 5 min yli tasatunnin, ei samaan aikaan muistutusten kanssa
    timeZone: "Europe/Helsinki",
    retryCount: 3,
  },
  async () => {
    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const eventsSnapshot = await admin
      .firestore()
      .collection("events")
      .where("date", ">=", now)
      .where("date", "<=", horizon)
      .get();

    let totalPromoted = 0;

    for (const eventDoc of eventsSnapshot.docs) {
      const reserves = eventDoc.data().reservePlayers || [];
      if (reserves.length === 0) {
        continue;
      }
      try {
        const promoted = await promoteReservesForEvent(eventDoc.id);
        if (promoted) {
          totalPromoted += promoted.length;
        }
      } catch (err) {
        console.error(`[Promo] Event ${eventDoc.id}: promotion failed:`, err);
      }
    }

    console.log(`[Promo] Scheduled run promoted ${totalPromoted} players`);
    return { promoted: totalPromoted };
  }
);
