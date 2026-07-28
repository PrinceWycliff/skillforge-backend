// 5. Direct POST /api/courses
app.post('/api/courses', async (req, res) => {
  try {
    const { title, description, category } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Title is required.' });
    }

    // Generate a unique string ID since the 'id' column is TEXT/VARCHAR
    const generatedId = `course_${Date.now()}`;

    const query = `
      INSERT INTO courses (id, title, description, category)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [generatedId, title, description || '', category || 'Web Development'];

    const result = await db.query(query, values);

    res.status(201).json({
      success: true,
      message: 'Course published successfully!',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Database Error:', err);
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});