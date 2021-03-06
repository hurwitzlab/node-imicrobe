/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('app', {
    app_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    app_name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    is_maintenance: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    provider_name: {
      type: DataTypes.STRING(50),
      allowNull: true
    }
  }, {
    tableName: 'app'
  });
};
