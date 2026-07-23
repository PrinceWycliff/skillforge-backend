const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const QRCode = require('qrcode');

// GET /api/certificates/generate/:courseId
router.get('/generate/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    const userName = "Student Developer"; // Will pull dynamically from user session
    
    // Security Tokens & Serial Number
    const certHash = 'SF-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const verificationUrl = `https://skillforge.dev/verify/${certHash}`;
    const issueDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Generate QR Code Buffer
    const qrBuffer = await QRCode.toBuffer(verificationUrl, {
      margin: 1,
      width: 90,
      color: { dark: '#0B1130', light: '#FFFFFF' }
    });

    const doc = new PDFDocument({
      layout: 'landscape',
      size: 'A4',
      margin: 0
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Skillforge_Certificate_${certHash}.pdf`);
    doc.pipe(res);

    // --- SKILLFORGE COLOR PALETTE ---
    const BG_DARK = '#0B1130';      // Deep Midnight Navy
    const CYAN_ACCENT = '#34E0D8';  // Electric Cyan
    const BLUE_ACCENT = '#2546F0';  // Platform Primary Blue
    const TEXT_WHITE = '#FFFFFF';   // High-Contrast White
    const TEXT_MUTED = '#94A3B8';   // Slate Muted Gray
    const SUCCESS_GREEN = '#1FC98D';// Mastery Green

    // Background Base
    doc.rect(0, 0, 842, 595).fill(BG_DARK);

    // Top-Left Platform Curved Swooshes (Skillforge Theme)
    doc.save()
       .moveTo(0, 0)
       .lineTo(550, 0)
       .bezierCurveTo(380, 80, 180, 110, 0, 160)
       .closePath()
       .fill(BLUE_ACCENT);

    doc.moveTo(0, 110)
       .bezierCurveTo(220, 90, 380, 70, 570, 0)
       .lineTo(600, 0)
       .bezierCurveTo(400, 80, 220, 110, 0, 130)
       .closePath()
       .fill(CYAN_ACCENT);
    doc.restore();

    // Outer Cyan Security Border
    doc.rect(20, 20, 802, 555).lineWidth(1.5).stroke(CYAN_ACCENT);
    doc.rect(25, 25, 792, 545).lineWidth(0.5).stroke(BLUE_ACCENT);

    // --- 1. PLATFORM BRANDING (VERY CLEAR AT TOP) ---
    doc.fillColor(CYAN_ACCENT)
       .fontSize(36)
       .font('Helvetica-Bold')
       .text('SKILLFORGE', 0, 105, { align: 'center' });

    // --- 2. CERTIFICATE TITLE ---
    doc.fillColor(TEXT_WHITE)
       .fontSize(22)
       .font('Helvetica-Bold')
       .text('CERTIFICATE OF COMPLETION', 0, 152, { align: 'center' });

    // Subtitle
    doc.fillColor(TEXT_MUTED)
       .fontSize(12)
       .font('Helvetica')
       .text('This record hereby certifies that', 0, 195, { align: 'center' });

    // --- RECIPIENT NAME ---
    doc.fillColor(CYAN_ACCENT)
       .fontSize(32)
       .font('Times-BoldItalic')
       .text(userName, 0, 225, { align: 'center' });

    // Name Underline Accent
    doc.moveTo(271, 268).lineTo(571, 268).lineWidth(1).stroke(BLUE_ACCENT);

    // Description text
    doc.fillColor(TEXT_MUTED)
       .fontSize(12)
       .font('Helvetica')
       .text('has successfully completed all modules and passed the mastery assessment for:', 0, 285, { align: 'center' });

    // --- 3. COURSE NAME (PROMINENTLY DISPLAYED) ---
    const formattedCourseName = courseId.toUpperCase().replace(/-/g, ' ');

    doc.fillColor(TEXT_WHITE)
       .fontSize(22)
       .font('Helvetica-Bold')
       .text(formattedCourseName, 120, 315, { align: 'center', width: 602 });

    // Decorative Course Underline Bar
    doc.rect(341, 350, 160, 2).fill(CYAN_ACCENT);

    // --- 4. EMBOSSED SEAL & CEO DETAILS ---

    // Left Side: Verified Badge Seal
    const sealX = 220;
    const sealY = 445;

    doc.circle(sealX, sealY, 32).lineWidth(2).stroke(CYAN_ACCENT);
    doc.circle(sealX, sealY, 28).fill(BLUE_ACCENT);
    doc.fillColor(TEXT_WHITE)
       .fontSize(9)
       .font('Helvetica-Bold')
       .text('SKILLFORGE', sealX - 30, sealY - 10, { width: 60, align: 'center' })
       .text('VERIFIED', sealX - 30, sealY + 3, { width: 60, align: 'center' });

    // Right Side: CEO Section (Pure Text Display)
    const ceoX = 520;
    const ceoY = 420;

    // Divider Line above CEO name
    doc.moveTo(ceoX, ceoY + 20).lineTo(ceoX + 180, ceoY + 20).lineWidth(1).stroke(TEXT_MUTED);

    // CEO Name
    doc.fillColor(TEXT_WHITE)
       .fontSize(14)
       .font('Helvetica-Bold')
       .text('Prince Dickson', ceoX, ceoY + 28, { width: 180, align: 'center' });

    // CEO Title
    doc.fillColor(CYAN_ACCENT)
       .fontSize(10)
       .font('Helvetica')
       .text('Chief Executive Officer, Skillforge', ceoX, ceoY + 45, { width: 180, align: 'center' });

    // --- FOOTER & QR VERIFICATION ---
    doc.image(qrBuffer, 715, 465, { width: 75, height: 75 });

    doc.fillColor(TEXT_MUTED)
       .fontSize(8)
       .font('Helvetica')
       .text(`Serial No: ${certHash}`, 35, 530)
       .text(`Issued Date: ${issueDate}`, 35, 542)
       .text(`Status: VERIFIED & ISSUED`, 35, 554);

    doc.end();

  } catch (err) {
    console.error('Certificate generation error:', err);
    res.status(500).send('Error generating certificate');
  }
});

module.exports = router;