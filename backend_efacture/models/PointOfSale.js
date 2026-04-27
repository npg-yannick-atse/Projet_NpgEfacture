module.exports = (sequelize, DataTypes) => {
    const PointOfSale = sequelize.define('PointOfSale', {
        libelle: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        active: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        tableName: 'pointofsale',
        timestamps: false
    });

    return PointOfSale;
};
