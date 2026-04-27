'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('logs_actions', 'invoice_type', {
      type: Sequelize.ENUM('invoice', 'refund'),
      allowNull: true,
      defaultValue: 'invoice',
      comment: 'Type de facture: invoice (facture normale) ou refund (avoir)'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('logs_actions', 'invoice_type');
  }
};

