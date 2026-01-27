const pool = require('../config/database');

// Get all roles
const getRoles = async (req, res) => {
    try {
        const { page, limit } = req.query;

        // If no pagination params, return all as array (for dropdowns)
        if (!page && !limit) {
            const query = 'SELECT * FROM roles ORDER BY name';
            const result = await pool.query(query);
            const roles = result.rows.map(role => ({
                ...role,
                permissions: role.permissions ? role.permissions.toString('utf-8') : ''
            }));
            return res.json(roles);
        }

        // With pagination
        const p = parseInt(page) || 1;
        const l = parseInt(limit) || 10;
        const offset = (p - 1) * l;

        const countResult = await pool.query('SELECT COUNT(*) FROM roles');
        const total = parseInt(countResult.rows[0].count);

        const query = 'SELECT * FROM roles ORDER BY name LIMIT $1 OFFSET $2';
        const result = await pool.query(query, [l, offset]);

        const roles = result.rows.map(role => ({
            ...role,
            permissions: role.permissions ? role.permissions.toString('utf-8') : ''
        }));

        res.json({
            data: roles,
            total,
            page: p,
            totalPages: Math.ceil(total / l)
        });
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching roles',
            error: error.message
        });
    }
};

// Get role by ID
const getRoleById = async (req, res) => {
    try {
        const { id } = req.params;
        const query = 'SELECT * FROM roles WHERE id = $1';
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        const role = result.rows[0];
        role.permissions = role.permissions ? role.permissions.toString('utf-8') : '';

        res.json(role);
    } catch (error) {
        console.error('Error fetching role:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching role',
            error: error.message
        });
    }
};

// Create new role
const createRole = async (req, res) => {
    try {
        const { name, permissions } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Role name is required'
            });
        }

        // Permissions stored as bytea
        const permissionsBuffer = permissions ? Buffer.from(permissions, 'utf-8') : null;

        const query = 'INSERT INTO roles (name, permissions) VALUES ($1, $2) RETURNING *';
        const result = await pool.query(query, [name, permissionsBuffer]);

        const role = result.rows[0];
        role.permissions = role.permissions ? role.permissions.toString('utf-8') : '';

        res.status(201).json({
            success: true,
            message: 'Role created successfully',
            data: role
        });
    } catch (error) {
        console.error('Error creating role:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating role',
            error: error.message
        });
    }
};

// Update role
const updateRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, permissions } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Role name is required'
            });
        }

        const permissionsBuffer = permissions ? Buffer.from(permissions, 'utf-8') : null;

        const query = 'UPDATE roles SET name = $1, permissions = $2 WHERE id = $3 RETURNING *';
        const result = await pool.query(query, [name, permissionsBuffer, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        const role = result.rows[0];
        role.permissions = role.permissions ? role.permissions.toString('utf-8') : '';

        res.json({
            success: true,
            message: 'Role updated successfully',
            data: role
        });
    } catch (error) {
        console.error('Error updating role:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating role',
            error: error.message
        });
    }
};

// Delete role
const deleteRole = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if role is used by any user
        const checkQuery = 'SELECT COUNT(*) FROM people WHERE role = $1';
        const checkResult = await pool.query(checkQuery, [id]);

        if (parseInt(checkResult.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete role because it is assigned to users'
            });
        }

        const query = 'DELETE FROM roles WHERE id = $1 RETURNING *';
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        res.json({
            success: true,
            message: 'Role deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting role:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting role',
            error: error.message
        });
    }
};

module.exports = {
    getRoles,
    getRoleById,
    createRole,
    updateRole,
    deleteRole
};
