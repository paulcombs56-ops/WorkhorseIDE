const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password || ""), salt, 120000, 32, "sha256").toString("hex");
}

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || "",
    role: user.role || "user",
    createdAt: user.createdAt,
  };
}

function createUserStore({ filePath }) {
  const usersFile = path.resolve(filePath);

  async function ensureFile() {
    try {
      await fsp.access(usersFile);
    } catch {
      await fsp.mkdir(path.dirname(usersFile), { recursive: true });
      await fsp.writeFile(usersFile, JSON.stringify({ users: [] }, null, 2), "utf8");
    }
  }

  async function readData() {
    await ensureFile();
    const raw = await fsp.readFile(usersFile, "utf8");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { users: [] };
    }

    if (!Array.isArray(parsed.users)) {
      parsed.users = [];
    }
    return parsed;
  }

  async function writeData(data) {
    await fsp.mkdir(path.dirname(usersFile), { recursive: true });
    await fsp.writeFile(usersFile, JSON.stringify(data, null, 2), "utf8");
  }

  async function findByEmail(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      return null;
    }
    const data = await readData();
    return data.users.find((user) => normalizeEmail(user.email) === normalized) || null;
  }

  async function findById(id) {
    const needle = String(id || "").trim();
    if (!needle) {
      return null;
    }
    const data = await readData();
    return data.users.find((user) => String(user.id) === needle) || null;
  }

  async function createUser({ email, password, name = "" }) {
    const normalizedEmail = normalizeEmail(email);
    const passwordText = String(password || "");
    const displayName = String(name || "").trim();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new Error("A valid email is required.");
    }

    if (passwordText.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const data = await readData();
    if (data.users.some((user) => normalizeEmail(user.email) === normalizedEmail)) {
      throw new Error("User already exists.");
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const user = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      name: displayName,
      role: "user",
      createdAt: new Date().toISOString(),
      passwordSalt: salt,
      passwordHash: hashPassword(passwordText, salt),
    };

    data.users.push(user);
    await writeData(data);
    return toPublicUser(user);
  }

  async function verifyCredentials({ email, password }) {
    const user = await findByEmail(email);
    if (!user) {
      return null;
    }

    const incomingHash = hashPassword(String(password || ""), String(user.passwordSalt || ""));
    if (incomingHash !== String(user.passwordHash || "")) {
      return null;
    }

    return toPublicUser(user);
  }

  async function getPublicById(id) {
    const user = await findById(id);
    return user ? toPublicUser(user) : null;
  }

  return {
    createUser,
    verifyCredentials,
    getPublicById,
  };
}

module.exports = {
  createUserStore,
};
