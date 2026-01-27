const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Helper to parse Java XML permissions to clean keys
const parsePermissions = (permissionsBuffer) => {
    if (!permissionsBuffer) return [];
    const xml = permissionsBuffer.toString('utf-8');
    const permissions = [];

    // Simple regex to extract class names from <class name="..."/>
    const regex = /<class\s+name="([^"]+)"\s*\/>/g;
    let match;

    const mapping = {
        'com.openbravo.pos.sales.JPanelTicketSales': 'sales',
        'com.openbravo.pos.sales.JPanelTicketEdits': 'sales.edit',
        'com.openbravo.pos.inventory.ProductsPanel': 'inventory.products',
        'com.openbravo.pos.inventory.CategoriesPanel': 'inventory.categories',
        'com.openbravo.pos.inventory.TaxPanel': 'inventory.taxes',
        'com.openbravo.pos.admin.PeoplePanel': 'system.users',
        'com.openbravo.pos.admin.RolesPanel': 'system.roles',
        'com.openbravo.pos.panels.JPanelCloseMoney': 'sales.close_cash',
        'com.openbravo.pos.sales.JPanelTicketSales$JPanelTicketSalesHistory': 'sales.history',
        // New mappings
        'com.openbravo.pos.admin.HabladoresPanel': 'admin.habladores',
        'com.openbravo.pos.inventory.BulkPriceChange': 'inventory.bulk_price_change',
        'com.openbravo.pos.inventory.KitsPanel': 'inventory.kits',
        'com.openbravo.pos.inventory.CompoundsPanel': 'inventory.compounds',
        'com.openbravo.pos.admin.CxCPanel': 'admin.cxc',
        'com.openbravo.pos.admin.CxPPanel': 'admin.cxp',
        'com.openbravo.pos.admin.ExpensesPanel': 'admin.expenses',
        'com.openbravo.pos.config.JPanelConfiguration': 'system.config',
        'com.openbravo.pos.panels.JPanelPrinter': 'system.printers'
    };

    while ((match = regex.exec(xml)) !== null) {
        const className = match[1];
        if (mapping[className]) {
            permissions.push(mapping[className]);
        } else {
            // If not in mapping, add raw or ignored? 
            // For now, let's add as is or prefix it to know
            permissions.push(`raw:${className}`);
        }
    }

    return [...new Set(permissions)]; // Unique
};

// Login
const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validate input
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        // Get user from database with role information
        const query = `
      SELECT p.id, p.name, p.apppassword, p.card, p.role, p.visible, p.image,
            r.id as role_id, r.name as role_name, r.permissions
      FROM people p
      LEFT JOIN roles r ON p.role = r.id
      WHERE p.name = $1 AND p.visible = true
    `;

        const result = await pool.query(query, [username]);

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const user = result.rows[0];

        // Check if user has password
        if (!user.apppassword) {
            return res.status(401).json({
                success: false,
                message: 'User has no password configured'
            });
        }

        // Compare password
        const isValidPassword = await bcrypt.compare(password, user.apppassword);

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Parse permissions
        let permissionKeys = parsePermissions(user.permissions);

        // Grant all permissions if the role is Administrator or Administrador
        if (user.role_name === 'Administrator' || user.role_name === 'Administrador') {
            permissionKeys = ['*'];
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: user.id,
                name: user.name,
                role: user.role_name,
                role_id: user.role_id,
                permissions: permissionKeys
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE }
        );

        // Return user data without password
        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    role: user.role_name,
                    role_id: user.role_id,
                    permissions: permissionKeys,
                    image: user.image ? user.image.toString('base64') : null
                }
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login',
            error: error.message
        });
    }
};

// Change Password
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters long'
            });
        }

        // Get current user
        const userQuery = 'SELECT apppassword FROM people WHERE id = $1';
        const userResult = await pool.query(userQuery, [userId]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = userResult.rows[0];

        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, user.apppassword);

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        const updateQuery = 'UPDATE people SET apppassword = $1 WHERE id = $2';
        await pool.query(updateQuery, [hashedPassword, userId]);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while changing password',
            error: error.message
        });
    }
};

// Forgot Password (Reset password to default or send email)
const forgotPassword = async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({
                success: false,
                message: 'Username is required'
            });
        }

        // Check if user exists
        const userQuery = 'SELECT id, name FROM people WHERE name = $1 AND visible = true';
        const userResult = await pool.query(userQuery, [username]);

        if (userResult.rows.length === 0) {
            // For security, don't reveal if user exists
            return res.json({
                success: true,
                message: 'If the user exists, a password reset has been initiated'
            });
        }

        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        // Update password
        const updateQuery = 'UPDATE people SET apppassword = $1 WHERE id = $2';
        await pool.query(updateQuery, [hashedPassword, userResult.rows[0].id]);

        // In production, you would send this via email
        // For now, we'll return it (NOT SECURE FOR PRODUCTION)
        res.json({
            success: true,
            message: 'Temporary password generated',
            data: {
                temporaryPassword: tempPassword,
                note: 'In production, this would be sent via email'
            }
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during password reset',
            error: error.message
        });
    }
};

// Verify Token
const verifyToken = async (req, res) => {
    res.json({
        success: true,
        message: 'Token is valid',
        data: {
            user: req.user
        }
    });
};

// Get User Profile
const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        const query = `
      SELECT p.id, p.name, p.card, p.visible, p.image,
             r.id as role_id, r.name as role_name, r.permissions
      FROM people p
      LEFT JOIN roles r ON p.role = r.id
      WHERE p.id = $1
    `;

        const result = await pool.query(query, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: {
                user: result.rows[0]
            }
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching profile',
            error: error.message
        });
    }
};

const protect = (req, res, next) => {
    const token = req.header('Authorization');

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.'
        });
    }

    try {
        const tokenString = token.startsWith('Bearer ') ? token.slice(7, token.length) : token;
        const decoded = jwt.verify(tokenString, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
};

module.exports = {
    login,
    changePassword,
    forgotPassword,
    verifyToken,
    getProfile,
    protect
};
