const pool = require('../config/database');
const bcrypt = require('bcrypt');

// Helper to convert image buffer to base64 string
const processUserImage = (user) => {
    if (!user) return null;
    return {
        ...user,
        image: user.image ? user.image.toString('base64') : null
    };
};

// Get all users (with pagination and search)
const getUsers = async (req, res) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        let query = 'FROM people p LEFT JOIN roles r ON p.role = r.id WHERE p.visible = true';
        let params = [];
        let paramIdx = 1;

        if (search) {
            query += ` AND (p.name ILIKE $${paramIdx} OR p.card ILIKE $${paramIdx})`;
            params.push(`%${search}%`);
            paramIdx++;
        }

        // Count total
        const countResult = await pool.query(`SELECT COUNT(*) ${query}`, params);
        const total = parseInt(countResult.rows[0].count);

        // Fetch data
        const dataQuery = `
            SELECT p.id, p.name, p.card, p.role, p.visible, p.image,
                   r.name as role_name
            ${query}
            ORDER BY p.name
            LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `;

        const result = await pool.query(dataQuery, [...params, limit, offset]);
        const users = result.rows.map(processUserImage);

        res.json({
            data: users,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching users',
            error: error.message
        });
    }
};

// Get user by ID
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT p.id, p.name, p.card, p.role, p.visible, p.image,
                   r.name as role_name
            FROM people p
            LEFT JOIN roles r ON p.role = r.id
            WHERE p.id = $1
        `;
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json(processUserImage(result.rows[0]));
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user',
            error: error.message
        });
    }
};

// Create new user
const createUser = async (req, res) => {
    try {
        const { name, role, card, password, image } = req.body;

        if (!name || !role) {
            return res.status(400).json({
                success: false,
                message: 'Name and Role are required'
            });
        }

        // Check if user name exists (and is visible)
        const checkQuery = 'SELECT id FROM people WHERE name = $1 AND visible = true';
        const checkResult = await pool.query(checkQuery, [name]);
        if (checkResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Username already exists'
            });
        }

        let hashedPassword = null;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        // Convert base64 string back to buffer for storage if needed
        // But pg can often handle hex string or bytea format. 
        // Best to send Buffer.
        const imageBuffer = image ? Buffer.from(image, 'base64') : null;

        const query = `
            INSERT INTO people (name, role, card, apppassword, visible, image)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, name, role, card, visible, image
        `;

        const result = await pool.query(query, [
            name, role, card, hashedPassword, true, imageBuffer
        ]);

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: processUserImage(result.rows[0])
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating user',
            error: error.message
        });
    }
};

// Update user
const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, card, image } = req.body;

        if (!name || !role) {
            return res.status(400).json({
                success: false,
                message: 'Name and Role are required'
            });
        }

        const imageBuffer = image ? Buffer.from(image, 'base64') : null;

        const query = `
            UPDATE people 
            SET name = $1, role = $2, card = $3, image = $4
            WHERE id = $5
            RETURNING id, name, role, card, visible, image
        `;

        const result = await pool.query(query, [name, role, card, imageBuffer, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User updated successfully',
            data: processUserImage(result.rows[0])
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating user',
            error: error.message
        });
    }
};

// Change user password (admin)
const changeUserPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Password is required'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const query = 'UPDATE people SET apppassword = $1 WHERE id = $2';
        await pool.query(query, [hashedPassword, id]);

        res.json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({
            success: false,
            message: 'Error changing password',
            error: error.message
        });
    }
};

// Delete user (Soft delete)
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        const query = 'UPDATE people SET visible = false WHERE id = $1 RETURNING id';
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting user',
            error: error.message
        });
    }
};

module.exports = {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    changeUserPassword,
    deleteUser
};
