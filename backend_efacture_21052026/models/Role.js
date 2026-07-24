module.exports = (sequelize, DataTypes) => {
    const Role = sequelize.define('Role', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        code: {
            type: DataTypes.STRING(60),
            allowNull: false,
            unique: true,
            comment: 'Code utilisé par le code applicatif (ex: fne.cancel_duplicate)'
        },
        label: {
            type: DataTypes.STRING(200),
            allowNull: false,
            comment: 'Libellé affiché dans l\'UI'
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'roles',
        timestamps: false
    });

    Role.associate = (models) => {
        Role.belongsToMany(models.Auth, {
            through: models.UserRole,
            foreignKey: 'role_id',
            otherKey: 'id_user',
            as: 'users'
        });
    };

    return Role;
};
