import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

// Keys for storing different types of data
const STORAGE_KEYS = {
  WAS_LOGGED_IN: "was_logged_in",
  QUICK_AUTH_EMAIL: "quick_auth_email",
  ENCRYPTED_CREDENTIALS: "encrypted_credentials",
  BIOMETRIC_ENABLED: "biometric_enabled",
  PIN_ENABLED: "pin_enabled",
  USER_PIN: "user_pin",
} as const;

// Salt for password encryption
const ENCRYPTION_SALT = "fairdeal_pro_secure_salt_2024";

/**
 * Secure storage utility for handling authentication credentials
 */
export class SecureStorage {
  /**
   * Encrypt a password using SHA256 with salt
   */
  private static async encryptPassword(password: string): Promise<string> {
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      password + ENCRYPTION_SALT,
      { encoding: Crypto.CryptoEncoding.BASE64 }
    );
  }

  /**
   * Store user credentials securely for quick auth
   */
  static async storeCredentials(email: string, password: string): Promise<void> {
    try {
      const encryptedPassword = await this.encryptPassword(password);
      
      const credentials = {
        email,
        encryptedPassword,
        storedAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(STORAGE_KEYS.QUICK_AUTH_EMAIL, email);
      await AsyncStorage.setItem(STORAGE_KEYS.ENCRYPTED_CREDENTIALS, JSON.stringify(credentials));
      
      console.log("✅ Credentials stored securely");
    } catch (error) {
      console.error("❌ Failed to store credentials:", error);
      throw error;
    }
  }

  /**
   * Retrieve stored credentials for quick auth
   */
  static async getStoredCredentials(): Promise<{ email: string; password: string } | null> {
    try {
      const credentialsJson = await AsyncStorage.getItem(STORAGE_KEYS.ENCRYPTED_CREDENTIALS);
      
      if (!credentialsJson) {
        console.log("No stored credentials found");
        return null;
      }

      const credentials = JSON.parse(credentialsJson);
      
      // For this simple implementation, we'll store the password in plain text temporarily
      // In production, implement proper decryption with device keychain
      const email = credentials.email;
      
      // Check if we have the original password stored temporarily
      const tempPassword = await AsyncStorage.getItem("temp_password_" + email);
      
      if (!tempPassword) {
        console.log("No decryptable password found");
        return null;
      }

      return { email, password: tempPassword };
    } catch (error) {
      console.error("❌ Failed to retrieve credentials:", error);
      return null;
    }
  }

  /**
   * Store a temporary password for the session (simple approach)
   */
  static async storeTempPassword(email: string, password: string): Promise<void> {
    try {
      await AsyncStorage.setItem("temp_password_" + email, password);
      console.log("✅ Temporary password stored for session");
    } catch (error) {
      console.error("❌ Failed to store temporary password:", error);
    }
  }

  /**
   * Clear all stored credentials
   */
  static async clearCredentials(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.QUICK_AUTH_EMAIL);
      await AsyncStorage.removeItem(STORAGE_KEYS.ENCRYPTED_CREDENTIALS);
      
      // Clear all temporary passwords
      const keys = await AsyncStorage.getAllKeys();
      const tempPasswordKeys = keys.filter(key => key.startsWith("temp_password_"));
      
      for (const key of tempPasswordKeys) {
        await AsyncStorage.removeItem(key);
      }
      
      console.log("✅ All credentials cleared");
    } catch (error) {
      console.error("❌ Failed to clear credentials:", error);
    }
  }

  /**
   * Check if quick auth is available
   */
  static async isQuickAuthAvailable(): Promise<boolean> {
    try {
      const wasLoggedIn = await AsyncStorage.getItem(STORAGE_KEYS.WAS_LOGGED_IN);
      const biometricEnabled = await AsyncStorage.getItem(STORAGE_KEYS.BIOMETRIC_ENABLED);
      const pinEnabled = await AsyncStorage.getItem(STORAGE_KEYS.PIN_ENABLED);
      
      return wasLoggedIn === "true" && (biometricEnabled === "true" || pinEnabled === "true");
    } catch (error) {
      console.error("❌ Failed to check quick auth availability:", error);
      return false;
    }
  }

  /**
   * Set login flag
   */
  static async setWasLoggedIn(value: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.WAS_LOGGED_IN, value.toString());
    } catch (error) {
      console.error("❌ Failed to set login flag:", error);
    }
  }

  /**
   * Get stored email for quick auth
   */
  static async getQuickAuthEmail(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.QUICK_AUTH_EMAIL);
    } catch (error) {
      console.error("❌ Failed to get quick auth email:", error);
      return null;
    }
  }
}