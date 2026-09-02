import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for withdrawal security");
  return createHash("sha256").update(secret).digest();
}

function base32Encode(value: Buffer): string {
  let bits = 0;
  let bitCount = 0;
  let output = "";
  for (const byte of value) {
    bits = (bits << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      output += BASE32[(bits >>> bitCount) & 31];
    }
  }
  if (bitCount > 0) output += BASE32[(bits << (5 - bitCount)) & 31];
  return output;
}

function base32Decode(value: string): Buffer {
  let bits = 0;
  let bitCount = 0;
  const output: number[] = [];
  for (const character of value.replace(/[\s=-]/g, "").toUpperCase()) {
    const index = BASE32.indexOf(character);
    if (index < 0) throw new Error("Invalid TOTP secret");
    bits = (bits << 5) | index;
    bitCount += 5;
    if (bitCount >= 8) {
      bitCount -= 8;
      output.push((bits >>> bitCount) & 255);
    }
  }
  return Buffer.from(output);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function createTotpUri(secret: string, email: string): string {
  const label = encodeURIComponent(`TS Commerce:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=TS%20Commerce&algorithm=SHA1&digits=6&period=30`;
}

export function verifyTotp(secret: string, input: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(input)) return false;
  const expected = Number(input);
  const counter = Math.floor(now / 1000 / TOTP_STEP_SECONDS);
  for (const offset of [-1, 0, 1]) {
    const digest = createHmac("sha1", base32Decode(secret))
      .update(Buffer.from(BigInt(counter + offset).toString(16).padStart(16, "0"), "hex"))
      .digest();
    const index = digest[digest.length - 1] & 15;
    const value =
      ((digest[index] & 127) << 24) |
      (digest[index + 1] << 16) |
      (digest[index + 2] << 8) |
      digest[index + 3];
    const code = value % 10 ** TOTP_DIGITS;
    const expectedBuffer = Buffer.from(String(expected).padStart(TOTP_DIGITS, "0"));
    const actualBuffer = Buffer.from(String(code).padStart(TOTP_DIGITS, "0"));
    if (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      return true;
    }
  }
  return false;
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(value: string): string {
  const [ivEncoded, tagEncoded, ciphertextEncoded] = value.split(".");
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) {
    throw new Error("Invalid encrypted withdrawal data");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivEncoded, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}