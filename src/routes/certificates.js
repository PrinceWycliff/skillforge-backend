const express = require('express');
const router = express.Router();
const db = require('../config/db');
const PDFDocument = require('pdfkit');

router.get('/generate/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    const studentName = req.query.name || 'PRINCE DICKSON';

    // 1. Fetch course details from database
    let courseTitle = 'Certified Professional Course';
    try {
      const courseResult = await db.query('SELECT title FROM courses WHERE id = $1', [courseId]);
      if (courseResult.rows.length > 0 && courseResult.rows[0].title) {
        courseTitle = courseResult.rows[0].title;
      }
    } catch (dbErr) {
      console.warn('Could not fetch course title, falling back to default:', dbErr.message);
    }

    // 2. Initialize PDFKit document
    const doc = new PDFDocument({ layout: 'landscape', size: 'A4' });

    // Stream PDF directly to browser response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Skillforge_Certificate_${courseId}.pdf`);
    doc.pipe(res);

    // --- DRAW CERTIFICATE GRAPHICS & TEXT ---
    
    // Background frame / layout setup
    doc.rect(20, 20, 802, 555).stroke('#0f172a');
    
    // Title
    doc.fillColor('#00ffff').fontSize(28).text('SKILLFORGE', { align: 'center' });
    doc.moveDown(0.5);
    doc.fillColor('#ffffff').fontSize(22).text('CERTIFICATE OF COMPLETION', { align: 'center' });
    doc.moveDown(1);

    doc.fillColor('#cbd5e1').fontSize(12).text('This record hereby certifies that', { align: 'center' });
    doc.moveDown(0.5);

    // Student Name
    doc.fillColor('#00ffff').fontSize(26).text(studentName.toUpperCase(), { align: 'center' });
    doc.moveDown(1);

    doc.fillColor('#cbd5e1').fontSize(12).text('has successfully completed all modules and passed the mastery assessment for:', { align: 'center' });
    doc.moveDown(0.8);

    // Course Title (Displays real title instead of raw UUID)
    doc.fillColor('#ffffff').fontSize(22).text(courseTitle.toUpperCase(), { align: 'center' });

    // Finalize PDF
    doc.end();

  } catch (err) {
    console.error('Certificate Generation Error:', err);
    res.status(500).send('Error generating certificate PDF');
  }
});

module.exports = router;