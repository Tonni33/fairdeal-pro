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
