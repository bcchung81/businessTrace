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

/**
 * werkzeug scrypt 형식으로 비밀번호를 해시한다.
 * 이관 계정과 신규 계정이 한 컬럼을 공유하도록 레거시 Flask 와 같은 형식을 쓴다.
 */
export async function hashPassword(password: string) {
  const salt = generateSalt();
  const derived = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM);
  return `scrypt:${COST}:${BLOCK_SIZE}:${PARALLELISM}$${salt}$${derived}`;
}

/**
 * 저장된 해시와 비밀번호가 일치하는지 상수 시간으로 비교한다.
 * 형식이 깨졌거나 다른 알고리즘이면 예외 대신 false 를 돌려준다.
 */
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
