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

          // Delete old document if it has a different ID
          if (user.id !== userRecord.uid) {
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
