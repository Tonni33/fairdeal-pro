const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Cloud Function to delete a user from both Firestore and Authentication
 * Callable from the mobile app with proper authentication
 */
exports.deleteUser = functions.https.onCall(async (data, context) => {
  // Verify that the request is made by an authenticated user
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Käyttäjän tulee olla kirjautunut."
    );
  }

  const { userId } = data;
  const callerId = context.auth.uid;

  if (!userId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Käyttäjän ID puuttuu."
    );
  }

  try {
    // Check if caller is an admin
    const callerDoc = await admin
      .firestore()
      .collection("users")
      .doc(callerId)
      .get();

    if (!callerDoc.exists) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Käyttäjätietoja ei löytynyt."
      );
    }

    const callerData = callerDoc.data();

    // Check if user is master admin OR admin of any team
    const isMasterAdmin = callerData.masterAdmin === true;
    const isTeamAdmin =
      callerData.admin &&
      Object.values(callerData.admin).some((val) => val === true);

    if (!isMasterAdmin && !isTeamAdmin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Vain adminit voivat poistaa käyttäjiä."
      );
    }

    // Prevent self-deletion
    if (userId === callerId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Et voi poistaa omaa tiliäsi."
      );
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

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      `Käyttäjän poistaminen epäonnistui: ${error.message}`
    );
  }
});
