module.exports = (sequelize, DataTypes) => {
    const InvoiceType = sequelize.define('InvoiceType', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        code: {
            type: DataTypes.STRING(60),
            allowNull: false,
            unique: true
        },
        label: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        icon_name: {
            type: DataTypes.STRING(50),
            allowNull: true,
            comment: 'Nom de l\'icône MUI (ex: Storefront)'
        },
        color_hex: {
            type: DataTypes.STRING(10),
            allowNull: true,
            defaultValue: '#1976d2'
        },
        display_order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 100
        },
        active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'invoice_types',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return InvoiceType;
};
