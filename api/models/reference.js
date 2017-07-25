/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('reference', {
    reference_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    file: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    revision: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    length: {
      type: DataTypes.BIGINT,
      allowNull: true
    },
    seq_count: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: true
    },
    build_date: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'reference'
  });
};
