import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SALT_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateSalt() {
  return Array.from(randomBytes(SALT_LENGTH), (byte) => SALT_ALPHABET[byte % SALT_ALPHABET.length]).join("");
}

async function derive(password: string, salt: string, cost: number, blockSize: number, parallelism: number) {
  const key = await scrypt(password, salt, KEY_LENGTH, {
    N: cost,
    r: blockSize,
    p: parallelism,
    maxmem: 128 * cost * blockSize * 2,
  });
  return key.toString("hex");
}

export async function hashPassword(password: string) {
  const salt = generateSalt();
  const derived = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM);
  return `scrypt:${COST}:${BLOCK_SIZE}:${PARALLELISM}$${salt}$${derived}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [method, salt, expected] = stored.split("$");
  if (!method || !salt || !expected) return false;

  const [algorithm, cost, blockSize, parallelism] = method.split(":");
  if (algorithm !== "scrypt") return false;
  if (!/^\d+$/.test(cost) || !/^\d+$/.test(blockSize) || !/^\d+$/.test(parallelism)) return false;
  if (!/^[0-9a-f]+$/.test(expected)) return false;

  try {
    const derived = await derive(password, salt, Number(cost), Number(blockSize), Number(parallelism));
    const a = Buffer.from(derived, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
