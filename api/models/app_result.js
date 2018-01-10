/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('app_result', {
    app_result_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    app_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false
    },
    app_data_type_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false
    },
    path: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    tableName: 'app_result'
  });
};
