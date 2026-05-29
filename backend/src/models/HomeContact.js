const pool = require("../config/db");

const createHomeContactsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS home_contacts (
      id         SERIAL PRIMARY KEY,
      home_id    INTEGER       REFERENCES homes(id) ON DELETE CASCADE,
      name       VARCHAR(100)  NOT NULL,
      email      VARCHAR(150),
      phone      VARCHAR(30),
      type       VARCHAR(20)   NOT NULL CHECK (type IN ('doctor','family')),
      created_at TIMESTAMP     DEFAULT NOW()
    );
  `);
  console.log("✅ Home contacts table ready");
};

const createContact = async (home_id, name, email, phone, type) => {
  const result = await pool.query(
    `INSERT INTO home_contacts (home_id, name, email, phone, type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [home_id, name, email || null, phone || null, type]
  );
  return result.rows[0];
};

const getContactsByHome = async (home_id) => {
  const result = await pool.query(
    "SELECT * FROM home_contacts WHERE home_id = $1 ORDER BY type, id",
    [home_id]
  );
  return result.rows;
};

const deleteContactsByHome = async (home_id) => {
  await pool.query("DELETE FROM home_contacts WHERE home_id = $1", [home_id]);
};

module.exports = {
  createHomeContactsTable,
  createContact,
  getContactsByHome,
  deleteContactsByHome,
};