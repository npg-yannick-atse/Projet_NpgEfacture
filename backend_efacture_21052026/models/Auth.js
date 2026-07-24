module.exports = (sequelize, DataTypes) => {
    const Auth = sequelize.define('Auth', {
        id_user: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false
        },
        username: {
            type: DataTypes.STRING(100),
            allowNull: true,
            comment: 'Username LDAP pour affichage'
        },
        user_type: {
            type: DataTypes.ENUM('admin', 'utilisateur'),
            allowNull: false,
            defaultValue: 'utilisateur',
            comment: 'admin : accès Paramètres. utilisateur : accès aux rôles cochés uniquement.'
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            field: 'createdAt'
        }
    }, {
        tableName: 'auth',
        timestamps: false
    });

    Auth.associate = (models) => {
        Auth.belongsToMany(models.Role, {
            through: models.UserRole,
            foreignKey: 'id_user',
            otherKey: 'role_id',
            as: 'roles'
        });
    };

    return Auth;
};
