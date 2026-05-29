const {
  findAllByUser,
  findAll,
  findById,
  createHome,
  updateHome,
  deleteHome,
} = require("../models/Home");

const {
  createContact,
  getContactsByHome,
  deleteContactsByHome,
} = require("../models/HomeContact");

// ── GET ALL ───────────────────────────────────────────────────────────────────
// Caregivers → only their own homes
// Doctors    → ALL homes (so they can see every patient's plan + alerts)
const getAll = async (req, res) => {
  try {
    const isDoctor = req.user.role === "doctor";

    // Fetch homes — doctors get everything, caregivers get their own
    const homes = isDoctor
      ? await findAll()
      : await findAllByUser(req.user.id);

    // Attach contacts to each home
    const homesWithContacts = await Promise.all(
      homes.map(async (h) => {
        const contacts = await getContactsByHome(h.id);
        return { ...h, contacts };
      })
    );

    res.json(homesWithContacts);
  } catch (err) {
    console.error("[homeController] getAll:", err.message);
    res.status(500).json({ detail: "Failed to fetch homes." });
  }
};

// ── GET ONE ───────────────────────────────────────────────────────────────────
const getOne = async (req, res) => {
  try {
    const home = await findById(req.params.id, req.user.id);
    if (!home) return res.status(404).json({ detail: "Home not found." });
    const contacts = await getContactsByHome(home.id);
    res.json({ ...home, contacts });
  } catch (err) {
    res.status(500).json({ detail: "Failed to fetch home." });
  }
};

// ── CREATE ────────────────────────────────────────────────────────────────────
const create = async (req, res) => {
  try {
    const {
      name, location,
      doctor_name, doctor_email, doctor_phone,
      family_name, family_email, family_phone,
      medical_plan,
    } = req.body;

    if (!name) return res.status(400).json({ detail: "Home name is required." });

    const home = await createHome(name, location, req.user.id, medical_plan || null);

    if (doctor_name) await createContact(home.id, doctor_name, doctor_email, doctor_phone, "doctor");
    if (family_name) await createContact(home.id, family_name, family_email, family_phone, "family");

    const contacts = await getContactsByHome(home.id);
    res.status(201).json({ ...home, contacts });
  } catch (err) {
    console.error("[homeController] create:", err.message);
    res.status(500).json({ detail: err.message });
  }
};

// ── UPDATE ────────────────────────────────────────────────────────────────────
const update = async (req, res) => {
  try {
    const {
      name, location,
      doctor_name, doctor_email, doctor_phone,
      family_name, family_email, family_phone,
      medical_plan,
    } = req.body;

    const home = await updateHome(req.params.id, name, location, req.user.id, medical_plan || null);
    if (!home) return res.status(404).json({ detail: "Home not found." });

    await deleteContactsByHome(home.id);
    if (doctor_name) await createContact(home.id, doctor_name, doctor_email, doctor_phone, "doctor");
    if (family_name) await createContact(home.id, family_name, family_email, family_phone, "family");

    const contacts = await getContactsByHome(home.id);
    res.json({ ...home, contacts });
  } catch (err) {
    res.status(500).json({ detail: "Failed to update home." });
  }
};

// ── DELETE ────────────────────────────────────────────────────────────────────
const remove = async (req, res) => {
  try {
    const home = await deleteHome(req.params.id, req.user.id);
    if (!home) return res.status(404).json({ detail: "Home not found." });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ detail: "Failed to delete home." });
  }
};

module.exports = { getAll, getOne, create, update, remove };