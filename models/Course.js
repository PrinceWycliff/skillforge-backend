const db = require('../config/db');

const Course = {
  // 1. Fetch all published courses (newest first)
  findAll: async () => {
    const query = 'SELECT * FROM courses ORDER BY created_at DESC';
    const { rows } = await db.query(query);
    return rows;
  },

  // 2. Find a single course by its ID
  findById: async (id) => {
    const query = 'SELECT * FROM courses WHERE id = $1';
    const { rows } = await db.query(query, [id]);
    return rows[0] || null;
  },

  // 3. Create a new course track from Instructor Studio
  create: async ({ title, description, category, thumbnail }) => {
    const query = `
      INSERT INTO courses (title, description, category, thumbnail, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `;
    const values = [
      title,
      description,
      category || 'General',
      thumbnail || ''
    ];
    
    const { rows } = await db.query(query, values);
    return rows[0];
  },

  // 4. Update an existing course
  update: async (id, { title, description, category, thumbnail }) => {
    const query = `
      UPDATE courses 
      SET title = COALESCE($1, title),
          description = COALESCE($2, description),
          category = COALESCE($3, category),
          thumbnail = COALESCE($4, thumbnail)
      WHERE id = $5
      RETURNING *
    `;
    const values = [title, description, category, thumbnail, id];
    const { rows } = await db.query(query, values);
    return rows[0] || null;
  },

  // 5. Delete a course by ID
  delete: async (id) => {
    const query = 'DELETE FROM courses WHERE id = $1 RETURNING *';
    const { rows } = await db.query(query, [id]);
    return rows[0] || null;
  }
};

module.exports = Course;