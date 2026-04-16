# ══════════════════════════════════════════════════════════════════════════════
# Backend - Production Health Check Endpoint
# أضف هذا المسار إلى server.js إذا لم يكن موجود
# ══════════════════════════════════════════════════════════════════════════════

// Health check endpoint (add this before the main routes in server.js)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
