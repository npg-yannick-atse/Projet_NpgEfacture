module.exports = (sequelize, DataTypes) => {
    const UserRole = sequelize.define('UserRole', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        id_user: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        role_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        granted_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        granted_by: {
            type: DataTypes.STRING(100),
            allowNull: true
        }
    }, {
        tableName: 'user_roles',
        timestamps: false,
        indexes: [{ fields: ['id_user', 'role_id'], unique: true }]
    });

    return UserRole;
};
