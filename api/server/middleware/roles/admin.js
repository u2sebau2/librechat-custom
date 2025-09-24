const { SystemRoles } = require('librechat-data-provider');

function checkAdmin(req, res, next) {
  try {
    console.log('=== Admin Middleware Debug ===');
    console.log('req.user exists:', !!req.user);
    console.log('req.user.role:', req.user?.role);
    console.log('SystemRoles.ADMIN:', SystemRoles.ADMIN);
    console.log('Role comparison:', req.user?.role === SystemRoles.ADMIN);
    console.log('typeof user.role:', typeof req.user?.role);
    console.log('typeof SystemRoles.ADMIN:', typeof SystemRoles.ADMIN);
    
    // Verificar que el usuario esté autenticado
    if (!req.user) {
      console.log('❌ User not authenticated');
      return res.status(401).json({ message: 'Unauthorized - User not authenticated' });
    }
    
    // Verificar que el usuario sea admin (flexible check)
    const userRole = req.user.role;
    const isAdmin = userRole === SystemRoles.ADMIN || userRole === 'ADMIN';
    
    if (!isAdmin) {
      console.log('❌ User is not admin:', req.user.role, 'vs', SystemRoles.ADMIN);
      return res.status(403).json({ message: 'Forbidden - Admin role required' });
    }
    
    console.log('✅ Admin access granted');
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

module.exports = checkAdmin;
