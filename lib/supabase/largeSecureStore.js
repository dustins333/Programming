import "react-native-get-random-values";
import * as aesjs from "aes-js";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

// A Supabase session (JWT + refresh token + metadata) routinely exceeds
// expo-secure-store's ~2048-byte per-item limit (iOS Keychain constraint).
// So a single long-lived AES-256 key lives in SecureStore (generated once,
// reused after that); the session itself is AES-256-CTR encrypted with a
// fresh random nonce on every write and stored as one `nonce + ciphertext`
// blob in AsyncStorage.
//
// The key is deliberately NOT rotated on every write anymore (an earlier
// version of this file did: new random key each `setItem`, written to
// SecureStore, then the ciphertext written separately to AsyncStorage).
// That was two independent, sequential writes across two different storage
// backends with no atomicity between them — if the app was suspended by iOS
// between the two (routine, since this runs on every background token
// refresh), SecureStore ended up with the new key while AsyncStorage still
// held ciphertext encrypted under the old one. Supabase's own SDK treats
// any resulting decrypt/JSON-parse failure as "no session" silently, so
// this manifested as the user being signed out with no error and no
// warning, on a schedule tied to how often background refreshes landed
// mid-suspend. Keeping the key stable makes every `setItem` a single
// AsyncStorage write. The fresh per-write nonce (not a reused counter) is
// what keeps AES-CTR safe despite reusing the same key across writes —
// reusing (key, counter) together across two different plaintexts would
// leak their XOR.
const KEY_BYTES = 256 / 8;
const NONCE_BYTES = 16;

export class LargeSecureStore {
  async _getOrCreateKey(secureStoreKey) {
    const existing = await SecureStore.getItemAsync(secureStoreKey);
    if (existing) return aesjs.utils.hex.toBytes(existing);

    const newKey = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
    await SecureStore.setItemAsync(secureStoreKey, aesjs.utils.hex.fromBytes(newKey));
    return newKey;
  }

  async _encrypt(key, value) {
    const encryptionKey = await this._getOrCreateKey(key);
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(nonce));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    return aesjs.utils.hex.fromBytes(nonce) + aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  async _decrypt(key, value) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;

    // First NONCE_BYTES*2 hex chars are the nonce, the rest is ciphertext.
    // A value shorter than that is either corrupt or was written by the old
    // no-nonce-prefix format — either way, not decryptable, treat as absent.
    const nonceHex = value.slice(0, NONCE_BYTES * 2);
    const cipherHex = value.slice(NONCE_BYTES * 2);
    if (nonceHex.length !== NONCE_BYTES * 2 || !cipherHex) return null;

    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(aesjs.utils.hex.toBytes(nonceHex))
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(cipherHex));

    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return encrypted;

    try {
      return await this._decrypt(key, encrypted);
    } catch {
      // A key/ciphertext mismatch (leftover from the old format, or any
      // other corruption) decrypts to garbage rather than throwing a clean
      // "wrong key" error — matches Supabase's own storage-corruption
      // handling (see getItemAsync in @supabase/auth-js/lib/helpers.js):
      // treat as no stored session rather than propagating a decode error.
      return null;
    }
  }

  async removeItem(key) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }

  async setItem(key, value) {
    const encrypted = await this._encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }
}
